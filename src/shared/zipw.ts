import zlib from 'node:zlib';
import { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED, type ZipLimits } from './zip';

/**
 * 最小 ZIP 写入器（store/deflate），用途：
 *   1. 测试 fixture 程序生成 ZIP；
 *   2. 导出时把"启动说明.txt / manifest.json"等文件并入最终 ZIP
 *      （重写：读出原条目 → 追加 → 重新生成，保证无重复条目）。
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipOutEntry {
  name: string;          // posix 相对路径
  data: Buffer;
  compress?: boolean;    // 默认 true（deflate）
}

export function createZip(entries: ZipOutEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const compress = e.compress !== false && e.data.length > 0;
    const payload = compress ? zlib.deflateRawSync(e.data, { level: 9 }) : e.data;
    const method = compress ? 8 : 0;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 文件名标志
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);            // time
    local.writeUInt16LE(0, 12);            // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);            // extra len
    chunks.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);              // version made by
    cen.writeUInt16LE(20, 6);              // version needed
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE((0o100644 << 16) >>> 0, 38); // 普通文件 unix mode（>>> 0 防符号位）
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += 30 + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/** 向已有 ZIP 追加/覆盖条目（重写整个文件，返回新内容）。
 *  导出产物含大体积 EXE，默认用放宽限制；调用方可传入自定义 limits。 */
export async function appendToZip(zipBuf: Buffer, additions: ZipOutEntry[], limits: ZipLimits = ZIP_LIMITS_RELAXED): Promise<Buffer> {
  const { entries } = inspectZip(zipBuf, limits);
  const out: ZipOutEntry[] = [];
  const replaced = new Set(additions.map((a) => a.name.toLowerCase()));
  for (const e of entries) {
    if (replaced.has(e.name.toLowerCase())) continue;
    out.push({ name: e.name, data: await readZipEntry(zipBuf, e, limits) });
  }
  out.push(...additions);
  return createZip(out);
}
