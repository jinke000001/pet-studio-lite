import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Petdex 宠物包（目录形式）的只读校验与加载。
 *
 * 包结构：
 *   <pack-dir>/
 *     pet.json              — 必填：spritesheetPath；可选：id / displayName /
 *                             spriteVersionNumber（真实版本字段，version 为
 *                             兼容别名）/ license / description
 *     spritesheet.png|webp  — 图集，尺寸决定版本：
 *       v1: 8 列 × 9 行，单格 192×208，整图 1536×1872
 *       v2: 8 列 × 11 行，单格 192×208，整图 1536×2288
 *
 * 本模块全程只读，绝不修改输入包。所有错误信息为中文，供制作台直接展示。
 * 图像可解码性通过可注入的 probe 校验（默认只解析文件头；Electron main 中
 * 注入基于 sharp 的真实解码探针，见 src/main/image-probe.ts）。
 */

export const PETDEX_COLS = 8;
export const PETDEX_FRAME = { width: 192, height: 208 } as const;

export type PetdexVersion = 'v1' | 'v2';

export const PETDEX_VERSIONS: Record<PetdexVersion, { rows: number; sheetWidth: number; sheetHeight: number }> = {
  v1: { rows: 9,  sheetWidth: 1536, sheetHeight: 1872 },
  v2: { rows: 11, sheetWidth: 1536, sheetHeight: 2288 },
};

export type LicenseStatus = 'authorized' | 'internal-test' | 'unknown';

export interface PetPackInfo {
  /** 包的绝对路径（已 realpath）。 */
  rootDir: string;
  /** 目录名，用作 slug。 */
  slug: string;
  /** 实际识别出的版本（由图集高度决定）。 */
  version: PetdexVersion;
  /** pet.json 里声明的版本（若有），用于和实际尺寸交叉核对。 */
  declaredVersion: PetdexVersion | null;
  /** 授权状态；未声明一律按 unknown（禁止候选导出）处理。 */
  license: LicenseStatus;
  id: string;
  displayName: string;
  description?: string;
  /** 相对包目录的图集文件名。 */
  spritesheetPath: string;
  /** 图集真实格式（由文件头识别，而不是扩展名）。 */
  sheetFormat: 'png' | 'webp';
  cols: number;
  rows: number;
  frame: { width: number; height: number };
  /** 图集实际像素尺寸。 */
  sheet: { width: number; height: number };
  /** pet.json 与图集的 SHA-256（导出 manifest 用）。 */
  hashes: { petJson: string; spritesheet: string };
}

export type ValidateResult =
  | { ok: true; pack: PetPackInfo }
  | { ok: false; errors: string[] };

function fail(errors: string[]): ValidateResult {
  return { ok: false, errors };
}

/**
 * 图像可解码性探针。默认实现只校验文件头结构（不解码像素）；
 * Electron main 进程注入基于 sharp 的真实解码探针（PNG/WebP 全像素解码，
 * 并交叉核对解码尺寸与文件头声称的尺寸）。
 * 返回 null 表示可解码/结构完好，返回字符串为中文错误。
 */
export type ImageProbe = (absPath: string, head: Buffer) => Promise<string | null>;

// --- 图片尺寸解析（只读文件头，不解码像素） --------------------------------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 从 PNG / WebP 文件头解析像素尺寸。返回 null 表示无法识别。
 * 只需要文件前 64 字节，避免把大图集整个读进内存。
 */
export function detectImageSize(head: Buffer): { width: number; height: number; format: 'png' | 'webp' } | null {
  if (head.length >= 24 && head.subarray(0, 8).equals(PNG_SIG)) {
    // IHDR 是第一个 chunk：offset 8 = length(4) + 'IHDR'(4)，宽高在 16..24（大端）
    if (head.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20), format: 'png' };
  }
  if (head.length >= 30 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = head.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && head.length >= 30) {
      // 扩展格式：宽/高各 24 bit 小端，存的是 实际值 - 1
      const width = head.readUIntLE(24, 3) + 1;
      const height = head.readUIntLE(27, 3) + 1;
      return { width, height, format: 'webp' };
    }
    if (chunk === 'VP8L' && head.length >= 25) {
      // 无损：1 字节 0x2f 签名 + 4 字节打包的宽/高（各 14 bit，存 实际值 - 1）
      if (head[20] !== 0x2f) return null;
      const bits = head.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height, format: 'webp' };
    }
    if (chunk === 'VP8 ' && head.length >= 30) {
      // 有损：3 字节 frame tag + 3 字节起始码 0x9d 0x01 0x2a，然后宽/高各 14 bit 小端
      if (head[23] !== 0x9d || head[24] !== 0x01 || head[25] !== 0x2a) return null;
      const width = head.readUInt16LE(26) & 0x3fff;
      const height = head.readUInt16LE(28) & 0x3fff;
      return { width, height, format: 'webp' };
    }
    return null;
  }
  return null;
}

// --- 路径安全 ---------------------------------------------------------------

/**
 * 把包内相对路径解析成绝对路径，并确认它确实在包目录之内。
 * 拒绝绝对路径、`..` 逃逸和（经 realpath 的）符号链接逃逸。
 * 出错时抛中文异常，由调用方并入错误列表。
 */
export async function resolveInsidePack(rootDir: string, relativePath: string): Promise<string> {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new Error('图集路径为空：pet.json 必须给出 spritesheetPath');
  }
  const rel = relativePath.trim();
  if (path.isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel)) {
    throw new Error(`图集路径不允许使用绝对路径：${rel}`);
  }
  const realRoot = await fs.realpath(rootDir);
  const resolved = path.resolve(realRoot, rel);
  if (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep)) {
    throw new Error(`图集路径越界（不允许逃出宠物包目录）：${rel}`);
  }
  let realFile: string;
  try {
    realFile = await fs.realpath(resolved);
  } catch {
    throw new Error(`缺少图集文件：${rel}`);
  }
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    throw new Error(`图集是指向包外的符号链接（已阻止）：${rel}`);
  }
  return realFile;
}

// --- 版本声明 ---------------------------------------------------------------

/**
 * 解析单个版本声明字段。返回 null = 字段不存在；'invalid' = 存在但不是
 * 受支持的值。真实 Petdex 包用数字字段 spriteVersionNumber（1 / 2），
 * 历史别名 version 兼容 'v1'/'1'/1 等形式。
 */
function normalizeDeclaredVersion(raw: unknown): PetdexVersion | null | 'invalid' {
  if (raw === undefined || raw === null) return null;
  if (raw === 'v1' || raw === 1 || raw === '1') return 'v1';
  if (raw === 'v2' || raw === 2 || raw === '2') return 'v2';
  return 'invalid';
}

/**
 * 读取 pet.json 的版本声明：spriteVersionNumber 为真实字段、优先级最高；
 * version 仅作兼容别名。两个字段同时存在且都合法但不一致时拒绝；
 * 任一字段存在但不受支持时拒绝。全部用中文说明。
 */
export function resolveDeclaredVersion(obj: Record<string, unknown>): PetdexVersion | null {
  const sprite = normalizeDeclaredVersion(obj['spriteVersionNumber']);
  const alias = normalizeDeclaredVersion(obj['version']);
  if (sprite === 'invalid') {
    throw new Error(`不支持的 spriteVersionNumber：${JSON.stringify(obj['spriteVersionNumber'])}（目前支持 1 / 2）`);
  }
  if (alias === 'invalid') {
    throw new Error(`不支持的宠物包版本：${JSON.stringify(obj['version'])}（目前支持 v1 / v2）`);
  }
  if (sprite && alias && sprite !== alias) {
    throw new Error(`版本声明冲突：spriteVersionNumber 是 ${sprite}，version 是 ${alias}，两者必须一致或只保留一个`);
  }
  return sprite ?? alias;
}

// --- 授权状态 -----------------------------------------------------------------

function parseLicense(raw: unknown): LicenseStatus {
  if (raw === 'authorized' || raw === 'internal-test') return raw;
  return 'unknown';
}

// --- 主校验流程 ---------------------------------------------------------------

export interface ValidateOptions {
  /** 可解码性探针；不传则只校验文件头结构。 */
  probe?: ImageProbe;
}

/**
 * 校验一个目录形式的 Petdex 宠物包。全程只读。
 * 任何一步失败都会返回人类可读的中文错误列表（可能一次报多条）。
 */
export async function validatePetPack(dir: string, opts: ValidateOptions = {}): Promise<ValidateResult> {
  const errors: string[] = [];

  let realRoot: string;
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return fail([`宠物包路径不是目录：${dir}`]);
    realRoot = await fs.realpath(dir);
  } catch {
    return fail([`宠物包目录不存在：${dir}`]);
  }
  const slug = path.basename(realRoot);

  // pet.json
  const petJsonAbs = path.join(realRoot, 'pet.json');
  let rawText: string;
  try {
    rawText = await fs.readFile(petJsonAbs, 'utf8');
  } catch {
    return fail([`缺少 pet.json：宠物包 ${realRoot} 里必须有 pet.json`]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail([`pet.json 不是合法 JSON：${msg}`]);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail(['pet.json 内容错误：顶层必须是一个 JSON 对象']);
  }
  const obj = raw as Record<string, unknown>;
  const petJsonHash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');

  // 版本声明（可选，声明了就必须合法）：spriteVersionNumber 优先，
  // version 为兼容别名；两者冲突或值不受支持都直接拒绝。
  let declared: PetdexVersion | null = null;
  try {
    declared = resolveDeclaredVersion(obj);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // 图集路径 + 安全解析
  const sheetField = obj['spritesheetPath'] ?? obj['spritesheet'];
  let sheetAbs: string | null = null;
  let sheetRel = '';
  if (typeof sheetField !== 'string') {
    errors.push('pet.json 缺少 spritesheetPath 字段（图集文件名）');
  } else {
    sheetRel = sheetField.trim();
    const ext = path.extname(sheetRel).toLowerCase();
    if (ext !== '.png' && ext !== '.webp') {
      errors.push(`图集格式不支持：${sheetRel}（只支持 PNG 或 WebP）`);
    } else {
      try {
        sheetAbs = await resolveInsidePack(realRoot, sheetRel);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // 图集尺寸 → 版本
  let version: PetdexVersion | null = null;
  let sheetSize: { width: number; height: number } | null = null;
  let sheetFormat: 'png' | 'webp' | null = null;
  let sheetHash = '';
  if (sheetAbs) {
    let head: Buffer;
    try {
      const fh = await fs.open(sheetAbs, 'r');
      try {
        head = Buffer.alloc(64);
        const { bytesRead } = await fh.read(head, 0, 64, 0);
        head = head.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    } catch {
      return fail([...errors, `无法读取图集文件：${sheetRel}`]);
    }
    const size = detectImageSize(head);
    if (!size) {
      errors.push(`无法解析图集尺寸：${sheetRel} 不是有效的 PNG 或 WebP 文件`);
    } else {
      sheetSize = { width: size.width, height: size.height };
      sheetFormat = size.format;
      const expectedW = PETDEX_COLS * PETDEX_FRAME.width;
      if (size.width !== expectedW) {
        errors.push(`图集宽度错误：期望 ${expectedW}（${PETDEX_COLS} 列 × ${PETDEX_FRAME.width}），实际 ${size.width}`);
      }
      version = versionForSheet(size.width, size.height);
      if (!version && size.width === expectedW) {
        const v1 = PETDEX_VERSIONS.v1;
        const v2 = PETDEX_VERSIONS.v2;
        errors.push(
          `图集高度无法识别版本：v1 期望 ${v1.sheetHeight}（${v1.rows} 行 × ${PETDEX_FRAME.height}），` +
          `v2 期望 ${v2.sheetHeight}（${v2.rows} 行 × ${PETDEX_FRAME.height}），实际 ${size.height}`
        );
      }
      if (version && declared && declared !== version) {
        errors.push(`pet.json 声明的版本是 ${declared}，但图集尺寸是 ${version}（${size.width}×${size.height}），两者不一致`);
      }
      // 可解码性探针（Electron main 注入 sharp 真实解码）
      if (opts.probe) {
        const probeError = await opts.probe(sheetAbs, head);
        if (probeError) errors.push(probeError);
      }
      sheetHash = crypto.createHash('sha256').update(await fs.readFile(sheetAbs)).digest('hex');
    }
  }

  if (errors.length > 0) return fail(errors);
  // 走到这里 version / sheetSize / sheetAbs 必然存在
  const v = version!;
  const spec = PETDEX_VERSIONS[v];
  const id = typeof obj['id'] === 'string' && obj['id'].trim() ? obj['id'].trim() : slug;
  const displayName =
    (typeof obj['displayName'] === 'string' && obj['displayName'].trim()) ? (obj['displayName'] as string).trim() :
    (typeof obj['name'] === 'string' && obj['name'].trim()) ? (obj['name'] as string).trim() :
    id;
  return {
    ok: true,
    pack: {
      rootDir: realRoot,
      slug,
      version: v,
      declaredVersion: declared,
      license: parseLicense(obj['license']),
      id,
      displayName,
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
      spritesheetPath: sheetRel,
      sheetFormat: sheetFormat!,
      cols: PETDEX_COLS,
      rows: spec.rows,
      frame: { ...PETDEX_FRAME },
      sheet: sheetSize!,
      hashes: { petJson: petJsonHash, spritesheet: sheetHash },
    },
  };
}

function versionForSheet(width: number, height: number): PetdexVersion | null {
  for (const v of Object.keys(PETDEX_VERSIONS) as PetdexVersion[]) {
    const spec = PETDEX_VERSIONS[v];
    if (spec.sheetWidth === width && spec.sheetHeight === height) return v;
  }
  return null;
}

// --- 状态映射 ---------------------------------------------------------------

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

export interface PetSpriteConfig {
  id: string;
  name: string;
  description?: string;
  frame: { width: number; height: number; cols: number };
  displayScale: number;
  states: Record<string, { frames: number[]; framesLeft?: number[]; fps: number }>;
}

/**
 * Petdex 行约定（译自 MIT 授权的 crafter-station/petdex）：
 *   行 0: idle (6f)，行 1: 向右跑 (8f)，行 2: 向左跑 (8f)，
 *   行 3: 挥手 (4f)，行 4: 跳 (5f)，行 5: failed (8f)，
 *   行 6: waiting (6f)，行 7: 通用跑 (6f)，行 8: review (6f)。
 * v2 多出的行 9–10 语义上游未公开，映射为附加状态 extra1/extra2，
 * 预览里可以播放，桌宠默认动作集不使用。
 *
 * 状态表由版本驱动（v1 9 行 / v2 11 行），不写死单一图集尺寸。
 */
export function petPackToSpriteConfig(pack: PetPackInfo): PetSpriteConfig {
  const cols = pack.cols;
  const runRight = range(1 * cols, 8);
  const runLeft = range(2 * cols, 8);
  const states: PetSpriteConfig['states'] = {
    idle:     { frames: range(0 * cols, 6), fps: 5.5 },
    walking:  { frames: runRight, framesLeft: runLeft, fps: 7 },
    dragging: { frames: runRight, framesLeft: runLeft, fps: 12 },
    talking:  { frames: range(3 * cols, 4), fps: 5.7 },
    jumping:  { frames: range(4 * cols, 5), fps: 6.0 },
    failed:   { frames: range(5 * cols, 8), fps: 6.0 },
    waiting:  { frames: range(6 * cols, 6), fps: 4.0 },
    running:  { frames: range(7 * cols, 6), fps: 7.5 },
    review:   { frames: range(8 * cols, 6), fps: 5.5 },
  };
  if (pack.rows > 9) {
    states['extra1'] = { frames: range(9 * cols, 8), fps: 6 };
  }
  if (pack.rows > 10) {
    states['extra2'] = { frames: range(10 * cols, 8), fps: 6 };
  }
  return {
    id: pack.id,
    name: pack.displayName,
    description: pack.description,
    frame: { width: pack.frame.width, height: pack.frame.height, cols: pack.cols },
    displayScale: 0.4,
    states,
  };
}

/** 把图集读成 data URL（供 renderer 直接用）。只读输入包。MIME 按真实格式而非扩展名。 */
export async function readSpritesheetDataUrl(pack: PetPackInfo): Promise<string> {
  const abs = await resolveInsidePack(pack.rootDir, pack.spritesheetPath);
  const buf = await fs.readFile(abs);
  const mime = pack.sheetFormat === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
