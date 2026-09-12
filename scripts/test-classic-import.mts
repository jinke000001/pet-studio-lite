import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { convertClassicShimejiDirectory } from '../src/main/classic-shimeji-import';
import { sharpImageProbe } from '../src/main/image-probe';
import { petPackToSpriteConfig, validatePetPack } from '../src/shared/petpack';
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

  for (let index = 1; index <= 8; index += 1) {
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
    <Action Name="Sit" Type="Stay" BorderType="Floor"><Animation><Pose Image="/shime6.png" Duration="250" /></Animation></Action>
    <Action Name="LookAround" Type="Animate" BorderType="Floor"><Animation><Pose Image="/shime7.png" Duration="250" /></Animation></Action>
    <Action Name="Run" Type="Move" BorderType="Floor"><Animation><Pose Image="/shime8.png" Duration="8" /></Animation></Action>
    <Action Name="ClimbCeiling" Type="Move" BorderType="Ceiling"><Animation><Pose Image="/shime4.png" Duration="8" /></Animation></Action>
    <Action Name="ClimbWall" Type="Move" BorderType="Wall"><Animation><Pose Image="/shime5.png" Duration="8" /></Animation></Action>
  </ActionList></Mascot>`;
  const behaviors = `<Mascot><BehaviorList>
    <Behavior Name="Stand" Frequency="50"/><Behavior Name="Walk" Frequency="30"/>
    <Behavior Name="Fall" Frequency="10"/><Behavior Name="Dragged" Frequency="0"/>
    <Behavior Name="Thrown" Frequency="0"/><Behavior Name="ChaseMouse" Frequency="0"/>
    <Behavior Name="Sit" Frequency="20"/><Behavior Name="LookAround" Frequency="10"/>
    <Behavior Name="Run" Frequency="15"/>
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
  const climbCell = await sharp(path.join(convertedDir, 'spritesheet.png'))
    .extract({ left: 0, top: 8 * 208, width: 192, height: 208 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const climbCenter = (104 * 192 + 96) * climbCell.info.channels;
  check('经典图集攀爬行优先使用 Wall 动作而不是 Ceiling 动作',
    climbCell.data[climbCenter] === 150
    && climbCell.data[climbCenter + 1] === 100
    && climbCell.data[climbCenter + 2] === 50);
  const centerColorForRow = async (row: number): Promise<number[]> => {
    const cell = await sharp(path.join(convertedDir, 'spritesheet.png'))
      .extract({ left: 0, top: row * 208, width: 192, height: 208 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center = (104 * 192 + 96) * cell.info.channels;
    return Array.from(cell.data.subarray(center, center + 3));
  };
  check('经典图集观察行优先使用 look 动作',
    JSON.stringify(await centerColorForRow(3)) === JSON.stringify([210, 140, 70]));
  check('经典图集等待行优先使用 sit 动作',
    JSON.stringify(await centerColorForRow(6)) === JSON.stringify([180, 120, 60]));
  check('经典图集奔跑行优先使用 run 动作',
    JSON.stringify(await centerColorForRow(7)) === JSON.stringify([240, 160, 80]));
  const generatedJson = JSON.parse(await fs.readFile(path.join(convertedDir, 'pet.json'), 'utf8')) as Record<string, unknown>;
  const namedOutput = path.join(temp, 'named-conversion');
  await convertClassicShimejiDirectory(source, namedOutput, { sourceName: 'My Mushroom' });
  const namedJson = JSON.parse(await fs.readFile(path.join(namedOutput, 'pet.json'), 'utf8'));
  check('ZIP 临时解压路径不进入角色名称与 ID', namedJson.displayName === 'My Mushroom' && namedJson.id === 'classic-my-mushroom');
  check('生成包保留安全编译后的经典行为资料',
    generatedJson['sourceFormat'] === 'classic-shimeji'
    && typeof generatedJson['classicProfile'] === 'object'
    && Array.isArray(generatedJson['classicBehaviorPlan']));
  if (validated.ok) {
    const sprite = petPackToSpriteConfig(validated.pack);
    check('经典 review 映射到观察行而 climbing 保持独立攀爬行',
      sprite.states.review?.frames[0] === 3 * sprite.frame.cols
      && sprite.states.climbing?.frames[0] === 8 * sprite.frame.cols);
  }
  check('转换包记录整套动画稳定 alpha 外框',
    JSON.stringify(generatedJson['contentInsets']) === JSON.stringify({ left: 0, top: 8, right: 0, bottom: 8 })
    && validated.ok
    && JSON.stringify(validated.pack.contentInsets) === JSON.stringify(generatedJson['contentInsets']));
  check('转换结果默认保持 unknown 授权，不伪造可分发权利', generatedJson['license'] === 'unknown');
  check('转换全程不修改原经典包', before === await hashTree(source));
  check('动作引用可递归找到资源帧', converted.warnings.every((warning) => !warning.includes('ChaseMouse')));

  const zeroPlanSource = path.join(temp, 'Zero Plan');
  await fs.cp(source, zeroPlanSource, { recursive: true });
  const zeroPlanBehaviors = `<Mascot><BehaviorList>
    <Behavior Name="Stand" Frequency="0"/><Behavior Name="Fall" Frequency="0"/>
    <Behavior Name="Dragged" Frequency="0"/><Behavior Name="Thrown" Frequency="0"/>
    <Behavior Name="ChaseMouse" Frequency="0"/>
  </BehaviorList></Mascot>`;
  await fs.writeFile(path.join(zeroPlanSource, 'conf', 'behaviors.xml'), zeroPlanBehaviors, 'utf8');
  const zeroPlanOutput = path.join(temp, 'zero-plan-output');
  await convertClassicShimejiDirectory(zeroPlanSource, zeroPlanOutput);
  const zeroPlanJson = JSON.parse(await fs.readFile(path.join(zeroPlanOutput, 'pet.json'), 'utf8')) as Record<string, unknown>;
  const zeroPlanValidated = await validatePetPack(zeroPlanOutput, { probe: sharpImageProbe });
  check('没有可安全执行的经典自动行为时回退通用调度器且仍可导入',
    !Object.prototype.hasOwnProperty.call(zeroPlanJson, 'classicBehaviorPlan')
    && zeroPlanValidated.ok,
    zeroPlanValidated.ok ? '' : zeroPlanValidated.errors.join('；'));

  const zipEntries: Array<{ name: string; data: Buffer }> = [];
  for (const name of ['actions.xml', 'behaviors.xml']) {
    zipEntries.push({ name: `ClassicPack/conf/${name}`, data: await fs.readFile(path.join(conf, name)) });
  }
  for (let index = 1; index <= 8; index += 1) {
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

  const tamperedDir = path.join(temp, 'tampered-plan');
  await fs.cp(convertedDir, tamperedDir, { recursive: true });
  const tamperedJson = JSON.parse(await fs.readFile(path.join(tamperedDir, 'pet.json'), 'utf8')) as Record<string, unknown>;
  tamperedJson['classicBehaviorPlan'] = [{ name: 'Unsafe', kind: 'execute-script', weight: 1, durationMs: 1_000 }];
  await fs.writeFile(path.join(tamperedDir, 'pet.json'), JSON.stringify(tamperedJson), 'utf8');
  const tampered = await validatePetPack(tamperedDir, { probe: sharpImageProbe });
  check('篡改后的未知运行行为在加载边界被拒绝',
    !tampered.ok && tampered.errors.some((error) => error.includes('类型不支持')));

  const fanoutSource = path.join(temp, 'Fanout');
  await fs.cp(source, fanoutSource, { recursive: true });
  const fanoutNodes = Array.from({ length: 8 }, (_, index) => {
    const target = index === 7 ? 'Stand' : `Fanout-${index + 1}`;
    return `<Action Name="Fanout-${index}" Type="Sequence">${Array.from({ length: 8 }, () => `<ActionReference Name="${target}" />`).join('')}</Action>`;
  }).join('');
  const fanoutActions = `<Mascot><ActionList>
    <Action Name="Stand" Type="Stay" BorderType="Floor"><Animation><Pose Image="/shime1.png" Duration="250" /></Animation></Action>
    <Action Name="Walk" Type="Move" BorderType="Floor">${Array.from({ length: 8 }, () => '<ActionReference Name="Fanout-0" />').join('')}</Action>
    ${fanoutNodes}
    <Action Name="Fall" Type="Embedded"><Animation><Pose Image="/shime4.png" Duration="100" /></Animation></Action>
    <Action Name="Dragged" Type="Embedded"><Animation><Pose Image="/shime5.png" Duration="100" /></Animation></Action>
    <Action Name="Thrown" Type="Embedded"><ActionReference Name="Fall" /></Action>
    <Action Name="ChaseMouse" Type="Move"><ActionReference Name="Walk" /></Action>
  </ActionList></Mascot>`;
  await fs.writeFile(path.join(fanoutSource, 'conf', 'actions.xml'), fanoutActions, 'utf8');
  await fs.writeFile(path.join(fanoutSource, 'conf', 'behaviors.xml'), `<Mascot><BehaviorList>
    <Behavior Name="Stand" Frequency="0"/><Behavior Name="Walk" Frequency="1"/>
    <Behavior Name="Fall" Frequency="0"/><Behavior Name="Dragged" Frequency="0"/>
    <Behavior Name="Thrown" Frequency="0"/><Behavior Name="ChaseMouse" Frequency="0"/>
  </BehaviorList></Mascot>`, 'utf8');
  const fanoutOutput = path.join(temp, 'fanout-output');
  await convertClassicShimejiDirectory(fanoutSource, fanoutOutput);
  check('高扇出经典动作引用只收集一个图集行所需帧，不会指数展开',
    (await validatePetPack(fanoutOutput, { probe: sharpImageProbe })).ok);

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
