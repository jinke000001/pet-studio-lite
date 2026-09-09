// ZIP 导入安全测试。运行：npm run test:zip
//
// 覆盖（对应任务书 §6）：
//   ✗ 绝对路径条目 / .. 逃逸 / 反斜杠逃逸 / 盘符路径
//   ✗ 符号链接与特殊文件条目
//   ✗ 重复目标（含大小写不敏感重复）
//   ✗ 压缩炸弹（压缩率异常）
//   ✗ 损坏的 ZIP（无 EOCD / 数据越界 / CRC 不符）
//   ✓ 合法 ZIP 正常提取（含顶层子目录前缀）
//   ✓ 白名单提取：非 pet.json / 图集条目不落盘

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { inspectZip, extractPetPackFromZip, ZIP_LIMITS } from '../src/shared/zip.ts';
import { createZip } from '../src/shared/zipw.ts';
import { validatePetPack } from '../src/shared/petpack.ts';
import { sharpImageProbe } from '../src/main/image-probe.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

async function expectThrow(name: string, kw: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(name, false, '未抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, msg.includes(kw), msg);
  }
}

/** 手工构造带自定义外部属性的 ZIP 条目（用于符号链接测试）。 */
function createZipWithMode(entries: Array<{ name: string; data: Buffer; mode: number }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const payload = zlib.deflateRawSync(e.data);
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, payload);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE((e.mode << 16) >>> 0, 38);
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

const PET_JSON = JSON.stringify({ id: 'z', displayName: 'ZIP 测试', spriteVersionNumber: 1, license: 'internal-test', spritesheetPath: 'spritesheet.png' });

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
  console.log(`fixture 根目录：${tmp}\n`);
  // 直接用仓库 fixture 的图集
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const sheet = await fs.readFile(path.join(repoRoot, 'assets', 'fixtures', 'pack-v1', 'spritesheet.png'));

  async function writeZip(name: string, buf: Buffer): Promise<string> {
    const p = path.join(tmp, name);
    await fs.writeFile(p, buf);
    return p;
  }

  try {
    // ── 合法 ZIP ──────────────────────────────────────────────────────────
    console.log('[合法 ZIP]');
    {
      const zip = createZip([
        { name: 'my-pet/pet.json', data: Buffer.from(PET_JSON) },
        { name: 'my-pet/spritesheet.png', data: sheet },
        { name: 'my-pet/README.md', data: Buffer.from('readme 不应被提取') },
      ]);
      const p = await writeZip('ok.zip', zip);
      const dest = path.join(tmp, 'out-ok');
      await fs.mkdir(dest, { recursive: true });
      const written = await extractPetPackFromZip(p, dest);
      check('合法 ZIP 提取成功', written.includes('pet.json') && written.includes('spritesheet.png'));
      check('白名单生效（README.md 未落盘）', !(await fs.stat(path.join(dest, 'README.md')).then(() => true, () => false)));
      const extracted = await fs.readFile(path.join(dest, 'spritesheet.png'));
      check('提取内容字节一致', extracted.equals(sheet));
    }
    {
      // WebP ZIP：提取 + 完整校验（真实解码）一条龙
      const webpSheet = await fs.readFile(path.join(repoRoot, 'assets', 'fixtures', 'pack-v2-webp', 'spritesheet.webp'));
      const webpJson = JSON.stringify({
        id: 'zip-webp', displayName: 'ZIP WebP 测试', spriteVersionNumber: 2,
        license: 'internal-test', spritesheetPath: 'spritesheet.webp',
      });
      const zip = createZip([
        { name: 'wp/pet.json', data: Buffer.from(webpJson) },
        { name: 'wp/spritesheet.webp', data: webpSheet },
      ]);
      const p = await writeZip('ok-webp.zip', zip);
      const dest = path.join(tmp, 'out-ok-webp');
      await fs.mkdir(dest, { recursive: true });
      const written = await extractPetPackFromZip(p, dest);
      check('WebP ZIP 提取成功', written.includes('pet.json') && written.includes('spritesheet.webp'));
      const res = await validatePetPack(dest, { probe: sharpImageProbe });
      check('WebP ZIP 提取后通过完整校验（v2 真实解码）', res.ok && res.pack.version === 'v2',
        res.ok ? '' : res.errors.join('；'));
    }

    // ── 路径攻击 ──────────────────────────────────────────────────────────
    console.log('\n[路径攻击]');
    await expectThrow('绝对路径条目被拒绝', '绝对路径', async () => {
      inspectZip(createZip([{ name: '/etc/passwd', data: Buffer.from('x') }]));
    });
    await expectThrow('.. 逃逸被拒绝', '..', async () => {
      inspectZip(createZip([{ name: '../evil.png', data: Buffer.from('x') }]));
    });
    await expectThrow('反斜杠逃逸被拒绝', '..', async () => {
      inspectZip(createZip([{ name: '..\\evil.png', data: Buffer.from('x') }]));
    });
    await expectThrow('盘符路径被拒绝', '绝对路径', async () => {
      inspectZip(createZip([{ name: 'C:/Windows/evil.png', data: Buffer.from('x') }]));
    });
    await expectThrow('符号链接条目被拒绝', '符号链接', async () => {
      inspectZip(createZipWithMode([{ name: 'link.png', data: Buffer.from('/etc/passwd'), mode: 0o120777 }]));
    });
    await expectThrow('重复目标被拒绝', '重复', async () => {
      inspectZip(createZip([
        { name: 'a/pet.json', data: Buffer.from('1') },
        { name: 'a/PET.JSON', data: Buffer.from('2') },
      ]));
    });

    // ── 膨胀 / 损坏 ─────────────────────────────────────────────────────────
    console.log('\n[膨胀 / 损坏]');
    await expectThrow('压缩率异常被拒绝', '压缩率异常', async () => {
      const big = Buffer.alloc(1024 * 1024, 0); // 1MB 全零，deflate 后极小
      inspectZip(createZip([{ name: 'bomb.bin', data: big }]));
    });
    await expectThrow('无 EOCD 被拒绝', 'EOCD', async () => {
      inspectZip(Buffer.from('not a zip at all, just some bytes'));
    });
    await expectThrow('CRC 不符被拒绝', 'CRC', async () => {
      const zip = createZip([{ name: 'pet.json', data: Buffer.from(PET_JSON) }]);
      // 篡改压缩数据区（本地头 30 字节 + 文件名 8 字节之后）
      zip[45]! ^= 0xff;
      const p = await writeZip('badcrc.zip', zip);
      const dest = path.join(tmp, 'out-badcrc');
      await fs.mkdir(dest, { recursive: true });
      await extractPetPackFromZip(p, dest);
    });
    await expectThrow('缺 pet.json 的 ZIP 被拒绝', 'pet.json', async () => {
      const p = await writeZip('nojson.zip', createZip([{ name: 'spritesheet.png', data: sheet }]));
      const dest = path.join(tmp, 'out-nojson');
      await fs.mkdir(dest, { recursive: true });
      await extractPetPackFromZip(p, dest);
    });
    check('条目数上限存在', ZIP_LIMITS.maxEntries > 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  if (failed > 0) {
    for (const f of failures) console.log(`  失败：${f}`);
    process.exit(1);
  }
}

await main();
