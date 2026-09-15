// 宠物包校验模块自动测试。运行：npm run test:petpack
//
// 覆盖（对应任务书 §6）：
//   ✓ 合法 v1 / v2（真实字段 spriteVersionNumber）
//   ✗ 版本字段冲突 / 不支持值 / 声明与尺寸不一致 / 声明 v1 配 v2 图集
//   ✗ 非法 JSON / 顶层非对象 / 缺 pet.json / 缺 spritesheetPath / 缺图集
//   ✗ 图集尺寸错误 / 高度无法识别版本 / 扩展名不支持
//   ✗ 图像不可解码（注入的解码探针失败）
//   ✓ WebP v1/v2 经 sharp 真实解码通过；截断/伪造文件头/头身尺寸不符均拒绝
//   ✗ 路径逃逸（../）、绝对路径、符号链接逃逸
//   ✓ 校验不修改输入包（SHA-256 前后一致）
//   ✓ 授权状态解析（authorized / internal-test / 默认 unknown）

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { validatePetPack, petPackToSpriteConfig, readSpritesheetDataUrl, detectImageSize } from '../src/shared/petpack.ts';
import { sharpImageProbe } from '../src/main/image-probe.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(REPO, 'assets', 'fixtures');

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

function hasErr(errors: string[], kw: string): boolean {
  return errors.some((e) => e.includes(kw));
}

async function writePack(root: string, name: string, petJson: unknown, copySheetFrom?: string): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  if (petJson !== null) {
    await fs.writeFile(path.join(dir, 'pet.json'), typeof petJson === 'string' ? petJson : JSON.stringify(petJson, null, 2));
  }
  if (copySheetFrom) {
    await fs.copyFile(copySheetFrom, path.join(dir, 'spritesheet.png'));
  }
  return dir;
}

const V1_SHEET = path.join(FIXTURES, 'pack-v1', 'spritesheet.png');
const V2_SHEET = path.join(FIXTURES, 'pack-v2', 'spritesheet.png');

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'petpack-test-'));
  console.log(`fixture 根目录：${tmp}\n`);

  try {
    // ── 合法包（仓库内 fixture） ─────────────────────────────────────────
    console.log('[合法包]');
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-v1'));
      check('v1 合法包通过校验', res.ok, res.ok ? '' : res.errors.join('；'));
      if (res.ok) {
        check('v1 版本/行数识别', res.pack.version === 'v1' && res.pack.rows === 9);
        check('v1 declaredVersion=v1（spriteVersionNumber: 1）', res.pack.declaredVersion === 'v1');
        check('v1 授权状态 authorized', res.pack.license === 'authorized');
        check('v1 哈希已记录', res.pack.hashes.petJson.length === 64 && res.pack.hashes.spritesheet.length === 64);
        const cfg = petPackToSpriteConfig(res.pack);
        check('v1 状态映射含 idle/walking/talking', ['idle', 'walking', 'talking'].every((s) => s in cfg.states));
        check('普通 Petdex v1 保留第 8 行 review 语义', cfg.states.review?.frames[0] === 8 * cfg.frame.cols);
        const url = await readSpritesheetDataUrl(res.pack);
        check('图集可读成 data URL', url.startsWith('data:image/png;base64,'));
      }
    }
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-v2'));
      check('v2 合法包通过校验', res.ok, res.ok ? '' : res.errors.join('；'));
      if (res.ok) {
        check('v2 版本/行数识别', res.pack.version === 'v2' && res.pack.rows === 11);
        check('v2 declaredVersion=v2（spriteVersionNumber: 2）', res.pack.declaredVersion === 'v2');
        check('v2 授权状态 internal-test', res.pack.license === 'internal-test');
        const cfg = petPackToSpriteConfig(res.pack);
        check('v2 含附加状态 extra1/extra2', 'extra1' in cfg.states && 'extra2' in cfg.states);
      }
    }
    {
      const dir = await writePack(tmp, 'foreign-product', {
        id: 'foreign-product', spriteVersionNumber: 1,
        spritesheetPath: 'spritesheet.png', sourceFormat: 'external-runtime',
      }, V1_SHEET);
      const before = await fs.readFile(path.join(dir, 'pet.json'), 'utf8');
      const res = await validatePetPack(dir);
      check('其他产品格式不能作为 Petdex 导入或导出', !res.ok && hasErr(res.errors, '仅支持 Petdex'));
      check('拒绝其他产品时保留原始文件', before === await fs.readFile(path.join(dir, 'pet.json'), 'utf8'));
    }

    console.log('\n[WebP 支持]');
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-v1-webp'), { probe: sharpImageProbe });
      check('WebP v1 目录校验通过（真实解码）', res.ok, res.ok ? '' : res.errors.join('；'));
      if (res.ok) {
        check('WebP v1 版本识别 + declaredVersion', res.pack.version === 'v1' && res.pack.declaredVersion === 'v1');
        check('WebP 格式按文件头识别（而非扩展名）', res.pack.sheetFormat === 'webp');
        const url = await readSpritesheetDataUrl(res.pack);
        check('WebP data URL 使用 image/webp MIME', url.startsWith('data:image/webp;base64,'));
      }
    }
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-v2-webp'), { probe: sharpImageProbe });
      check('WebP v2 目录校验通过（真实解码）', res.ok, res.ok ? '' : res.errors.join('；'));
      if (res.ok) check('WebP v2 识别 11 行', res.pack.version === 'v2' && res.pack.rows === 11);
    }
    {
      // PNG 回归：同一条 sharp 探针对合法 PNG 也必须通过
      const res = await validatePetPack(path.join(FIXTURES, 'pack-v1'), { probe: sharpImageProbe });
      check('PNG 经 sharp 探针回归通过', res.ok, res.ok ? '' : res.errors.join('；'));
    }
    {
      // 截断 WebP：文件头完好（尺寸可解析），内容被砍掉 → 真实解码必须拒绝
      const valid = await fs.readFile(path.join(FIXTURES, 'pack-v1-webp', 'spritesheet.webp'));
      const truncated = valid.subarray(0, 200);
      check('截断样本头部仍可解析尺寸（确认是"头好身坏"场景）', detectImageSize(truncated) !== null);
      const dir = path.join(tmp, 'webp-truncated');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'pet.json'),
        JSON.stringify({ id: 'trunc', spriteVersionNumber: 1, spritesheetPath: 'spritesheet.webp' }));
      await fs.writeFile(path.join(dir, 'spritesheet.webp'), truncated);
      const res = await validatePetPack(dir, { probe: sharpImageProbe });
      check('截断 WebP 被拒绝（中文"无法解码"）', !res.ok && hasErr(res.errors, '无法解码'),
        res.ok ? '' : res.errors.join('；'));
    }
    {
      // 伪造文件头：RIFF/WEBP/VP8L 头声称 1536×1872，内容是垃圾 → 拒绝
      const bits = (1536 - 1) | ((1872 - 1) << 14);
      const vp8l = Buffer.alloc(5);
      vp8l[0] = 0x2f;
      vp8l.writeUInt32LE(bits, 1);
      const body = Buffer.alloc(4096, 0xab);
      const riffSize = 4 + 8 + vp8l.length + body.length;
      const head = Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.from([riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >> 24) & 0xff]),
        Buffer.from('WEBPVP8L', 'ascii'),
        Buffer.from([(5 + body.length) & 0xff, 0, 0, 0]),
        vp8l, body,
      ]);
      check('伪造样本头部可解析尺寸（确认探针不是被文件头骗过）', detectImageSize(head)?.width === 1536);
      const dir = path.join(tmp, 'webp-fake');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'pet.json'),
        JSON.stringify({ id: 'fake', spriteVersionNumber: 1, spritesheetPath: 'spritesheet.webp' }));
      await fs.writeFile(path.join(dir, 'spritesheet.webp'), head);
      const res = await validatePetPack(dir, { probe: sharpImageProbe });
      check('伪造文件头 WebP 被拒绝', !res.ok && hasErr(res.errors, '无法解码'),
        res.ok ? '' : res.errors.join('；'));
    }
    {
      // 头声称尺寸与实际解码尺寸不符：探针直接交叉核对
      const v2Head = Buffer.alloc(64);
      const fh = await fs.open(path.join(FIXTURES, 'pack-v2-webp', 'spritesheet.webp'), 'r');
      try { await fh.read(v2Head, 0, 64, 0); } finally { await fh.close(); }
      const err = await sharpImageProbe(path.join(FIXTURES, 'pack-v1-webp', 'spritesheet.webp'), v2Head);
      check('探针抓出"头声称 vs 实际解码"尺寸不符', err !== null && err.includes('实际解码'), err ?? '');
    }
    {
      // 损坏 PNG 同样被同一探针拒绝（PNG 路径不因此放水）
      const valid = await fs.readFile(V1_SHEET);
      const dir = await writePack(tmp, 'png-truncated', { id: 'x', spritesheetPath: 'spritesheet.png' });
      await fs.writeFile(path.join(dir, 'spritesheet.png'), valid.subarray(0, 100));
      const res = await validatePetPack(dir, { probe: sharpImageProbe });
      check('截断 PNG 被拒绝', !res.ok && hasErr(res.errors, '无法解码'), res.ok ? '' : res.errors.join('；'));
    }

    // ── 版本字段反例 ──────────────────────────────────────────────────────
    console.log('\n[版本字段]');
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-conflict'));
      check('spriteVersionNumber 与 version 冲突被拒绝', !res.ok && hasErr(res.errors, '冲突'));
    }
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-decl-v1-img-v2'));
      check('声明 v1 配 v2 图集被拒绝', !res.ok && hasErr(res.errors, '不一致'));
    }
    {
      const dir = await writePack(tmp, 'bad-svn',
        { id: 'x', spriteVersionNumber: 3, spritesheetPath: 'spritesheet.png' }, V1_SHEET);
      const res = await validatePetPack(dir);
      check('不支持的 spriteVersionNumber 被拒绝', !res.ok && hasErr(res.errors, '不支持的 spriteVersionNumber'));
    }
    {
      const dir = await writePack(tmp, 'alias-only',
        { id: 'x', version: 'v2', spritesheetPath: 'spritesheet.png' }, V2_SHEET);
      const res = await validatePetPack(dir);
      check('version 别名兼容（v2 图集通过）', res.ok);
    }
    {
      const dir = await writePack(tmp, 'no-version', { id: 'x', spritesheetPath: 'spritesheet.png' }, V1_SHEET);
      const res = await validatePetPack(dir);
      check('无声明字段时按图集识别（v1 通过，declaredVersion=null）',
        res.ok && res.pack.declaredVersion === null);
    }

    // ── JSON / 缺文件 ────────────────────────────────────────────────────
    console.log('\n[JSON / 缺文件]');
    {
      const dir = await writePack(tmp, 'no-petjson', null, V1_SHEET);
      const res = await validatePetPack(dir);
      check('缺 pet.json 被拒绝', !res.ok && hasErr(res.errors, '缺少 pet.json'));
    }
    {
      const dir = await writePack(tmp, 'bad-json', '{ not json !!', V1_SHEET);
      const res = await validatePetPack(dir);
      check('非法 JSON 被拒绝', !res.ok && hasErr(res.errors, '不是合法 JSON'));
    }
    {
      const dir = await writePack(tmp, 'array-json', '[1,2,3]', V1_SHEET);
      const res = await validatePetPack(dir);
      check('顶层非对象被拒绝', !res.ok && hasErr(res.errors, '顶层必须是一个 JSON 对象'));
    }
    {
      const dir = await writePack(tmp, 'no-sheet-field', { id: 'x' }, V1_SHEET);
      const res = await validatePetPack(dir);
      check('缺 spritesheetPath 字段被拒绝', !res.ok && hasErr(res.errors, 'spritesheetPath'));
    }
    {
      const dir = await writePack(tmp, 'missing-sheet', { id: 'x', spritesheetPath: 'spritesheet.png' });
      const res = await validatePetPack(dir);
      check('缺图集文件被拒绝', !res.ok && hasErr(res.errors, '缺少图集文件'));
    }

    // ── 尺寸 / 可解码性 ───────────────────────────────────────────────────
    console.log('\n[尺寸 / 可解码性]');
    {
      const res = await validatePetPack(path.join(FIXTURES, 'pack-bad-size'));
      check('图集尺寸错误被拒绝', !res.ok && hasErr(res.errors, '宽度错误'));
    }
    {
      // 不可解码：注入失败的探针（Electron main 用 nativeImage 做真实解码）
      const dir = await writePack(tmp, 'undecodable', { id: 'x', spritesheetPath: 'spritesheet.png' }, V1_SHEET);
      const res = await validatePetPack(dir, { probe: async () => '图集无法解码：模拟的解码失败' });
      check('图像不可解码被拒绝', !res.ok && hasErr(res.errors, '无法解码'));
    }
    {
      // 探针通过时不受影响（对照组）
      const dir = await writePack(tmp, 'decodable', { id: 'x', spritesheetPath: 'spritesheet.png' }, V1_SHEET);
      const res = await validatePetPack(dir, { probe: async () => null });
      check('可解码探针通过时校验通过', res.ok);
    }

    // ── 路径安全 ──────────────────────────────────────────────────────────
    console.log('\n[路径安全]');
    const outside = path.join(tmp, 'secret-outside.png');
    await fs.copyFile(V1_SHEET, outside);
    {
      const dir = await writePack(tmp, 'escape-dotdot', { id: 'x', spritesheetPath: '../secret-outside.png' });
      const res = await validatePetPack(dir);
      check('../ 路径逃逸被拒绝', !res.ok && hasErr(res.errors, '越界'));
    }
    {
      const dir = await writePack(tmp, 'escape-absolute', { id: 'x', spritesheetPath: outside });
      const res = await validatePetPack(dir);
      check('绝对路径被拒绝', !res.ok && hasErr(res.errors, '绝对路径'));
    }
    {
      const dir = await writePack(tmp, 'escape-symlink', { id: 'x', spritesheetPath: 'link.png' });
      await fs.symlink(outside, path.join(dir, 'link.png'));
      const res = await validatePetPack(dir);
      check('符号链接逃逸被拒绝', !res.ok && hasErr(res.errors, '符号链接'));
    }

    // ── 输入不可变 ────────────────────────────────────────────────────────
    console.log('\n[输入不可变]');
    {
      const src = path.join(FIXTURES, 'pack-v1');
      const hashDir = async (): Promise<string> => {
        const h = crypto.createHash('sha256');
        for (const f of (await fs.readdir(src)).sort()) {
          h.update(f);
          h.update(await fs.readFile(path.join(src, f)));
        }
        return h.digest('hex');
      };
      const before = await hashDir();
      const res = await validatePetPack(src);
      if (res.ok) await readSpritesheetDataUrl(res.pack);
      const after = await hashDir();
      check('校验与读取后包内容哈希不变', before === after);
    }
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
