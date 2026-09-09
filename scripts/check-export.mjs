// 静态核验一个导出的 Windows 便携 ZIP（不运行它）。
// 用法：npm run check:export -- <path-to.zip>
//
// 检查：
//   ✓ 能解压（ZIP 结构合法）
//   ✓ 顶层有 PetLitePet.exe 与 启动说明.txt / manifest.json
//   ✓ resources/ 里有宠物包（pet.json + 图集）与 manifest.json
//   ✓ manifest.json 字段齐全（产品版本 / 宠物身份 / Petdex 版本 / 哈希 / 平台架构 / 授权）
//   ✓ 没有开发机绝对路径（/Users/...）
//   ✓ 启动说明不要求安装 Node/Python/命令行

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('用法：npm run check:export -- <path-to.zip>');
  process.exit(1);
}

const { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED } = await import('../src/shared/zip.ts');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`); }
}

const buf = fs.readFileSync(path.resolve(zipPath));
// 放宽限制：导出产物含 ~186MB 的 Electron EXE 是合法的
const { entries } = inspectZip(buf, ZIP_LIMITS_RELAXED);
const names = entries.map((e) => e.name);

check('ZIP 结构合法可解析', entries.length > 0);
check('包含 PetLitePet.exe', names.some((n) => n.endsWith('PetLitePet.exe')));
check('顶层有 启动说明.txt', names.includes('启动说明.txt'));
check('顶层有 manifest.json', names.includes('manifest.json'));
check('resources 里有 manifest.json', names.some((n) => n.endsWith('resources/manifest.json') || n.includes('/resources/manifest.json')));
check('resources 里有宠物包 pet.json', names.some((n) => n.includes('petpack/pet.json')));
check('resources 里有图集', names.some((n) => /petpack\/spritesheet\.(png|webp)$/.test(n)));
check('resources 里有运行时配置 config.json', names.some((n) => n.includes('petpack/config.json')));

// manifest 字段
{
  const entry = entries.find((e) => e.name === 'manifest.json');
  const manifest = JSON.parse((await readZipEntry(buf, entry)).toString('utf8'));
  check('manifest.platform=win32', manifest.platform === 'win32');
  check('manifest.arch=x64', manifest.arch === 'x64');
  check('manifest 含宠物身份', !!(manifest.pet && manifest.pet.id && manifest.pet.petdexVersion));
  check('manifest 含来源哈希', !!(manifest.hashes && manifest.hashes.petJsonSha256 && manifest.hashes.spritesheetSha256));
  check('manifest 含授权状态', !!manifest.license);
  check('manifest 含导出时间', !!manifest.exportedAt);
  check('manifest 区分真实宠物 ID 与内部实例 ID',
    typeof manifest.studioProjectId === 'string' && manifest.studioProjectId.length > 0);
  check('manifest 含来源类型与内容指纹',
    !!(manifest.source && (manifest.source.type === 'dir' || manifest.source.type === 'zip') &&
      typeof manifest.source.fingerprint === 'string' && manifest.source.fingerprint.length === 64));
  check('manifest 不含用户机器绝对路径',
    !JSON.stringify(manifest).includes('/Users/') && !/[A-Za-z]:\\/.test(JSON.stringify(manifest)));

  // 与包内 pet.json / 图集的实际内容交叉核验
  const petJsonEntry = entries.find((e) => e.name.includes('petpack/pet.json'));
  const sheetEntry = entries.find((e) => /petpack\/spritesheet\.(png|webp)$/.test(e.name));
  if (petJsonEntry && sheetEntry) {
    const petJsonBytes = await readZipEntry(buf, petJsonEntry);
    const petJson = JSON.parse(petJsonBytes.toString('utf8'));
    const sheetBytes = await readZipEntry(buf, sheetEntry);
    const pjHash = crypto.createHash('sha256').update(petJsonBytes).digest('hex');
    const shHash = crypto.createHash('sha256').update(sheetBytes).digest('hex');
    check('manifest.pet.id 与包内 pet.json 的 id 一致', manifest.pet.id === petJson.id,
      `${manifest.pet.id} vs ${petJson.id}`);
    check('manifest 哈希与包内实际文件一致',
      manifest.hashes.petJsonSha256 === pjHash && manifest.hashes.spritesheetSha256 === shHash);
    const expectFingerprint = crypto.createHash('sha256').update(`petdex-pack:${pjHash}:${shHash}`).digest('hex');
    check('manifest 内容指纹可复算且一致', manifest.source.fingerprint === expectFingerprint);
    const svn = petJson.spriteVersionNumber;
    const expectDeclared = svn === 1 ? 'v1' : svn === 2 ? 'v2' : null;
    check('manifest.declaredVersion 与 pet.json 声明一致', manifest.pet.declaredVersion === expectDeclared,
      `${manifest.pet.declaredVersion} vs ${expectDeclared}`);
  } else {
    check('resources 宠物包可交叉核验', false);
  }

  // ZIP 顶层 manifest 与 resources/manifest.json 内容一致
  const resManifestEntry = entries.find((e) => e.name.endsWith('resources/manifest.json') || e.name.includes('/resources/manifest.json'));
  if (resManifestEntry) {
    const top = await readZipEntry(buf, entry);
    const res = await readZipEntry(buf, resManifestEntry);
    check('ZIP 顶层与 resources 的 manifest.json 一致', top.equals(res));
  } else {
    check('ZIP 顶层与 resources 的 manifest.json 一致', false, '找不到 resources/manifest.json');
  }
}

// 启动说明不依赖开发环境
{
  const entry = entries.find((e) => e.name === '启动说明.txt');
  const text = (await readZipEntry(buf, entry)).toString('utf8');
  check('启动说明存在且非空', text.length > 50);
  check('启动说明明确"不需要安装 Node/Python"', /不需要安装/.test(text));
}

// 无开发机绝对路径（抽查文本类条目）
{
  const home = process.env.HOME || '';
  const offenders = [];
  for (const e of entries) {
    if (!/\.(json|txt|md|js|html|yml)$/.test(e.name)) continue;
    if (e.uncompressedSize > 512 * 1024) continue;
    const data = (await readZipEntry(buf, e)).toString('utf8');
    if (data.includes('/Users/jinke00001') || (home && data.includes(home))) offenders.push(e.name);
  }
  check('没有开发机绝对路径', offenders.length === 0, offenders.join(','));
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
