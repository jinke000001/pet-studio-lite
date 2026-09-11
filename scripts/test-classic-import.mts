import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { convertClassicShimejiDirectory } from '../src/main/classic-shimeji-import';
import { sharpImageProbe } from '../src/main/image-probe';
import { validatePetPack } from '../src/shared/petpack';
import { extractPetPackFromZip } from '../src/shared/zip';
import { createZip } from '../src/shared/zipw';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? `  (${detail})` : ''}`); }
}

async function hashTree(root: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  async function visit(dir: string): Promise<void> {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      hash.update(path.relative(root, abs));
      if (entry.isDirectory()) await visit(abs);
      else hash.update(await fs.readFile(abs));
    }
  }
  await visit(root);
  return hash.digest('hex');
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-shimeji-test-'));
try {
  console.log('[经典 Shimeji 资源转换]');
  const source = path.join(temp, 'Test Mushroom');
  const images = path.join(source, 'img');
  const conf = path.join(source, 'conf');
  await fs.mkdir(images, { recursive: true });
  await fs.mkdir(conf, { recursive: true });

  for (let index = 1; index <= 5; index += 1) {
    const rgba = { r: 30 * index, g: 20 * index, b: 10 * index, alpha: 1 };
    await sharp({ create: { width: 128, height: 128, channels: 4, background: rgba } })
      .png()
      .toFile(path.join(images, `shime${index}.png`));
  }
  const actions = `<?xml version="1.0"?><Mascot><ActionList>
    <Action Name="Stand" Type="Stay" BorderType="Floor"><Animation><Pose Image="/shime1.png" Duration="250" /></Animation></Action>
    <Action Name="Walk" Type="Move" BorderType="Floor"><Animation><Pose Image="/shime2.png" Duration="6" /><Pose Image="/shime3.png" Duration="6" /></Animation></Action>
    <Action Name="Fall" Type="Embedded"><Animation><Pose Image="/shime4.png" Duration="100" /></Animation></Action>
    <Action Name="Dragged" Type="Embedded"><Animation><Pose Image="/shime5.png" Duration="100" /></Animation></Action>
    <Action Name="Thrown" Type="Embedded"><ActionReference Name="Fall" /></Action>
    <Action Name="ChaseMouse" Type="Move"><ActionReference Name="Walk" /></Action>
  </ActionList></Mascot>`;
  const behaviors = `<Mascot><BehaviorList>
    <Behavior Name="Stand" Frequency="50"/><Behavior Name="Walk" Frequency="30"/>
    <Behavior Name="Fall" Frequency="10"/><Behavior Name="Dragged" Frequency="0"/>
    <Behavior Name="Thrown" Frequency="0"/><Behavior Name="ChaseMouse" Frequency="0"/>
  </BehaviorList></Mascot>`;
  await fs.writeFile(path.join(conf, 'actions.xml'), actions, 'utf8');
  await fs.writeFile(path.join(conf, 'behaviors.xml'), behaviors, 'utf8');

  const before = await hashTree(source);
  const convertedDir = path.join(temp, 'converted');
  const converted = await convertClassicShimejiDirectory(source, convertedDir);
  const validated = await validatePetPack(convertedDir, { probe: sharpImageProbe });
  check('传统 img + conf 目录转换为合法 Petdex v1 包', validated.ok && validated.pack.version === 'v1', validated.ok ? '' : validated.errors.join('；'));
  check('生成标准 1536×1872 透明 PNG 图集',
    validated.ok && validated.pack.sheet.width === 1536 && validated.pack.sheet.height === 1872 && validated.pack.sheetFormat === 'png');
  const generatedJson = JSON.parse(await fs.readFile(path.join(convertedDir, 'pet.json'), 'utf8')) as Record<string, unknown>;
  check('生成包保留安全编译后的经典行为资料',
    generatedJson['sourceFormat'] === 'classic-shimeji'
    && typeof generatedJson['classicProfile'] === 'object');
  check('转换结果默认保持 unknown 授权，不伪造可分发权利', generatedJson['license'] === 'unknown');
  check('转换全程不修改原经典包', before === await hashTree(source));
  check('动作引用可递归找到资源帧', converted.warnings.every((warning) => !warning.includes('ChaseMouse')));

  const zipEntries: Array<{ name: string; data: Buffer }> = [];
  for (const name of ['actions.xml', 'behaviors.xml']) {
    zipEntries.push({ name: `ClassicPack/conf/${name}`, data: await fs.readFile(path.join(conf, name)) });
  }
  for (let index = 1; index <= 5; index += 1) {
    zipEntries.push({
      name: `ClassicPack/img/shime${index}.png`,
      data: await fs.readFile(path.join(images, `shime${index}.png`)),
    });
  }
  zipEntries.push({ name: 'ClassicPack/README.txt', data: Buffer.from('not extracted') });
  const classicZip = path.join(temp, 'classic.zip');
  await fs.writeFile(classicZip, createZip(zipEntries));
  const extracted = path.join(temp, 'classic-extracted');
  await fs.mkdir(extracted);
  const written = await extractPetPackFromZip(classicZip, extracted);
  check('经典 Shimeji ZIP 只提取 XML/PNG 白名单内容',
    written.some((name) => name.endsWith('actions.xml'))
    && !await fs.stat(path.join(extracted, 'README.txt')).then(() => true, () => false));
  await convertClassicShimejiDirectory(extracted, path.join(temp, 'zip-converted'));
  check('经典 Shimeji ZIP 解压后可完成转换',
    (await validatePetPack(path.join(temp, 'zip-converted'), { probe: sharpImageProbe })).ok);

  const brokenSource = path.join(temp, 'Broken');
  await fs.cp(source, brokenSource, { recursive: true });
  await fs.rm(path.join(brokenSource, 'img', 'shime5.png'));
  let missingError = '';
  try {
    await convertClassicShimejiDirectory(brokenSource, path.join(temp, 'broken-output'));
  } catch (error) {
    missingError = error instanceof Error ? error.message : String(error);
  }
  check('引用图片缺失时明确拒绝且不生成半成品',
    missingError.includes('shime5.png')
    && !(await fs.stat(path.join(temp, 'broken-output')).then(() => true, () => false)));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}

console.log(`\n经典资源转换：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
