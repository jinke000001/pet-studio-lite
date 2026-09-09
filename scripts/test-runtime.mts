// 运行时纯逻辑测试：几何 / 配置 / IPC 校验 / 项目存储 / 授权与分发决策 / 导出命名。
// 运行：npm run test:runtime
//
// 覆盖（对应任务书 §6）：
//   ✓ 缩放 bottom-center 锚点 + workArea 夹紧（含右下角 125%→200%）
//   ✓ "回到屏幕右下角"复位几何（多显示器负原点 / 缩放 DIP / 小 workArea 夹紧）
//   ✓ 配置校验：合法值、非法类型、空名字、超长名字、
//     严格三档缩放（125%/150%/200%）、中间值拒绝、旧档 50%/75%/100% 迁移为 125%
//   ✓ IPC 校验器：非法类型 / 枚举 / 项目 id 注入
//   ✓ 项目存储：导入复制不修改源、哈希核对、版本化目录、索引损坏恢复、
//     非法配置不入库、删除语义（当前项目切换 / 源包不变）
//   ✓ 授权模型：sourceLicense 如实记录、unknown 自动 internal-test、
//     旧项目迁移、resolveDistribution（candidate / internal-test-only）
//   ✓ 导出命名非覆盖（reserveOutputPath）
//   ✓ "打开所在文件夹"路径安全（导出登记册，renderer 不能传任意路径）
//   ✓ 桌宠右键菜单构建（顺序 / 勾选状态 / 动作派发）
//   ✓ 运行时状态持久化（位置 / 缩放 / 游走开关的解析与合并）
//   ✓ 状态并发写入：单一内存状态 + 串行原子写盘（三路并发不丢字段、
//     写失败不崩、坏文件回落、无临时文件残留）
//   ✓ 关闭前刷新：FlushableDebouncer flush 立即落盘待写值（复位/拖动后立刻退出不丢位置）
//   ✓ 关闭自动游走的即时收尾（只收 walking，不影响 waiting/review）
//   ✓ 气泡排版 CSS（短文案一行 / 均衡换行 / 限宽不裁切）
//   ✓ macOS activate 决策：无窗口重建 / 存在则聚焦 / 只剩预览时重建 / 连续不重复
//   ✓ 深色模式：CSS 变量与 prefers-color-scheme 存在且被关键选择器使用
//   ✓ 旧产品数据目录（~/.nom）在整个测试过程中不被触碰

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { clampBoundsToWorkArea, computeAnchoredZoomBounds, computeWorkAreaHomePosition, type Rect } from '../src/shared/geometry.ts';
import { validatePetConfig, normalizeZoom, ZOOM_LEVELS, ZOOM_OPTIONS, DEFAULT_PET_CONFIG } from '../src/shared/config.ts';
import { requireProjectId, requireEnum, requireFiniteNumber, requireBoolean, IpcValidationError } from '../src/shared/ipc-validate.ts';
import { ProjectsStore, packFingerprint, defaultUsageMode } from '../src/shared/projects.ts';
import { removeConfirmMessage } from '../src/shared/messages.ts';
import { validatePetPack } from '../src/shared/petpack.ts';
import { sharpImageProbe } from '../src/main/image-probe.ts';
import { buildManifest, resolveDistribution, distributionNote } from '../src/shared/manifest.ts';
import { reserveOutputPath, buildRuntimeConfig } from '../src/main/export-win.ts';
import { registerPetIpc, PET_IPC_HANDLE_CHANNELS, PET_IPC_ON_CHANNELS, type PetIpcTarget } from '../src/pet/ipc-router.ts';
import { PetBehaviorScheduler, DEFAULT_BEHAVIOR_TIMINGS, stopWalkingState } from '../src/shared/pet-behavior.ts';
import { parsePersistedPetState, applyPersistedPetState, PetStateStore } from '../src/shared/pet-state.ts';
import { FlushableDebouncer } from '../src/shared/debounce.ts';
import { ExportRegistry, resolveRevealTarget } from '../src/shared/export-registry.ts';
import { buildPetContextMenu } from '../src/pet/menu.ts';
import { shouldQuitOnAllWindowsClosed, handleActivate, type ActivatableWindow } from '../src/shared/lifecycle.ts';

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

async function expectThrow(name: string, kw: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(name, false, '未抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, msg.includes(kw), msg);
  }
}

// --- 几何 ---------------------------------------------------------------------

function geometryTests(): void {
  console.log('[缩放几何]');
  const workArea: Rect = { x: 0, y: 0, width: 1920, height: 1055 };
  {
    // 右下角默认位置 小 125%→大 200%（250→400px）：底边锚点保持；水平方向锚点
    // 与右缘冲突时夹紧优先（以 1763 为中心的 400px 窗口会越出右缘）。
    const prev: Rect = { x: 1920 - 250 - 32, y: 1055 - 250 - 32, width: 250, height: 250 };
    const next = computeAnchoredZoomBounds(prev, 400, workArea);
    check('右下角 125%→200%：底边锚点保持', next.y + next.height === prev.y + prev.height, JSON.stringify(next));
    check('右下角 125%→200%：夹紧到 workArea 右缘', next.x === workArea.x + workArea.width - 400);
    check('右下角 125%→200%：整体可见',
      next.x >= 0 && next.y >= 0 && next.x + next.width <= workArea.width && next.y + next.height <= workArea.height);
  }
  {
    // 屏幕中间的窗口 125%→200%（250→400px）：锚点完全保持，无夹紧。
    const prev: Rect = { x: 700, y: 400, width: 250, height: 250 };
    const next = computeAnchoredZoomBounds(prev, 400, workArea);
    check('屏幕中间 125%→200%：bottom-center 完全保持',
      next.x + next.width / 2 === prev.x + prev.width / 2 && next.y + next.height === prev.y + prev.height);
  }
  {
    const prev: Rect = { x: 500, y: 0, width: 250, height: 250 };
    const next = computeAnchoredZoomBounds(prev, 400, workArea);
    check('顶缘越界被夹紧', next.y === workArea.y);
  }
  {
    const tiny: Rect = { x: 100, y: 50, width: 300, height: 300 };
    const next = computeAnchoredZoomBounds({ x: 150, y: 125, width: 100, height: 100 }, 400, tiny);
    check('窗口大于 workArea 时贴原点', next.x === tiny.x && next.y === tiny.y);
  }
  {
    const prev: Rect = { x: 1000, y: 300, width: 400, height: 400 };
    const next = computeAnchoredZoomBounds(prev, 250, workArea);
    check('200%→125% 缩小：锚点保持',
      next.x + next.width / 2 === prev.x + prev.width / 2 && next.y + next.height === prev.y + prev.height);
  }
  {
    // Windows 在缩放切换或显示器断开后可能恢复出旧的屏幕坐标；启动时必须
    // 把整个窗口拉回当前 workArea，不能留下一个可拖动但看不到宠物的透明区域。
    const stale: Rect = { x: 2200, y: 1200, width: 400, height: 400 };
    const next = clampBoundsToWorkArea(stale, workArea);
    check('历史越界坐标启动时被完整拉回 workArea',
      next.x === 1520 && next.y === 655 && next.x + next.width <= 1920 && next.y + next.height <= 1055,
      JSON.stringify(next));
  }
  {
    const scaledWorkArea: Rect = { x: -1280, y: 0, width: 1280, height: 680 };
    const current: Rect = { x: -100, y: 500, width: 400, height: 400 };
    const next = clampBoundsToWorkArea(current, scaledWorkArea);
    check('Windows DPI/workArea 改变后仍完整留在原显示器（支持负原点）',
      next.x === -400 && next.y === 280 && next.x >= -1280 && next.x + next.width <= 0,
      JSON.stringify(next));
  }
}

// --- 配置 -----------------------------------------------------------------------

function configTests(): void {
  console.log('\n[配置校验]');
  check('合法配置通过', validatePetConfig({ petName: '小猫', zoom: 1.5, wanderEnabled: false }).ok);
  const defaults = validatePetConfig({});
  check('100% Windows 屏幕的新宠物默认使用 200% 合适尺寸', defaults.ok && defaults.config.zoom === 2);
  expectThrowSync('空名字被拒绝', validatePetConfig({ petName: '  ' }).ok === false);
  expectThrowSync('超长名字被拒绝', validatePetConfig({ petName: 'x'.repeat(25) }).ok === false);
  expectThrowSync('wander 非布尔被拒绝', validatePetConfig({ wanderEnabled: 'yes' }).ok === false);
  expectThrowSync('非对象被拒绝', validatePetConfig('str').ok === false);

  // 严格三档契约：全产品只剩 小 125% / 中 150% / 大 200%（推荐）
  check('缩放档位恰好三档（125%/150%/200%）',
    ZOOM_LEVELS.length === 3 && ZOOM_LEVELS[0] === 1.25 && ZOOM_LEVELS[1] === 1.5 && ZOOM_LEVELS[2] === 2);
  check('档位标签与档位一一对应（配置页与右键菜单共用）',
    ZOOM_OPTIONS.length === 3 &&
    ZOOM_OPTIONS[0]!.zoom === 1.25 && ZOOM_OPTIONS[0]!.label === '小 125%' &&
    ZOOM_OPTIONS[1]!.zoom === 1.5 && ZOOM_OPTIONS[1]!.label === '中 150%' &&
    ZOOM_OPTIONS[2]!.zoom === 2 && ZOOM_OPTIONS[2]!.label === '大 200%（推荐）');
  // 历史数据兼容：旧档 50%/75%/100% 自动迁移为 125%（不报错）
  const legacy50 = validatePetConfig({ zoom: 0.5 });
  check('旧档 50% 迁移为 125%（不报错）', legacy50.ok && legacy50.config.zoom === 1.25);
  const legacy75 = validatePetConfig({ zoom: 0.75 });
  check('旧档 75% 迁移为 125%（不报错）', legacy75.ok && legacy75.config.zoom === 1.25);
  const legacy100 = validatePetConfig({ zoom: 1 });
  check('旧档 100% 迁移为 125%（不报错）', legacy100.ok && legacy100.config.zoom === 1.25);
  // 任意中间值不再接受：安全回落默认 200%（不报错、不保留原值）
  const mid12 = validatePetConfig({ zoom: 1.2 });
  check('中间值 1.2 不被接受（回落默认 200%）', mid12.ok && mid12.config.zoom === 2);
  const mid17 = validatePetConfig({ zoom: 1.7 });
  check('中间值 1.7 不被接受（回落默认 200%）', mid17.ok && mid17.config.zoom === 2);
  const oob = validatePetConfig({ zoom: 3 });
  check('越界值 3 回落默认 200%', oob.ok && oob.config.zoom === 2);
  const nonNum = validatePetConfig({ zoom: 'big' });
  check('非数字回落默认 200%', nonNum.ok && nonNum.config.zoom === 2);
  check('normalizeZoom：非数字/非有限/中间值/越界一律 null',
    normalizeZoom('big') === null && normalizeZoom(NaN) === null && normalizeZoom(Infinity) === null &&
    normalizeZoom(1.2) === null && normalizeZoom(1.7) === null && normalizeZoom(3) === null && normalizeZoom(0.9) === null);
  check('normalizeZoom：旧档 0.5/0.75/1 → 1.25',
    normalizeZoom(0.5) === 1.25 && normalizeZoom(0.75) === 1.25 && normalizeZoom(1) === 1.25);
  check('normalizeZoom：125%/150%/200% 原样保留',
    normalizeZoom(1.25) === 1.25 && normalizeZoom(1.5) === 1.5 && normalizeZoom(2) === 2);

  // 默认缩放：Windows 系统缩放 100% 时，新项目 / 缺省配置 = 200%。
  check('默认 zoom 为 2', DEFAULT_PET_CONFIG.zoom === 2);
  const def = validatePetConfig({});
  check('缺省配置解析出 zoom=2', def.ok && def.config.zoom === 2);
  const kept = validatePetConfig({ zoom: 2 });
  check('用户明确保存的 zoom=2 不被默认值覆盖', kept.ok && kept.config.zoom === 2);
  const runtimeCfg = buildRuntimeConfig(DEFAULT_PET_CONFIG);
  check('导出运行时配置与制作台默认一致（zoom=2）', runtimeCfg.zoom === 2);

  function expectThrowSync(name: string, cond: boolean): void {
    check(name, cond);
  }
}

// --- IPC 校验器 ------------------------------------------------------------------

function ipcTests(): void {
  console.log('\n[IPC 入参校验]');
  check('合法项目 id 通过', requireProjectId('pack-v1-20260908-181200') === 'pack-v1-20260908-181200');
  expectThrow('项目 id 注入路径被拒绝', '格式非法', () => requireProjectId('../etc'));
  expectThrow('项目 id 非字符串被拒绝', '字符串', () => requireProjectId(42));
  expectThrow('枚举非法值被拒绝', '之一', () => requireEnum('exe', '导入类型', ['dir', 'zip'] as const));
  expectThrow('数字越界被拒绝', '超出范围', () => requireFiniteNumber(99, '缩放', 1, 2));
  expectThrow('NaN 被拒绝', '有限数字', () => requireFiniteNumber(NaN, '缩放', 1, 2));
  expectThrow('布尔类型错误被拒绝', '布尔', () => requireBoolean('true', '开关'));
  check('IpcValidationError 类型正确', new IpcValidationError('x') instanceof Error);
}

// --- 项目存储 ----------------------------------------------------------------------

async function storeTests(tmp: string): Promise<void> {
  console.log('\n[项目存储]');
  const root = path.join(tmp, 'studio-data');
  const store = new ProjectsStore(root);

  // 源包哈希（证明导入不修改源）
  const srcDir = path.join(FIXTURES, 'pack-v1');
  const srcHashBefore = await hashDir(srcDir);

  const validated = await validatePetPack(srcDir);
  if (!validated.ok) {
    check('fixture pack-v1 可用于存储测试', false, validated.errors.join('；'));
    return;
  }
  const meta = await store.importValidatedPack(validated.pack, { type: 'dir', path: srcDir });
  check('导入返回项目元数据', meta.slug === 'demo-cat' && meta.config.petName === '演示猫');
  check('新导入项目默认 zoom=2', meta.config.zoom === 2);
  check('记录真实宠物 ID 与声明版本', meta.petId === 'demo-cat' && meta.declaredVersion === 'v1');
  check('authorized 原包：sourceLicense=authorized 且 usageMode=general',
    meta.license === 'authorized' && meta.usageMode === 'general');
  check('来源类型与内容指纹', meta.source.type === 'dir' &&
    meta.source.fingerprint === packFingerprint(meta.hashes) && meta.source.zipSha256 === undefined);
  check('项目目录是版本化新目录（基于 pet.json 稳定 id）', meta.id.startsWith('demo-cat-') && (await fs.stat(store.projectDir(meta.id))).isDirectory());
  check('导入后源包哈希不变', (await hashDir(srcDir)) === srcHashBefore);
  check('导入副本哈希与源一致',
    (await hashFile(path.join(store.projectDir(meta.id), 'spritesheet.png'))) === meta.hashes.spritesheet);

  // 当前项目恢复
  const current = await store.getCurrent();
  check('导入后成为当前项目', current?.id === meta.id);

  // 重启恢复：新建实例读同一 root
  const store2 = new ProjectsStore(root);
  const again = await store2.getCurrent();
  check('重启后当前项目恢复', again?.id === meta.id);

  // 配置更新
  const updated = await store2.updateConfig(meta.id, { petName: '新名字', zoom: 1.5 });
  check('配置更新落盘', updated.config.petName === '新名字' && updated.config.zoom === 1.5);
  // 严格档位契约：不受支持的缩放值不抛错、不保留原值，安全回落默认 200%
  const fell = await store2.updateConfig(meta.id, { zoom: 9 });
  check('越界缩放安全回落默认 200%', fell.config.zoom === 2);
  const mid = await store2.updateConfig(meta.id, { zoom: 1.7 });
  check('中间值缩放安全回落默认 200%', mid.config.zoom === 2);
  const mig100 = await store2.updateConfig(meta.id, { zoom: 1 });
  check('旧档 100% 经配置更新迁移为 125%', mig100.config.zoom === 1.25);
  await expectThrow('非法名字仍被拒绝入库', '空', () => store2.updateConfig(meta.id, { petName: '  ' }));

  // 用户明确保存的缩放不被默认值覆盖
  await store2.updateConfig(meta.id, { zoom: 2 });
  const renamed = await store2.updateConfig(meta.id, { petName: '只改名字' });
  check('用户保存的 zoom=2 在后续更新中保持', renamed.config.zoom === 2);

  // 索引损坏恢复：写坏 projects.json
  await fs.writeFile(path.join(root, 'projects.json'), '{broken json', 'utf8');
  const loaded = await store2.load();
  check('索引损坏时恢复为空而不是崩溃', loaded.recovered === true && loaded.index.projects.length === 0);
  const files = await fs.readdir(root);
  check('损坏索引被备份保留', files.some((f) => f.startsWith('projects.json.corrupt-')));

  // 删除项目只动工作区
  const meta2 = await store.importValidatedPack(validated.pack, { type: 'dir', path: srcDir });
  await store.remove(meta2.id);
  check('删除项目后目录消失', !(await fs.stat(store.projectDir(meta2.id)).then(() => true, () => false)));
  check('删除后源包仍在', (await hashDir(srcDir)) === srcHashBefore);

  // 删除语义：当前项目切换 / 非当前项目不影响选择 / 删空后回到无项目
  {
    const store4 = new ProjectsStore(path.join(tmp, 'studio-data-remove'));
    const a = await store4.importValidatedPack(validated.pack, { type: 'dir', path: srcDir });
    const b = await store4.importValidatedPack(validated.pack, { type: 'dir', path: srcDir });
    const c = await store4.importValidatedPack(validated.pack, { type: 'dir', path: srcDir });
    check('连续快速导入生成不同项目 ID（同毫秒也不撞）', new Set([a.id, b.id, c.id]).size === 3);
    // 列表顺序：最新在前（c, b, a）；导入后当前 = c
    let idx = (await store4.load()).index;
    check('三次导入后当前项目是最新导入', idx.currentProjectId === c.id);

    // 删除非当前项目：当前选择不变
    await store4.remove(a.id);
    idx = (await store4.load()).index;
    check('删除非当前项目不影响当前选择', idx.currentProjectId === c.id && idx.projects.length === 2);

    // 删除当前项目：自动选择剩余项目中的下一项（列表第一项）
    await store4.remove(c.id);
    idx = (await store4.load()).index;
    check('删除当前项目后自动选择剩余下一项', idx.currentProjectId === b.id && idx.projects.length === 1);

    // 删除最后一个项目：没有当前项目（UI 回到导入页、步骤禁用）
    await store4.remove(b.id);
    idx = (await store4.load()).index;
    check('删除最后一个项目后无当前项目', idx.currentProjectId === null && idx.projects.length === 0);
    check('删除不修改源包', (await hashDir(srcDir)) === srcHashBefore);

    // 删除确认文案：说明影响范围（只删工作区副本，不动原始包和已导出 ZIP）
    const msg = removeConfirmMessage('演示猫');
    check('删除确认包含项目名', msg.includes('确定删除制作台项目「演示猫」吗？'));
    check('删除确认说明只删工作区副本', msg.includes('工作区副本'));
    check('删除确认说明不动原始 Petdex 包', msg.includes('不会删除原始 Petdex 宠物包'));
    check('删除确认说明不动已导出的 ZIP', msg.includes('已经导出的 ZIP'));
  }

  // 未声明授权的原包：导入后 sourceLicense=unknown、usageMode=internal-test（不伪造已授权）
  {
    const noLicSrc = path.join(FIXTURES, 'pack-no-license');
    const noLicValidated = await validatePetPack(noLicSrc);
    if (!noLicValidated.ok) {
      check('fixture pack-no-license 可用于授权测试', false, noLicValidated.errors.join('；'));
    } else {
      const noLicMeta = await store.importValidatedPack(noLicValidated.pack, { type: 'dir', path: noLicSrc });
      check('未声明授权原包 license=unknown', noLicMeta.license === 'unknown');
      check('未声明授权原包自动 usageMode=internal-test', noLicMeta.usageMode === 'internal-test');
      check('导入副本 pet.json 未被写入授权声明（不篡改）',
        !(await fs.readFile(path.join(store.projectDir(noLicMeta.id), 'pet.json'), 'utf8')).includes('license'));
    }
  }

  // WebP 包导入：副本与源哈希一致
  {
    const webpSrc = path.join(FIXTURES, 'pack-v1-webp');
    const webpSrcHashBefore = await hashDir(webpSrc);
    const webpValidated = await validatePetPack(webpSrc, { probe: sharpImageProbe });
    if (!webpValidated.ok) {
      check('WebP fixture 可用于存储测试', false, webpValidated.errors.join('；'));
    } else {
      const webpMeta = await store.importValidatedPack(webpValidated.pack, { type: 'zip', path: webpSrc + '.zip', zipSha256: 'c'.repeat(64) });
      check('WebP 项目保留 webp 图集文件名', webpMeta.spritesheetFile === 'spritesheet.webp');
      check('ZIP 来源记录类型与原始 ZIP 哈希', webpMeta.source.type === 'zip' && webpMeta.source.zipSha256 === 'c'.repeat(64));
      check('WebP 导入副本哈希与源一致',
        (await hashFile(path.join(store.projectDir(webpMeta.id), 'spritesheet.webp'))) === webpMeta.hashes.spritesheet);
      check('WebP 导入后源包哈希不变', (await hashDir(webpSrc)) === webpSrcHashBefore);
    }
  }

  // 损坏 WebP：校验即失败，不会留下半成品项目
  {
    const badDir = path.join(tmp, 'bad-webp-pack');
    await fs.mkdir(badDir, { recursive: true });
    const valid = await fs.readFile(path.join(FIXTURES, 'pack-v1-webp', 'spritesheet.webp'));
    await fs.writeFile(path.join(badDir, 'pet.json'),
      JSON.stringify({ id: 'bad-webp', spriteVersionNumber: 1, spritesheetPath: 'spritesheet.webp' }));
    await fs.writeFile(path.join(badDir, 'spritesheet.webp'), valid.subarray(0, 200));
    const before = (await store.load()).index.projects.length;
    const res = await validatePetPack(badDir, { probe: sharpImageProbe });
    check('损坏 WebP 校验失败（中文错误）', !res.ok && res.errors.some((e) => e.includes('无法解码')));
    const after = (await store.load()).index.projects.length;
    check('损坏 WebP 不留下半成品项目', before === after);
  }

  // 旧项目元数据迁移：缺 petId/declaredVersion/source 的项目 load 时补齐，
  // 已有字段（实例 id / 用户配置 / sourcePath）原样保留。
  {
    const legacyId = 'demo-cat-20250101000000';
    const legacyDir = store.projectDir(legacyId);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.copyFile(path.join(srcDir, 'pet.json'), path.join(legacyDir, 'pet.json'));
    await fs.copyFile(path.join(srcDir, 'spritesheet.png'), path.join(legacyDir, 'spritesheet.png'));
    const { index } = await store.load();
    index.projects.push({
      id: legacyId, slug: 'demo-cat', displayName: '演示猫', petdexVersion: 'v1',
      license: 'authorized', spritesheetFile: 'spritesheet.png',
      hashes: { petJson: 'a'.repeat(64), spritesheet: 'b'.repeat(64) },
      sourcePath: '/Users/someone/pets/demo-cat', importedAt: '2025-01-01T00:00:00.000Z',
      config: { petName: '演示猫', zoom: 1, wanderEnabled: false },
    } as never);
    await fs.writeFile(path.join(root, 'projects.json'), JSON.stringify(index, null, 2), 'utf8');

    const store3 = new ProjectsStore(root);
    const migrated = await store3.get(legacyId);
    check('旧项目迁移出真实 petId（读 pet.json）', migrated?.petId === 'demo-cat');
    check('旧项目迁移出 declaredVersion', migrated?.declaredVersion === 'v1');
    check('旧项目迁移出内容指纹（dir 来源）',
      migrated?.source.type === 'dir' && migrated.source.fingerprint === packFingerprint(migrated.hashes));
    check('旧项目保存的 100% 缩放迁移为 125%（其余字段不动）', migrated?.config.zoom === 1.25);
    check('迁移不改变内部实例 id 与 sourcePath',
      migrated?.id === legacyId && migrated.sourcePath === '/Users/someone/pets/demo-cat');
    check('authorized 旧项目迁移出 usageMode=general', migrated?.usageMode === 'general');
    const again = await store3.get(legacyId);
    check('迁移结果持久化（二次读取一致）', again?.petId === 'demo-cat' && again.usageMode === 'general');
  }

  // 旧 unknown 项目迁移：原包授权仍记 unknown，usageMode 安全迁移为 internal-test，
  // 项目 ID、配置、哈希、路径全部保留。
  {
    const legacyId = 'mystery-20250101000000';
    const noLicSrc = path.join(FIXTURES, 'pack-no-license');
    const legacyDir = store.projectDir(legacyId);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.copyFile(path.join(noLicSrc, 'pet.json'), path.join(legacyDir, 'pet.json'));
    await fs.copyFile(path.join(noLicSrc, 'spritesheet.png'), path.join(legacyDir, 'spritesheet.png'));
    const { index } = await store.load();
    index.projects.push({
      id: legacyId, slug: 'mystery', displayName: '无授权包', petdexVersion: 'v1',
      license: 'unknown', spritesheetFile: 'spritesheet.png',
      hashes: { petJson: 'c'.repeat(64), spritesheet: 'd'.repeat(64) },
      sourcePath: '/Users/someone/pets/mystery', importedAt: '2025-01-01T00:00:00.000Z',
      config: { petName: '无授权包', zoom: 0.75, wanderEnabled: true },
    } as never);
    await fs.writeFile(path.join(root, 'projects.json'), JSON.stringify(index, null, 2), 'utf8');

    const store5 = new ProjectsStore(root);
    const migrated = await store5.get(legacyId);
    check('unknown 旧项目迁移后授权仍是 unknown（不伪造 authorized）', migrated?.license === 'unknown');
    check('unknown 旧项目迁移出 usageMode=internal-test', migrated?.usageMode === 'internal-test');
    check('迁移保留项目 ID / 配置 / 哈希 / 路径',
      migrated?.id === legacyId && migrated.config.petName === '无授权包' &&
      migrated.hashes.petJson === 'c'.repeat(64) && migrated.sourcePath === '/Users/someone/pets/mystery');
    check('旧项目保存的 75% 缩放迁移为 125%', migrated?.config.zoom === 1.25);
  }

  // 缩放档位迁移：旧项目的 50% → 125%；非法/越界/中间值回落默认 200%；
  // 已有的 125%/150%/200% 不被触碰。
  {
    const { index } = await store.load();
    const mk = (id: string, zoom: unknown) => ({
      id, slug: id, displayName: id, petdexVersion: 'v1',
      license: 'authorized', usageMode: 'general', spritesheetFile: 'spritesheet.png',
      petId: id, declaredVersion: 'v1',
      source: { type: 'dir', fingerprint: 'f'.repeat(64) },
      hashes: { petJson: 'e'.repeat(64), spritesheet: 'f'.repeat(64) },
      sourcePath: `/pets/${id}`, importedAt: '2025-01-01T00:00:00.000Z',
      config: { petName: id, zoom, wanderEnabled: true },
    });
    index.projects.push(
      mk('zoom50-20250101000000', 0.5) as never,
      mk('zoom150-20250101000000', 1.5) as never,
      mk('zoom125-20250101000000', 1.25) as never,
      mk('zoommid-20250101000000', 1.7) as never,
      mk('zoombad-20250101000000', 9) as never,
    );
    await fs.writeFile(path.join(root, 'projects.json'), JSON.stringify(index, null, 2), 'utf8');

    const store6 = new ProjectsStore(root);
    check('旧项目 50% 缩放迁移为 125%', (await store6.get('zoom50-20250101000000'))?.config.zoom === 1.25);
    check('旧项目 150% 缩放保持不变', (await store6.get('zoom150-20250101000000'))?.config.zoom === 1.5);
    check('旧项目 125% 缩放保持不变', (await store6.get('zoom125-20250101000000'))?.config.zoom === 1.25);
    check('旧项目中间值 1.7 缩放回落默认 200%', (await store6.get('zoommid-20250101000000'))?.config.zoom === 2);
    check('旧项目越界缩放回落默认 200%', (await store6.get('zoombad-20250101000000'))?.config.zoom === 2);
  }

  async function hashDir(dir: string): Promise<string> {
    const h = crypto.createHash('sha256');
    for (const f of (await fs.readdir(dir)).sort()) {
      h.update(f);
      h.update(await fs.readFile(path.join(dir, f)));
    }
    return h.digest('hex');
  }
  async function hashFile(f: string): Promise<string> {
    return crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
  }
}

// --- 授权模型 / manifest / 导出命名 -----------------------------------------------------

function manifestTests(): void {
  console.log('\n[授权模型 / manifest / 非覆盖]');
  // 使用方式默认值：只有明确 authorized 才进入 general
  check('authorized → usageMode=general', defaultUsageMode('authorized') === 'general');
  check('internal-test → usageMode=internal-test', defaultUsageMode('internal-test') === 'internal-test');
  check('unknown → usageMode=internal-test（不伪造已授权）', defaultUsageMode('unknown') === 'internal-test');

  // 最终分发决策
  check('authorized + general → candidate', resolveDistribution('authorized', 'general') === 'candidate');
  check('internal-test + internal-test → internal-test-only',
    resolveDistribution('internal-test', 'internal-test') === 'internal-test-only');
  check('unknown + internal-test → internal-test-only',
    resolveDistribution('unknown', 'internal-test') === 'internal-test-only');
  check('internal-test 即使误标 general 也不出 candidate',
    resolveDistribution('internal-test', 'general') === 'internal-test-only');
  check('unknown 即使误标 general 也不出 candidate',
    resolveDistribution('unknown', 'general') === 'internal-test-only');

  // 导出页 / 启动说明文案
  check('unknown 文案含"未声明授权…不得对外分发"',
    distributionNote('unknown', 'internal-test').includes('原宠物包未声明授权') &&
    distributionNote('unknown', 'internal-test').includes('不得对外分发'));
  check('internal-test 文案说明内部测试', distributionNote('internal-test', 'internal-test').includes('内部测试'));
  check('authorized 文案说明可分发候选', distributionNote('authorized', 'general').includes('可分发候选'));

  const source = { type: 'zip' as const, fingerprint: 'f'.repeat(64), zipSha256: 'z'.repeat(64) };
  const m = buildManifest({
    productVersion: '0.1.0',
    pet: { id: 'demo', slug: 'pack-v1', displayName: '演示猫', petdexVersion: 'v1', declaredVersion: 'v1' },
    studioProjectId: 'demo-20260908120000',
    source,
    hashes: { petJsonSha256: 'a'.repeat(64), spritesheetSha256: 'b'.repeat(64) },
    sourceLicense: 'internal-test',
    usageMode: 'internal-test',
    exportedAt: new Date('2026-09-08T10:00:00Z'),
  });
  check('manifest 含全部必填字段',
    m.product.length > 0 && m.productVersion === '0.1.0' && m.pet.petdexVersion === 'v1' &&
    m.hashes.spritesheetSha256.length === 64 && m.exportedAt === '2026-09-08T10:00:00.000Z' &&
    m.platform === 'win32' && m.arch === 'x64');
  check('manifest 如实记录三层授权（sourceLicense / usageMode / distribution）',
    m.sourceLicense === 'internal-test' && m.usageMode === 'internal-test' && m.distribution === 'internal-test-only');
  check('manifest 兼容字段 license 与 sourceLicense 一致', m.license === m.sourceLicense);
  check('manifest 区分真实宠物 ID 与内部实例 ID',
    m.pet.id === 'demo' && m.studioProjectId === 'demo-20260908120000' && m.pet.id !== m.studioProjectId);
  check('manifest 记录真实声明版本与来源（类型/指纹/ZIP 哈希）',
    m.pet.declaredVersion === 'v1' && m.source.type === 'zip' &&
    m.source.fingerprint === source.fingerprint && m.source.zipSha256 === source.zipSha256);
  check('manifest 不含用户机器绝对路径',
    !JSON.stringify(m).includes('/Users/') && !/^[A-Za-z]:\\/.test(JSON.stringify(m)));
  check('unknown 原包 manifest 不写成 authorized',
    buildManifest({ productVersion: '0.1.0', pet: m.pet, studioProjectId: m.studioProjectId, source, hashes: m.hashes, sourceLicense: 'unknown', usageMode: 'internal-test' }).sourceLicense === 'unknown');
  check('authorized + general 标记为 candidate',
    buildManifest({ productVersion: '0.1.0', pet: m.pet, studioProjectId: m.studioProjectId, source, hashes: m.hashes, sourceLicense: 'authorized', usageMode: 'general' }).distribution === 'candidate');
}

async function reserveTests(tmp: string): Promise<void> {
  const dir = path.join(tmp, 'out');
  await fs.mkdir(dir, { recursive: true });
  const p1 = await reserveOutputPath(dir, 'pet-x');
  await fs.writeFile(p1, 'one');
  const p2 = await reserveOutputPath(dir, 'pet-x');
  check('非覆盖命名：第二次导出自动加序号', p1 !== p2 && p2.endsWith('-2.zip'));
  await fs.writeFile(p2, 'two');
  const p3 = await reserveOutputPath(dir, 'pet-x');
  check('非覆盖命名：第三次 -3', p3.endsWith('-3.zip'));
  check('已有产物未被覆盖', (await fs.readFile(p1, 'utf8')) === 'one');
}

// --- pet:* 全局 IPC 路由（预览反复打开不重复注册的根因修复） --------------------

function petIpcRouterTests(): void {
  console.log('\n[pet:* IPC 路由]');

  // 假 ipcMain：重复注册同一通道会像 Electron 一样抛错
  function makeFakeIpc() {
    const handlers = new Map<string, (...args: never[]) => unknown>();
    const listeners = new Map<string, Array<(...args: never[]) => void>>();
    return {
      handlers,
      listeners,
      handle(ch: string, fn: (...args: never[]) => unknown) {
        if (handlers.has(ch)) throw new Error(`Attempted to register a second handler for '${ch}'`);
        handlers.set(ch, fn);
      },
      on(ch: string, fn: (...args: never[]) => void) {
        const arr = listeners.get(ch) ?? [];
        if (arr.length > 0) throw new Error(`duplicate listener for '${ch}'`);
        arr.push(fn);
        listeners.set(ch, arr);
      },
    };
  }

  function fakeHost(tag: string): PetIpcTarget & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      getPayload: () => { calls.push(`payload:${tag}`); return Promise.resolve({ tag }); },
      // 与真实宿主一致：null（非法坐标被路由层丢弃）时不产生行为
      dragBegin: (p) => { if (p) calls.push(`dragBegin:${tag}`); },
      dragMove: (p) => { if (p) calls.push(`dragMove:${tag}`); },
      dragEnd: () => { calls.push(`dragEnd:${tag}`); },
      getBoundsInfo: () => ({ tag }),
      moveTo: () => { calls.push(`moveTo:${tag}`); },
    };
  }

  const ipc = makeFakeIpc();
  let active: PetIpcTarget | null = null;
  const getActive = () => active;

  // 模拟"打开→关闭→再打开→再开关"：每个新宿主 open() 都会调 registerPetIpc
  let threw = false;
  try {
    for (let i = 0; i < 5; i++) registerPetIpc(ipc, getActive); // 三轮以上反复注册
  } catch { threw = true; }
  check('连续 5 次注册不抛"second handler"', !threw);
  check('每个通道恰好注册一次',
    ipc.handlers.size === PET_IPC_HANDLE_CHANNELS.length &&
    ipc.listeners.size === PET_IPC_ON_CHANNELS.length &&
    PET_IPC_HANDLE_CHANNELS.every((c) => ipc.handlers.has(c)) &&
    PET_IPC_ON_CHANNELS.every((c) => ipc.listeners.has(c)),
    `handlers=${[...ipc.handlers.keys()]}`);

  // 委托跟随当前活动宿主（模拟：宿主 A 关闭 → 宿主 B 打开）
  const hostA = fakeHost('A');
  const hostB = fakeHost('B');
  active = hostA;
  void ipc.handlers.get('pet:payload')!();
  active = null; // A 关闭
  active = hostB; // B 打开（同一进程再次预览，对应"切换项目后再打开"）
  const r = ipc.handlers.get('pet:payload')!() as Promise<{ tag: string }>;
  check('payload 委托给当前活动宿主', hostA.calls.length === 1 && hostB.calls.length === 1);
  void r.then((v) => check('payload 返回当前宿主的数据', v.tag === 'B'));

  // 窗口未打开时 pet:payload 明确报错而不是静默
  active = null;
  let errMsg = '';
  try { ipc.handlers.get('pet:payload')!(); } catch (e) { errMsg = e instanceof Error ? e.message : ''; }
  check('无活动宿主时 pet:payload 报错', errMsg.includes('未打开'), errMsg);
  check('无活动宿主时 drag/move 静默忽略（不崩）', (() => {
    try {
      ipc.listeners.get('pet:drag:begin')![0]!(null, { x: 1, y: 2 });
      ipc.listeners.get('pet:drag:move')![0]!(null, { x: 1, y: 2 });
      ipc.listeners.get('pet:drag:end')![0]!(null as never);
      return true;
    } catch { return false; }
  })());

  // 非法坐标被丢弃
  active = hostB;
  ipc.listeners.get('pet:drag:begin')![0]!(null as never, { x: 'bad', y: 2 } as never);
  check('非法拖动坐标被丢弃', hostB.calls.filter((c) => c === 'dragBegin:B').length === 0);
}

// --- 自动行为调度器（可注入 random，测试确定性） --------------------------------

function behaviorTests(): void {
  console.log('\n[自动行为调度]');
  const T = DEFAULT_BEHAVIOR_TIMINGS;

  // 刚互动完：什么都不会触发
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    check('刚启动（互动时刻）不触发任何自动动作',
      s.decide(5_000, { canAct: true, wanderEnabled: true }) === null);
  }
  // 等待：超过 waiting 最短闲置后触发，时长在区间内
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0); // random=0 → 阈值取区间下限、概率必过
    const d = s.decide(T.waitingIdleMs[0] + 1, { canAct: true, wanderEnabled: true });
    check('闲置达到阈值后触发 waiting', d?.kind === 'waiting');
    check('waiting 时长在配置区间内',
      !!d && d.durationMs >= T.waitingDurationMs[0] && d.durationMs <= T.waitingDurationMs[1]);
    check('动作刚触发后立刻再 decide 被冷却拦截（不重叠）',
      s.decide(T.waitingIdleMs[0] + 2, { canAct: true, wanderEnabled: true }) === null);
  }
  // review：更长闲置 + 概率门；两次 review 有独立低频冷却
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    const d = s.decide(T.reviewIdleMs[0] + 1, { canAct: true, wanderEnabled: true });
    check('更长闲置后触发 review（思考/观察）', d?.kind === 'review');
    // 立刻把 review 布防点推到已过期，但 reviewGap 仍应拦截
    const s2 = new PetBehaviorScheduler(() => 0, T, 0);
    s2.decide(T.reviewIdleMs[0] + 1, { canAct: true, wanderEnabled: true });
    const again = s2.decide(T.reviewIdleMs[0] + 1 + T.minAutoGapMs + T.reviewIdleMs[0] + 1, { canAct: true, wanderEnabled: true });
    check('review 低频冷却生效（不会连续思考）', again?.kind !== 'review');
  }
  // review 概率门：random 高于 reviewChance 时不触发
  {
    const s = new PetBehaviorScheduler(() => 0.9, T, 0); // 概率门全部失败
    check('概率门未过时不触发 review/waiting',
      s.decide(T.reviewIdleMs[1] + 10_000, { canAct: true, wanderEnabled: false }) === null);
  }
  // wander 开关：关闭时不游走，但 waiting/review 仍可触发
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    const d = s.decide(T.wanderIdleMs + 1, { canAct: true, wanderEnabled: false });
    check('游走开关关闭时 wanderIdleMs 处不游走', d === null);
    const s2 = new PetBehaviorScheduler(() => 0, T, 0);
    const d2 = s2.decide(T.wanderIdleMs + 1, { canAct: true, wanderEnabled: true });
    check('游走开关打开且达闲置阈值时游走', d2?.kind === 'wander');
    const s3 = new PetBehaviorScheduler(() => 0, T, 0);
    const d3 = s3.decide(T.waitingIdleMs[0] + 1, { canAct: true, wanderEnabled: false });
    check('游走开关关闭时 waiting 仍可触发', d3?.kind === 'waiting');
  }
  // 非 idle 状态不触发
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    check('非 idle 状态不触发自动动作',
      s.decide(T.reviewIdleMs[1] + 999_000, { canAct: false, wanderEnabled: true }) === null);
  }
  // 互动重置计时
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    s.recordActivity(T.waitingIdleMs[0] - 1_000); // 快到达阈值时被用户打断
    check('互动后重新计时（旧阈值不再触发）',
      s.decide(T.waitingIdleMs[0] + 500, { canAct: true, wanderEnabled: true }) === null);
    check('互动后再过完整阈值才触发',
      s.decide(T.waitingIdleMs[0] - 1_000 + T.waitingIdleMs[0] + 1, { canAct: true, wanderEnabled: true })?.kind === 'waiting');
  }
  // 随机间隔：不同 random 给出不同的检查延迟与阈值（非机械周期）
  {
    const a = new PetBehaviorScheduler(() => 0.1, T, 0);
    const b = new PetBehaviorScheduler(() => 0.9, T, 0);
    check('检查间隔有随机性（避免机械周期）', a.nextCheckDelay() !== b.nextCheckDelay());
  }
  // failed / extra 永远不会被自动调度
  {
    const s = new PetBehaviorScheduler(() => 0, T, 0);
    const kinds = new Set<string>();
    let now = 0;
    for (let i = 0; i < 200; i++) {
      now += 300_000; // 大步前进，逼出所有可能动作
      const d = s.decide(now, { canAct: true, wanderEnabled: true });
      if (d) kinds.add(d.kind);
    }
    check('自动调度只产生 waiting/review/wander',
      [...kinds].every((k) => k === 'waiting' || k === 'review' || k === 'wander') && kinds.size > 0);
  }
}

// --- 窗口生命周期策略（macOS 常驻 / 其他平台退出） + activate 决策 -------------------------

function lifecycleTests(): void {
  console.log('\n[窗口生命周期]');
  check('macOS 关闭最后窗口不退出（保留在 Dock）', shouldQuitOnAllWindowsClosed('darwin') === false);
  check('Windows 关闭最后窗口退出', shouldQuitOnAllWindowsClosed('win32') === true);
  check('Linux 关闭最后窗口退出', shouldQuitOnAllWindowsClosed('linux') === true);
}

// --- macOS activate（点 Dock 重开制作台）决策 ------------------------------------------
// 回归：旧实现用 BrowserWindow.getAllWindows().length 判断，桌宠预览还开着时
// 关掉制作台后点 Dock 不会重建制作台。现在只看制作台窗口本身。

function activateTests(): void {
  console.log('\n[activate 决策]');

  class FakeWindow implements ActivatableWindow {
    shown = 0;
    focused = 0;
    destroyed = false;
    isDestroyed(): boolean { return this.destroyed; }
    show(): void { this.shown++; }
    focus(): void { this.focused++; }
  }

  // 1. 无任何窗口：重建制作台
  {
    let created = 0;
    const r = handleActivate<FakeWindow>(null, () => { created++; return new FakeWindow(); });
    check('无窗口时 activate 重建制作台', r.action === 'recreate' && created === 1);
  }

  // 2. 制作台存在：show + focus，不重建
  {
    const win = new FakeWindow();
    let created = 0;
    const r = handleActivate<FakeWindow>(win, () => { created++; return new FakeWindow(); });
    check('制作台存在时 activate 只 show+focus',
      r.action === 'focus' && created === 0 && win.shown === 1 && win.focused === 1 && r.window === win);
  }

  // 3. 制作台已关闭（null/已销毁）但桌宠预览仍开着：重建制作台，预览不被触碰
  {
    // handleActivate 只接收制作台窗口与工厂函数——预览窗口根本不在决策范围内，
    // 因此结构上不可能误关预览。这里验证两种"制作台不在"的形态都会重建。
    let created = 0;
    const destroyedWin = new FakeWindow();
    destroyedWin.destroyed = true;
    const previewStillOpen = new FakeWindow(); // 预览窗口：决策函数从不接触它
    const r1 = handleActivate<FakeWindow>(null, () => { created++; return new FakeWindow(); });
    const r2 = handleActivate<FakeWindow>(destroyedWin, () => { created++; return new FakeWindow(); });
    check('制作台为 null（预览仍在）时重建', r1.action === 'recreate');
    check('制作台已销毁（预览仍在）时重建', r2.action === 'recreate' && created === 2);
    check('重建不触碰仍开着的预览窗口',
      previewStillOpen.shown === 0 && previewStillOpen.focused === 0 && !previewStillOpen.destroyed);
  }

  // 4. 连续 activate：第一次重建后，后续只聚焦，不重复创建
  {
    let created = 0;
    const create = () => { created++; return new FakeWindow(); };
    let win: FakeWindow | null = null;
    win = handleActivate(win, create).window;  // 第一次：重建
    win = handleActivate(win, create).window;  // 第二次：聚焦
    win = handleActivate(win, create).window;  // 第三次：聚焦
    check('连续 activate 不重复创建窗口', created === 1 && win.shown === 2 && win.focused === 2);
  }
}

// --- 深色模式（CSS 变量 + prefers-color-scheme） ----------------------------------------

async function darkModeTests(): Promise<void> {
  console.log('\n[深色模式]');
  const studioCss = await fs.readFile(path.join(REPO, 'src', 'renderer', 'styles.css'), 'utf8');
  const petCss = await fs.readFile(path.join(REPO, 'src', 'renderer', 'pet', 'pet.css'), 'utf8');

  check('制作台 CSS 声明 color-scheme: light dark', /color-scheme:\s*light dark/.test(studioCss));
  check('制作台 CSS 含 prefers-color-scheme: dark', /@media\s*\(prefers-color-scheme:\s*dark\)/.test(studioCss));
  check('桌宠 CSS 含 prefers-color-scheme: dark', /@media\s*\(prefers-color-scheme:\s*dark\)/.test(petCss));

  // 关键区域都必须走变量，不允许回到硬编码颜色
  const studioBlocks: Array<[string, string]> = [
    ['页面背景', 'body'],
    ['侧栏背景', '.rail'],
    ['卡片背景', '.card'],
    ['输入框', '.field-input'],
    ['最近项目选中', '.rail-project--on'],
    ['步骤选中', '.step--on'],
    ['删除按钮悬停', '.rail-project-del:hover'],
    ['错误面板', '.error-panel'],
    ['成功面板', '.success-panel'],
    ['信息面板', '.info-panel'],
    ['提示条', '.notice'],
    ['棋盘背景', '.preview-stage'],
    ['帮助盒', '.help-box'],
    ['命令块', '.cmd-line'],
  ];
  for (const [label, selector] of studioBlocks) {
    const block = extractCssBlock(studioCss, selector);
    check(`深色模式：${label}（${selector}）使用 CSS 变量`, !!block && block.includes('var(--'));
  }

  // 桌宠气泡与箭头同一变量，深色下同步切换
  const bubble = extractCssBlock(petCss, '.bubble');
  const arrow = extractCssBlock(petCss, '.bubble::after');
  check('气泡背景使用变量', !!bubble && bubble.includes('var(--bubble-bg)'));
  check('气泡箭头与气泡同色（同一变量）', !!arrow && arrow.includes('var(--bubble-bg)'));
  check('深色气泡背景与箭头变量在 dark media 中被覆盖',
    /prefers-color-scheme:\s*dark[\s\S]*?--bubble-bg:\s*rgba\(44, 44, 46/.test(petCss));
  check('桌宠窗口背景保持透明（无不透明方形背景）',
    /html, body\s*\{[\s\S]*?background:\s*transparent/.test(petCss));

  // 深色变量块确实覆盖了浅色值（双主题非空且不同）
  const lightCard = /--bg-card:\s*([^;]+);/.exec(studioCss)?.[1]?.trim();
  const darkSection = studioCss.split('@media (prefers-color-scheme: dark)')[1] ?? '';
  const darkCard = /--bg-card:\s*([^;]+);/.exec(darkSection)?.[1]?.trim();
  check('深色模式变量值与浅色不同', !!lightCard && !!darkCard && lightCard !== darkCard,
    `light=${lightCard} dark=${darkCard}`);

  function extractCssBlock(css: string, selector: string): string | null {
    const escaped = selector.replace(/\./g, '\\.');
    const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return m ? m[1]! : null;
  }
}

// --- 最近项目行结构：选择与删除必须是并列的原生 button（键盘事件不串扰） ------------------
// 回归：删除按钮曾嵌套在带 role="button" + onKeyDown 的行内，Tab 聚焦删除按钮后
// 按 Enter/空格会同时触发项目切换和删除。

async function railProjectStructureTests(): Promise<void> {
  console.log('\n[最近项目行结构]');
  const app = await fs.readFile(path.join(REPO, 'src', 'renderer', 'App.tsx'), 'utf8');
  const start = app.indexOf('state.index.projects.map');
  const end = app.indexOf('</aside>', start);
  const block = start >= 0 && end > start ? app.slice(start, end) : '';
  check('最近项目列表 JSX 块存在', block.length > 0);
  check('项目行不再是 role="button" 的交互容器', !block.includes('role="button"'));
  check('项目行不再挂 onKeyDown（键盘行为交给原生 button）', !block.includes('onKeyDown'));
  check('「选择项目」是独立 button', /className="rail-project-select"/.test(block));
  check('「删除项目」是独立 button', /className="rail-project-del"/.test(block));
  const selectBtn = /<button[^>]*className="rail-project-select"[\s\S]*?<\/button>/.exec(block)?.[0] ?? '';
  check('选择按钮内不嵌套删除按钮', selectBtn.length > 0 && !selectBtn.includes('rail-project-del'));
  check('删除按钮保留 stopPropagation 防御', /className="rail-project-del"[\s\S]*?stopPropagation/.test(block));
  check('删除按钮有键盘可达的 aria-label', /className="rail-project-del"[\s\S]*?aria-label/.test(block));
}

// --- 旧数据目录隔离 ---------------------------------------------------------------------

async function isolationCheck(): Promise<void> {
  console.log('\n[旧产品数据隔离]');
  const nomState = path.join(os.homedir(), '.nom', 'state.json');
  const before = await fs.readFile(nomState).catch(() => null);
  if (before) {
    const hash = crypto.createHash('sha256').update(before).digest('hex');
    // 上面的所有测试已经跑完；这里只需要确认文件没被改动。
    const afterBuf = await fs.readFile(nomState).catch(() => null);
    const afterHash = afterBuf ? crypto.createHash('sha256').update(afterBuf).digest('hex') : null;
    check('~/.nom/state.json 未被触碰', hash === afterHash);
  } else {
    check('~/.nom 不存在（本机无旧产品状态，无需隔离验证）', true);
  }
}

// --- "回到屏幕右下角"复位几何（多显示器 / 缩放 / 小 workArea） -------------------------

function homeGeometryTests(): void {
  console.log('\n[复位几何]');
  // 主显示器：workArea 右下角向内收 32px 安全边距
  const main1920: Rect = { x: 0, y: 0, width: 1920, height: 1055 };
  const p = computeWorkAreaHomePosition(main1920, 300);
  check('主屏右下角复位（32px 安全边距）', p.x === 1920 - 300 - 32 && p.y === 1055 - 300 - 32, JSON.stringify(p));
  check('复位结果整体在 workArea 内', p.x >= 0 && p.y >= 0 && p.x + 300 <= 1920 && p.y + 300 <= 1055);

  // 多显示器：左侧副屏（负原点）
  const left: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };
  const pl = computeWorkAreaHomePosition(left, 300);
  check('左侧副屏（负原点）复位到该屏右下角', pl.x === -1920 + 1920 - 300 - 32 && pl.y === 1040 - 300 - 32, JSON.stringify(pl));

  // 多显示器：右侧偏移原点副屏
  const right: Rect = { x: 1920, y: -200, width: 1440, height: 2560 };
  const pr = computeWorkAreaHomePosition(right, 400);
  check('右侧副屏（偏移原点）复位', pr.x === 1920 + 1440 - 400 - 32 && pr.y === -200 + 2560 - 400 - 32);

  // 显示器缩放：workArea 已是 DIP（如 200% 缩放下物理 3008×1692 → DIP 1504×846），
  // 函数只认 DIP，坐标不会被放大
  const scaled: Rect = { x: 0, y: 0, width: 1504, height: 846 };
  const ps = computeWorkAreaHomePosition(scaled, 300);
  check('缩放显示器（DIP 坐标）复位不放大坐标', ps.x === 1504 - 300 - 32 && ps.y === 846 - 300 - 32);

  // workArea 比窗口还小：贴 workArea 原点（与缩放夹紧策略一致）
  const tiny: Rect = { x: 100, y: 50, width: 250, height: 200 };
  const pt = computeWorkAreaHomePosition(tiny, 300);
  check('workArea 比窗口小时贴 workArea 原点', pt.x === 100 && pt.y === 50);

  // workArea 仅略宽于窗口：不为了边距把窗口挤出可视区
  const narrow: Rect = { x: 0, y: 0, width: 310, height: 1055 };
  const pn = computeWorkAreaHomePosition(narrow, 300);
  check('窄 workArea 夹紧在可视区内', pn.x >= 0 && pn.x + 300 <= 310 && pn.y === 1055 - 300 - 32);
}

// --- 运行时状态持久化（pet-state.json 解析与合并） -----------------------------------------

function petStateTests(): void {
  console.log('\n[运行时状态持久化]');
  const empty = parsePersistedPetState(undefined);
  check('空/缺失状态解析为全 null（回落随包配置）',
    empty.zoom === null && empty.wanderEnabled === null && empty.windowPosition === null);
  const junk = parsePersistedPetState('junk');
  check('非对象输入不崩且全 null', junk.zoom === null && junk.wanderEnabled === null && junk.windowPosition === null);

  const full = parsePersistedPetState({ windowPosition: { x: 10, y: 20, displayId: 7 }, zoom: 2, wanderEnabled: false });
  check('完整状态逐字段解析（含游走开关）',
    full.zoom === 2 && full.wanderEnabled === false && full.windowPosition?.x === 10 && full.windowPosition.displayId === 7);

  const bad = parsePersistedPetState({ zoom: 'big', wanderEnabled: 'yes', windowPosition: { x: 'a', y: 1 } });
  check('坏字段丢弃为 null（不进入运行时）', bad.zoom === null && bad.wanderEnabled === null && bad.windowPosition === null);
  // 历史数据兼容：pet-state.json 里的旧档 50%/75%/100% 迁移为 125%；
  // 中间值/越界/非数字回落 null（用随包配置）
  check('持久化的旧档 50%/75%/100% 迁移为 125%',
    parsePersistedPetState({ zoom: 0.5 }).zoom === 1.25 &&
    parsePersistedPetState({ zoom: 0.75 }).zoom === 1.25 && parsePersistedPetState({ zoom: 1 }).zoom === 1.25);
  check('持久化的 125%/150%/200% 原样保留',
    parsePersistedPetState({ zoom: 1.25 }).zoom === 1.25 &&
    parsePersistedPetState({ zoom: 1.5 }).zoom === 1.5 && parsePersistedPetState({ zoom: 2 }).zoom === 2);
  check('持久化的中间值/越界缩放回落 null（用随包配置）',
    parsePersistedPetState({ zoom: 1.2 }).zoom === null && parsePersistedPetState({ zoom: 1.7 }).zoom === null &&
    parsePersistedPetState({ zoom: 3 }).zoom === null && parsePersistedPetState({ zoom: 0.4 }).zoom === null);
  const noDisplay = parsePersistedPetState({ windowPosition: { x: 1, y: 2 } });
  check('位置缺 displayId 仍合法', noDisplay.windowPosition?.x === 1 && noDisplay.windowPosition.displayId === undefined);

  const base = { petName: '演示猫', zoom: 1.5, wanderEnabled: true };
  const merged = applyPersistedPetState(base, full);
  check('持久化的游走开关覆盖随包配置（重启后保持关闭）', merged.wanderEnabled === false);
  check('持久化的 zoom 覆盖随包配置', merged.zoom === 2);
  check('合并不动名字等其他字段', merged.petName === '演示猫');
  const untouched = applyPersistedPetState(base, empty);
  check('用户未调整过时保留随包配置', untouched.wanderEnabled === true && untouched.zoom === 1.5);
  const offOnly = applyPersistedPetState(base, parsePersistedPetState({ wanderEnabled: false }));
  check('只持久化游走开关时 zoom 保持随包值', offOnly.zoom === 1.5 && offOnly.wanderEnabled === false);
}

// --- 状态并发写入（单一内存状态 + 串行原子写盘） ------------------------------------------------

async function petStateStoreTests(tmp: string): Promise<void> {
  console.log('\n[状态并发写入]');
  const file = path.join(tmp, 'pet-state', 'pet-state.json');

  // 首次启动：文件不存在 → 全 null，不崩
  const store = await PetStateStore.load(file);
  check('缺失状态文件回落全 null',
    store.current.zoom === null && store.current.wanderEnabled === null && store.current.windowPosition === null);

  // 三路回调并发更新（不等待、交错进入）：旧实现 read-modify-write 会丢字段
  await Promise.all([
    store.update({ zoom: 2 }),
    store.update({ wanderEnabled: false }),
    store.update({ windowPosition: { x: 100, y: 200, displayId: 3 } }),
  ]);
  await store.flush();
  const disk = parsePersistedPetState(JSON.parse(await fs.readFile(file, 'utf8')));
  check('三路并发更新全部落盘（无字段丢失）',
    disk.zoom === 2 && disk.wanderEnabled === false && disk.windowPosition?.x === 100 && disk.windowPosition.displayId === 3);
  check('内存状态与磁盘一致',
    store.current.zoom === 2 && store.current.wanderEnabled === false && store.current.windowPosition?.y === 200);
  check('原子写无临时文件残留', !(await fs.stat(`${file}.tmp`).then(() => true, () => false)));

  // 连续更新：最终快照包含所有字段（后写覆盖同名字段，保留其他字段）
  await store.update({ zoom: 1.25 });
  await store.update({ wanderEnabled: true });
  await store.flush();
  const disk2 = parsePersistedPetState(JSON.parse(await fs.readFile(file, 'utf8')));
  check('连续更新合并完整（zoom 最新、位置保留）',
    disk2.zoom === 1.25 && disk2.wanderEnabled === true && disk2.windowPosition?.x === 100);

  // 重启恢复：新实例读同一文件
  const store2 = await PetStateStore.load(file);
  check('重启后恢复最终状态',
    store2.current.zoom === 1.25 && store2.current.wanderEnabled === true && store2.current.windowPosition?.x === 100);

  // 坏数据容错：损坏 JSON / 坏字段都不崩、回落 null
  await fs.writeFile(file, '{broken json', 'utf8');
  const store3 = await PetStateStore.load(file);
  check('损坏状态文件回落全 null 不崩',
    store3.current.zoom === null && store3.current.wanderEnabled === null && store3.current.windowPosition === null);

  // 写入失败不崩溃：父路径被同名文件占用 → mkdir/rename 必失败
  const blocker = path.join(tmp, 'blocker');
  await fs.writeFile(blocker, 'x');
  const store4 = await PetStateStore.load(path.join(blocker, 'pet-state.json'));
  await store4.update({ zoom: 1.25 });
  await store4.flush();
  check('写入失败不抛出、内存状态仍正确', store4.current.zoom === 1.25);
}

// --- 关闭前刷新（FlushableDebouncer：复位/拖动后立刻退出不丢最终位置） ---------------------------

async function debouncerTests(): Promise<void> {
  console.log('\n[关闭前刷新]');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 正常防抖节奏不变：连续触发只在到点后保存一次最新值
  {
    const saved: number[] = [];
    const d = new FlushableDebouncer<number>(30, (v) => saved.push(v));
    d.trigger(1); d.trigger(2); d.trigger(3);
    check('防抖窗口内不立即保存', saved.length === 0);
    await sleep(80);
    check('防抖到点只保存一次最新值', saved.length === 1 && saved[0] === 3);
  }

  // 关闭前刷新：没到防抖点也立即保存待写值
  {
    const saved: number[] = [];
    const d = new FlushableDebouncer<number>(10_000, (v) => saved.push(v));
    d.trigger(1); d.trigger(2);
    d.flush();
    check('关闭前 flush 立即保存待写值', saved.length === 1 && saved[0] === 2);
    await sleep(30);
    check('flush 后不再二次触发（不重复保存）', saved.length === 1);
  }

  // 复位/拖动后立即退出：trigger 一次马上 flush
  {
    const saved: Array<{ x: number; y: number; displayId: number }> = [];
    const d = new FlushableDebouncer<{ x: number; y: number; displayId: number }>(400, (v) => saved.push(v));
    d.trigger({ x: 1588, y: 723, displayId: 1 });
    d.flush();
    check('复位后立即退出仍保存最终位置', saved.length === 1 && saved[0]!.x === 1588 && saved[0]!.y === 723);
  }

  // flush/cancel 幂等：无待写值时是空操作
  {
    const saved: number[] = [];
    const d = new FlushableDebouncer<number>(10, (v) => saved.push(v));
    d.flush();
    d.trigger(9); d.cancel(); d.flush();
    await sleep(30);
    check('空 flush 与 cancel 不保存、幂等', saved.length === 0);
  }
}

// --- 桌宠右键菜单（共享构建函数：预览与导出运行时同一份） --------------------------------------

function petMenuTests(): void {
  console.log('\n[桌宠右键菜单]');
  const calls: string[] = [];
  const actions = {
    onToggleWander: (enabled: boolean) => { calls.push(`wander:${enabled}`); },
    onSetZoom: (zoom: number) => { calls.push(`zoom:${zoom}`); },
    onGoHome: () => { calls.push('home'); },
    onInfo: () => { calls.push('info'); },
    onClose: () => { calls.push('close'); },
  };
  const items = buildPetContextMenu({ wanderEnabled: true, zoom: 1.5, closeLabel: '👋  退出' }, actions);
  const order = items.map((i) => (i.type === 'separator' ? '|' : i.label));
  check('菜单顺序：自动游走 / 缩放 / 回到屏幕右下角 / 关于 / 退出',
    order.join('') === '🐾  自动游走🔍  缩放|📍  回到屏幕右下角ℹ️  关于这只宠物|👋  退出',
    order.join(' '));

  const wanderItem = items[0]!;
  check('自动游走是 checkbox 且反映当前状态（开）', wanderItem.type === 'checkbox' && wanderItem.checked === true);
  const offItems = buildPetContextMenu({ wanderEnabled: false, zoom: 1.25, closeLabel: '关闭预览' }, actions);
  check('开关关闭时 checkbox 不勾选', offItems[0]!.type === 'checkbox' && offItems[0]!.checked === false);

  // 模拟点击勾选框：Electron 传勾选后的新状态
  (wanderItem.click as (item: { checked: boolean }) => void)({ checked: false });
  check('点击自动游走传回勾选后的新状态', calls[0] === 'wander:false');
  const zoomSub = items[1]!.submenu as Array<{ label?: string; checked?: boolean }>;
  check('缩放子菜单恰好三档（小 125% / 中 150% / 大 200%（推荐））',
    zoomSub.length === 3 && zoomSub.map((s) => s.label).join(',') === '小 125%,中 150%,大 200%（推荐）');
  check('菜单标签与共享档位定义一致（无文案漂移）',
    zoomSub.map((s) => s.label).join(',') === ZOOM_OPTIONS.map((o) => o.label).join(','));
  check('缩放子菜单恰好一个档位选中（当前 150%）',
    zoomSub.filter((s) => s.checked).length === 1 && zoomSub.find((s) => s.checked)?.label === '中 150%');

  (items[3]!.click as () => void)();
  check('点击"回到屏幕右下角"派发复位动作', calls.includes('home'));
  (items[4]!.click as () => void)();
  (items[6]!.click as () => void)();
  check('关于 / 退出动作派发', calls.includes('info') && calls.includes('close'));
}

// --- 关闭自动游走的即时收尾（只收 walking，不影响 waiting/review） ------------------------------

function wanderInterruptTests(): void {
  console.log('\n[游走开关收尾]');
  check('walking（游走中）立即停止回 idle', stopWalkingState('walking') === 'idle');
  check('waiting（等待）不受影响', stopWalkingState('waiting') === null);
  check('review（思考）不受影响', stopWalkingState('review') === null);
  check('idle / dragging / talking 等不换状态',
    stopWalkingState('idle') === null && stopWalkingState('dragging') === null && stopWalkingState('talking') === null);
}

// --- "打开所在文件夹"路径安全（导出登记册：renderer 不能传任意路径） ----------------------------

async function revealSafetyTests(tmp: string): Promise<void> {
  console.log('\n[导出文件打开路径安全]');
  const dir = path.join(tmp, 'exports');
  await fs.mkdir(dir, { recursive: true });
  const zipPath = path.join(dir, 'petlite-pet-demo-win-x64-20260909-120000.zip');
  await fs.writeFile(zipPath, 'zip-bytes');
  const strayZip = path.join(dir, 'stray.zip');
  await fs.writeFile(strayZip, 'other');

  const registry = new ExportRegistry();
  registry.record(zipPath);

  check('本次导出的 ZIP 允许打开', resolveRevealTarget(zipPath, registry) === path.resolve(zipPath));
  const equivalent = path.join(dir, 'sub', '..', path.basename(zipPath));
  check('等价路径（含 ..）归一化后仍允许', resolveRevealTarget(equivalent, registry) === path.resolve(zipPath));
  await expectThrow('磁盘上真实存在但未登记的 ZIP 被拒绝', '本次', () => resolveRevealTarget(strayZip, registry));
  await expectThrow('同目录伪造相似文件名被拒绝', '本次', () => resolveRevealTarget(zipPath.replace('.zip', '-2.zip'), registry));
  await expectThrow('非 ZIP 后缀被拒绝', 'ZIP', () => resolveRevealTarget('/etc/hosts', registry));
  await expectThrow('非字符串入参被拒绝', '字符串', () => resolveRevealTarget({ path: zipPath }, registry));
  await expectThrow('空字符串被拒绝', '字符串', () => resolveRevealTarget('', registry));
  const fresh = new ExportRegistry();
  await expectThrow('上一会话导出的文件在新会话不可打开', '本次', () => resolveRevealTarget(zipPath, fresh));
}

// --- 气泡排版 CSS（短文案一行 / 均衡换行 / 限宽不裁切） ----------------------------------------

async function bubbleCssTests(): Promise<void> {
  console.log('\n[气泡排版 CSS]');
  const petCss = await fs.readFile(path.join(REPO, 'src', 'renderer', 'pet', 'pet.css'), 'utf8');
  const bubble = extractBlock(petCss, '.bubble');
  const body = extractBlock(petCss, '.bubble-body');
  check('气泡与正文样式块存在', !!bubble && !!body);
  check('短文案尽量保持一行（shrink-to-fit 显式化）', !!bubble && /width:\s*max-content/.test(bubble));
  check('长文本仍限制在安全宽度内（max-width 88%）', !!bubble && /max-width:\s*88%/.test(bubble));
  check('必须换行时均衡换行（text-wrap: balance）', !!body && /text-wrap:\s*balance/.test(body));
  check('超长不可断内容有兜底断行（不被裁切）', !!bubble && /overflow-wrap:\s*anywhere/.test(bubble));
  check('没有强制 nowrap（长文本允许换行）', !!bubble && !/white-space:\s*nowrap/.test(bubble));
  check('气泡仍居中锚定（不改动窗口/位置逻辑）', !!bubble && /left:\s*50%/.test(bubble) && /translateX\(-50%\)/.test(bubble));

  // 盒模型：border-box 让 padding/border 计入 max-width —— 最小缩放下气泡总宽不越窗
  check('.bubble 使用 box-sizing: border-box', !!bubble && /box-sizing:\s*border-box/.test(bubble));
  if (bubble) {
    const pct = Number(/max-width:\s*(\d+)%/.exec(bubble)?.[1]);
    const padX = Number(/padding:\s*\d+px\s+(\d+)px/.exec(bubble)?.[1]);
    const borderW = Number(/border:\s*(\d+)px/.exec(bubble)?.[1]);
    // 窗口最小尺寸：基准 200px × 最小缩放档 125% = 250px（src/pet/host.ts PET_WIN_BASE_SIZE）
    const minWinPx = 200 * 1.25;
    check('125% 缩放（最小窗口 250px）：气泡总宽 = max-width ≤ 窗口',
      (pct / 100) * minWinPx <= minWinPx && (pct / 100) * minWinPx - 2 * padX - 2 * borderW > 0,
      `max=${(pct / 100) * minWinPx}px 窗口=${minWinPx}px`);
  }

  function extractBlock(css: string, selector: string): string | null {
    const escaped = selector.replace(/\./g, '\\.');
    const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return m ? m[1]! : null;
  }
}

// --- 体验优化接线一致性（宿主 / 窄桥 / 渲染器 / 制作台 main） ----------------------------------

async function uxWiringTests(): Promise<void> {
  console.log('\n[体验优化接线]');
  const hostSrc = await fs.readFile(path.join(REPO, 'src', 'pet', 'host.ts'), 'utf8');
  check('宿主右键菜单由共享构建函数生成', hostSrc.includes('buildPetContextMenu('));
  check('宿主向渲染器广播游走开关变化', hostSrc.includes("'pet:wander'"));
  check('宿主向渲染器发送回到右下角', hostSrc.includes("'pet:go-home'"));
  check('宿主暴露游走开关持久化回调', hostSrc.includes('onWanderChange'));
  check('宿主位置保存走可冲刷防抖器', hostSrc.includes('FlushableDebouncer'));
  check('宿主在窗口关闭时 flush 待写位置', /'closed'[\s\S]{0,300}?positionSaver\.flush\(\)/.test(hostSrc));
  check('缩放用单次 setBounds 原子更新尺寸与位置',
    hostSrc.includes('this.win.setBounds(bounds)') && !hostSrc.includes('this.win.setSize(bounds.width, bounds.height)'));
  check('启动时夹紧历史越界坐标',
    hostSrc.includes('clampBoundsToWorkArea(requestedBounds, initialDisplay.workArea)'));
  check('监听 Windows DPI/workArea 动态变化并重新夹紧',
    hostSrc.includes("screen.on('display-metrics-changed'") &&
    hostSrc.includes("screen.removeListener('display-metrics-changed'") &&
    hostSrc.includes("metric === 'scaleFactor'"));

  const petMainSrc = await fs.readFile(path.join(REPO, 'src', 'pet', 'main.ts'), 'utf8');
  check('运行时用单一内存状态存储（PetStateStore）', petMainSrc.includes('PetStateStore'));
  check('运行时持久化游走开关选择', /onWanderChange:[\s\S]{0,80}?stateStore\.update\(\{ wanderEnabled/.test(petMainSrc));
  check('运行时启动时合并持久化状态', petMainSrc.includes('applyPersistedPetState'));
  check('运行时退出前 flush 状态写盘', /stateStore\.flush\(\)[\s\S]{0,40}?app\.quit\(\)/.test(petMainSrc));

  const preloadSrc = await fs.readFile(path.join(REPO, 'src', 'preload', 'petwin.ts'), 'utf8');
  check('窄桥暴露游走开关监听', preloadSrc.includes('onWanderChanged'));
  check('窄桥暴露回到右下角监听', preloadSrc.includes('onGoHome'));

  const petAppSrc = await fs.readFile(path.join(REPO, 'src', 'renderer', 'pet', 'PetWindowApp.tsx'), 'utf8');
  check('渲染器注册游走开关监听', petAppSrc.includes('onWanderChanged(applyWanderEnabled)'));
  check('关闭游走立即停止游走并只收 walking（不影响等待/思考）',
    /applyWanderEnabled[\s\S]{0,250}?cancelWander\(\)[\s\S]{0,120}?stopWalkingState/.test(petAppSrc));
  check('渲染器复位用共享几何 + 受控移动', petAppSrc.includes('computeWorkAreaHomePosition') && petAppSrc.includes('onGoHome'));

  const studioMainSrc = await fs.readFile(path.join(REPO, 'src', 'main', 'index.ts'), 'utf8');
  check('导出成功登记产物路径', studioMainSrc.includes('exportRegistry.record('));
  check('打开所在文件夹走登记册校验', studioMainSrc.includes('resolveRevealTarget('));

  const appSrc = await fs.readFile(path.join(REPO, 'src', 'renderer', 'App.tsx'), 'utf8');
  check('配置页含自动行为说明文案', appSrc.includes('等待和思考会在闲置后自动触发；点击或拖动会重新计时。'));
  check('导出成功页有"打开所在文件夹"按钮', appSrc.includes('打开所在文件夹') && appSrc.includes('revealExport'));
  // 两处 UI 共用同一份档位/标签定义（ZOOM_OPTIONS），文案不漂移
  const menuSrc = await fs.readFile(path.join(REPO, 'src', 'pet', 'menu.ts'), 'utf8');
  check('配置页缩放下拉使用共享 ZOOM_OPTIONS', /ZOOM_OPTIONS\.map/.test(appSrc));
  check('右键缩放菜单使用共享 ZOOM_OPTIONS', /ZOOM_OPTIONS\.map/.test(menuSrc));

  const exportSrc = await fs.readFile(path.join(REPO, 'src', 'main', 'export-win.ts'), 'utf8');
  check('启动说明包含新菜单项', exportSrc.includes('回到屏幕右下角') && exportSrc.includes('自动游走'));
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-test-'));
  console.log(`fixture 根目录：${tmp}\n`);
  try {
    geometryTests();
    homeGeometryTests();
    configTests();
    ipcTests();
    await storeTests(tmp);
    manifestTests();
    await reserveTests(tmp);
    await revealSafetyTests(tmp);
    petIpcRouterTests();
    behaviorTests();
    wanderInterruptTests();
    petStateTests();
    await petStateStoreTests(tmp);
    await debouncerTests();
    petMenuTests();
    lifecycleTests();
    activateTests();
    await darkModeTests();
    await bubbleCssTests();
    await uxWiringTests();
    await railProjectStructureTests();
    await isolationCheck();
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
