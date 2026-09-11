import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * 最小化的安全 ZIP 读取器（导入宠物包用，只读）。
 *
 * 只支持解压 method 0（store）与 8（deflate）的普通文件条目，足够覆盖
 * 常见打包工具。防护：
 *   - 绝对路径 / 盘符路径 / `..` 逃逸（逐个条目规范化后复查）
 *   - 符号链接与其他非普通文件条目（Unix mode / 外部属性）
 *   - 重复目标（大小写不敏感归一后重复也拒绝）
 *   - 异常膨胀：条目数上限、总解压大小上限、单文件压缩率上限
 *   - 损坏结构：EOCD 找不到、中央目录越界、CRC 不符、解压长度不符
 *
 * 所有错误为中文。本模块不引入第三方依赖（避免供应链面）。
 */

export interface ZipEntry {
  /** 规范化后的相对路径（posix 分隔符）。 */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  crc32: number;
  /** 数据在 ZIP 文件内的绝对偏移（local header 起始）。 */
  localHeaderOffset: number;
}

export interface ZipReadResult {
  entries: ZipEntry[];
}

export interface ZipLimits {
  maxEntries: number;
  maxTotalUncompressed: number;
  maxSingleUncompressed: number;
  maxCompressionRatio: number;
}

export const ZIP_LIMITS: ZipLimits = {
  maxEntries: 256,
  maxTotalUncompressed: 128 * 1024 * 1024, // 128 MB
  maxSingleUncompressed: 64 * 1024 * 1024, // 64 MB
  maxCompressionRatio: 100,
} as const;

/** 导出产物核验用的放宽限制（内含 ~186MB 的 Electron EXE 是合法的）。 */
export const ZIP_LIMITS_RELAXED: ZipLimits = {
  maxEntries: 100000,
  maxTotalUncompressed: 2048 * 1024 * 1024,
  maxSingleUncompressed: 512 * 1024 * 1024,
  maxCompressionRatio: 100,
} as const;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
/** EOCD 最大搜索范围：结构 22 字节 + 最长注释 65535 字节。 */
const EOCD_MAX_BACK = 22 + 65535;

function err(message: string): Error {
  return new Error(message);
}

/** 列出 ZIP 的条目并做全部结构性安全检查；不合法直接抛中文异常。 */
export function inspectZip(buf: Buffer, limits: ZipLimits = ZIP_LIMITS): ZipReadResult {
  // 1. 找 EOCD（从尾部向前扫）
  let eocdAt = -1;
  const start = Math.max(0, buf.length - EOCD_MAX_BACK);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdAt = i; break; }
  }
  if (eocdAt < 0) throw err('ZIP 结构损坏：找不到结尾目录（EOCD），文件可能不是 ZIP 或已损坏');

  const entryCount = buf.readUInt16LE(eocdAt + 10);
  const centralSize = buf.readUInt32LE(eocdAt + 12);
  const centralOffset = buf.readUInt32LE(eocdAt + 16);
  if (entryCount === 0) throw err('ZIP 是空的：里面没有任何文件');
  if (entryCount > limits.maxEntries) {
    throw err(`ZIP 条目过多：${entryCount} 个（上限 ${limits.maxEntries}，宠物包不应包含这么多文件）`);
  }
  if (centralOffset + centralSize > buf.length || centralOffset + centralSize > eocdAt) {
    throw err('ZIP 结构损坏：中央目录越界');
  }

  // 2. 逐个解析中央目录
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let totalUncompressed = 0;
  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw err(`ZIP 结构损坏：第 ${i + 1} 个条目的中央目录头无效`);
    }
    const method = buf.readUInt16LE(p + 10);
    const crc32 = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const nameRaw = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    const name = normalizeEntryName(nameRaw);

    // Unix 符号链接 / 特殊文件：外部属性高 16 bit 是 st_mode
    const unixMode = (externalAttr >>> 16) & 0xffff;
    const fileType = unixMode & 0o170000;
    if (unixMode !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
      throw err(`ZIP 包含符号链接或特殊文件（已阻止）：${nameRaw}`);
    }

    const isDir = nameRaw.endsWith('/') || fileType === 0o040000;
    if (!isDir) {
      // 膨胀检查
      if (uncompressedSize > limits.maxSingleUncompressed) {
        throw err(`ZIP 条目过大：${name} 解压后 ${uncompressedSize} 字节，超过单文件上限`);
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > limits.maxTotalUncompressed) {
        throw err(`ZIP 解压总量超过上限（${Math.round(limits.maxTotalUncompressed / 1024 / 1024)}MB），疑似压缩炸弹`);
      }
      if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
        throw err(`ZIP 条目压缩率异常（${name}：${uncompressedSize}/${compressedSize}），疑似压缩炸弹`);
      }
      if (method !== 0 && method !== 8) {
        throw err(`ZIP 条目使用不支持的压缩方式（method=${method}）：${name}`);
      }
      // 重复目标（大小写不敏感，防止 Windows 上互相覆盖）
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw err(`ZIP 包含重复条目：${name}（重复目标可能导致覆盖）`);
      }
      seen.add(key);
      entries.push({ name, compressedSize, uncompressedSize, method, crc32, localHeaderOffset });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries };
}

/** 规范化条目路径并拒绝逃逸。返回 posix 风格相对路径。 */
function normalizeEntryName(raw: string): string {
  if (raw.includes('\0')) throw err(`ZIP 条目路径包含 NUL 字符：${JSON.stringify(raw)}`);
  const unified = raw.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:\//.test(unified)) {
    throw err(`ZIP 条目使用绝对路径（已阻止）：${raw}`);
  }
  const parts: string[] = [];
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') throw err(`ZIP 条目包含 .. 逃逸（已阻止）：${raw}`);
    parts.push(seg);
  }
  if (parts.length === 0) throw err(`ZIP 条目路径为空：${JSON.stringify(raw)}`);
  return parts.join('/');
}

/** 读取并解压一个条目，校验 CRC 与长度。 */
export async function readZipEntry(buf: Buffer, entry: ZipEntry, limits: ZipLimits = ZIP_LIMITS): Promise<Buffer> {
  const off = entry.localHeaderOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOCAL_SIG) {
    throw err(`ZIP 结构损坏：条目 ${entry.name} 的本地文件头无效`);
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) {
    throw err(`ZIP 结构损坏：条目 ${entry.name} 数据越界`);
  }
  const raw = buf.subarray(dataStart, dataEnd);
  let data: Buffer;
  if (entry.method === 0) {
    data = Buffer.from(raw);
  } else {
    try {
      data = zlib.inflateRawSync(raw, { maxOutputLength: limits.maxSingleUncompressed });
    } catch {
      throw err(`ZIP 条目解压失败：${entry.name}（数据损坏）`);
    }
  }
  if (data.length !== entry.uncompressedSize) {
    throw err(`ZIP 条目解压长度不符：${entry.name}（期望 ${entry.uncompressedSize}，实际 ${data.length}）`);
  }
  if (crc32(data) !== entry.crc32) {
    throw err(`ZIP 条目 CRC 校验失败：${entry.name}（文件已损坏）`);
  }
  return data;
}

/** 读取 ZIP 文件内容并返回经过安全检查的条目表。 */
export async function inspectZipFile(file: string): Promise<{ buf: Buffer; entries: ZipEntry[] }> {
  const buf = await fs.readFile(file);
  return { buf, entries: inspectZip(buf).entries };
}

/**
 * 从 ZIP 中安全提取宠物包到临时目录（调用方负责清理）。
 * 只提取 pet.json、图集图片与经典 Shimeji actions/behaviors XML，
 * 其余条目不落盘（白名单）。
 * 返回提取出的文件相对路径列表。
 */
export async function extractPetPackFromZip(zipFile: string, destDir: string): Promise<string[]> {
  const { buf, entries } = await inspectZipFile(zipFile);
  // 允许包内容在 ZIP 的某个单一顶层子目录里（常见打包习惯）。
  const picked = entries.filter((e) => {
    const base = path.posix.basename(e.name).toLowerCase();
    return base === 'pet.json'
      || base.endsWith('.png')
      || base.endsWith('.webp')
      || base === 'actions.xml'
      || base === 'behaviors.xml'
      || base === 'behavior.xml';
  });
  if (picked.length === 0) {
    throw err('ZIP 里没有找到宠物包内容：需要 Petdex 文件或经典 Shimeji 图片与 XML');
  }
  // 顶层前缀：所有被选条目共享的唯一首段目录（如果有）。
  const firstSegs = new Set(picked.map((e) => e.name.split('/')[0]));
  const stripPrefix = firstSegs.size === 1 && picked.every((e) => e.name.includes('/'))
    ? `${[...firstSegs][0]!}/`
    : '';
  const written: string[] = [];
  for (const entry of picked) {
    const rel = stripPrefix && entry.name.startsWith(stripPrefix)
      ? entry.name.slice(stripPrefix.length)
      : entry.name;
    if (!rel || rel.includes('..')) continue;
    // 目标必须仍是一层文件名（防 zip 里嵌套目录伪装）
    const target = path.join(destDir, rel);
    const realDest = path.resolve(destDir);
    const realTarget = path.resolve(target);
    if (realTarget !== realDest && !realTarget.startsWith(realDest + path.sep)) {
      throw err(`ZIP 条目目标越界（已阻止）：${entry.name}`);
    }
    const data = await readZipEntry(buf, entry);
    await fs.mkdir(path.dirname(realTarget), { recursive: true });
    await fs.writeFile(realTarget, data);
    written.push(rel);
  }
  const basenames = written.map((file) => path.posix.basename(file).toLowerCase());
  const hasPetdex = basenames.includes('pet.json');
  const hasClassic = basenames.includes('actions.xml')
    && (basenames.includes('behaviors.xml') || basenames.includes('behavior.xml'))
    && basenames.some((name) => name.endsWith('.png'));
  if (!hasPetdex && !hasClassic) {
    throw err('ZIP 里缺少 pet.json，且不是完整的经典 Shimeji 包');
  }
  return written;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
