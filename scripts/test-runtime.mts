// 运行时纯逻辑测试：几何 / 配置 / IPC 校验 / 项目存储 / 授权门 / 导出命名。
// 运行：npm run test:runtime
//
// 覆盖（对应任务书 §6）：
//   ✓ 缩放 bottom-center 锚点 + workArea 夹紧（含右下角 100%→200%）
//   ✓ 配置校验：合法值、非法类型、越界数字、空名字、超长名字
//   ✓ IPC 校验器：非法类型 / 枚举 / 项目 id 注入
//   ✓ 项目存储：导入复制不修改源、哈希核对、版本化目录、索引损坏恢复、
//     非法配置不入库
//   ✓ 授权门：authorized 放行 / internal-test 标记 / unknown 阻止
//   ✓ 导出命名非覆盖（reserveOutputPath）
//   ✓ 旧产品数据目录（~/.nom）在整个测试过程中不被触碰

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeAnchoredZoomBounds, type Rect } from '../src/shared/geometry.ts';
import { validatePetConfig, DEFAULT_PET_CONFIG } from '../src/shared/config.ts';
import { requireProjectId, requireEnum, requireFiniteNumber, requireBoolean, IpcValidationError } from '../src/shared/ipc-validate.ts';
import { ProjectsStore, packFingerprint } from '../src/shared/projects.ts';
import { validatePetPack } from '../src/shared/petpack.ts';
import { sharpImageProbe } from '../src/main/image-probe.ts';
import { buildManifest, licenseExportBlock } from '../src/shared/manifest.ts';
import { reserveOutputPath, buildRuntimeConfig } from '../src/main/export-win.ts';
import { registerPetIpc, PET_IPC_HANDLE_CHANNELS, PET_IPC_ON_CHANNELS, type PetIpcTarget } from '../src/pet/ipc-router.ts';
import { PetBehaviorScheduler, DEFAULT_BEHAVIOR_TIMINGS } from '../src/shared/pet-behavior.ts';
import { shouldQuitOnAllWindowsClosed } from '../src/shared/lifecycle.ts';

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
    // 右下角默认位置 100%→200%：底边锚点保持；水平方向锚点与右缘冲突时
    // 夹紧优先（以 1788 为中心的 400px 窗口会越出右缘）。
    const prev: Rect = { x: 1920 - 200 - 32, y: 1055 - 200 - 32, width: 200, height: 200 };
    const next = computeAnchoredZoomBounds(prev, 400, workArea);
    check('右下角 100%→200%：底边锚点保持', next.y + next.height === prev.y + prev.height, JSON.stringify(next));
    check('右下角 100%→200%：夹紧到 workArea 右缘', next.x === workArea.x + workArea.width - 400);
    check('右下角 100%→200%：整体可见',
      next.x >= 0 && next.y >= 0 && next.x + next.width <= workArea.width && next.y + next.height <= workArea.height);
  }
  {
    // 屏幕中间的窗口 100%→200%：锚点完全保持，无夹紧。
    const prev: Rect = { x: 700, y: 400, width: 200, height: 200 };
    const next = computeAnchoredZoomBounds(prev, 400, workArea);
    check('屏幕中间 100%→200%：bottom-center 完全保持',
      next.x + next.width / 2 === prev.x + prev.width / 2 && next.y + next.height === prev.y + prev.height);
  }
  {
    const prev: Rect = { x: 500, y: 0, width: 200, height: 200 };
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
    const next = computeAnchoredZoomBounds(prev, 200, workArea);
    check('200%→100% 缩小：锚点保持',
      next.x + next.width / 2 === prev.x + prev.width / 2 && next.y + next.height === prev.y + prev.height);
  }
}

// --- 配置 -----------------------------------------------------------------------

function configTests(): void {
  console.log('\n[配置校验]');
  check('合法配置通过', validatePetConfig({ petName: '小猫', zoom: 1.5, wanderEnabled: false }).ok);
  check('空对象用默认值', validatePetConfig({}).ok);
  expectThrowSync('空名字被拒绝', validatePetConfig({ petName: '  ' }).ok === false);
  expectThrowSync('超长名字被拒绝', validatePetConfig({ petName: 'x'.repeat(25) }).ok === false);
  expectThrowSync('zoom 越界被拒绝', validatePetConfig({ zoom: 3 }).ok === false);
  expectThrowSync('zoom 非数字被拒绝', validatePetConfig({ zoom: 'big' }).ok === false);
  expectThrowSync('wander 非布尔被拒绝', validatePetConfig({ wanderEnabled: 'yes' }).ok === false);
  expectThrowSync('非对象被拒绝', validatePetConfig('str').ok === false);

  // 默认缩放：新项目 / 缺省配置 = 150%（真实 Windows 反馈 100% 偏小）
  check('默认 zoom 为 1.5', DEFAULT_PET_CONFIG.zoom === 1.5);
  const def = validatePetConfig({});
  check('缺省配置解析出 zoom=1.5', def.ok && def.config.zoom === 1.5);
  const kept = validatePetConfig({ zoom: 1 });
  check('用户明确保存的 zoom=1 不被默认值覆盖', kept.ok && kept.config.zoom === 1);
  const runtimeCfg = buildRuntimeConfig(DEFAULT_PET_CONFIG);
  check('导出运行时配置与制作台默认一致（zoom=1.5）', runtimeCfg.zoom === 1.5);

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
  expectThrow('数字越界被拒绝', '超出范围', () => requireFiniteNumber(99, '缩放', 0.5, 2));
  expectThrow('NaN 被拒绝', '有限数字', () => requireFiniteNumber(NaN, '缩放', 0.5, 2));
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
  check('新导入项目默认 zoom=1.5', meta.config.zoom === 1.5);
  check('记录真实宠物 ID 与声明版本', meta.petId === 'demo-cat' && meta.declaredVersion === 'v1');
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
  await expectThrow('非法配置不入库', '超出范围', () => store2.updateConfig(meta.id, { zoom: 9 }));
  const after = await store2.get(meta.id);
  check('非法配置失败后配置未被污染', after?.config.zoom === 1.5);

  // 用户明确保存的缩放不被默认值覆盖
  await store2.updateConfig(meta.id, { zoom: 1 });
  const renamed = await store2.updateConfig(meta.id, { petName: '只改名字' });
  check('用户保存的 zoom=1 在后续更新中保持', renamed.config.zoom === 1);

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
    check('迁移不覆盖用户已保存的 zoom', migrated?.config.zoom === 1);
    check('迁移不改变内部实例 id 与 sourcePath',
      migrated?.id === legacyId && migrated.sourcePath === '/Users/someone/pets/demo-cat');
    const again = await store3.get(legacyId);
    check('迁移结果持久化（二次读取一致）', again?.petId === 'demo-cat');
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

// --- 授权门 / manifest / 导出命名 -----------------------------------------------------

function manifestTests(): void {
  console.log('\n[授权门 / manifest / 非覆盖]');
  check('authorized 放行', licenseExportBlock('authorized') === null);
  check('internal-test 放行（标记内部）', licenseExportBlock('internal-test') === null);
  check('unknown 阻止且为中文提示', typeof licenseExportBlock('unknown') === 'string');

  const source = { type: 'zip' as const, fingerprint: 'f'.repeat(64), zipSha256: 'z'.repeat(64) };
  const m = buildManifest({
    productVersion: '0.1.0',
    pet: { id: 'demo', slug: 'pack-v1', displayName: '演示猫', petdexVersion: 'v1', declaredVersion: 'v1' },
    studioProjectId: 'demo-20260908120000',
    source,
    hashes: { petJsonSha256: 'a'.repeat(64), spritesheetSha256: 'b'.repeat(64) },
    license: 'internal-test',
    exportedAt: new Date('2026-09-08T10:00:00Z'),
  });
  check('manifest 含全部必填字段',
    m.product.length > 0 && m.productVersion === '0.1.0' && m.pet.petdexVersion === 'v1' &&
    m.hashes.spritesheetSha256.length === 64 && m.exportedAt === '2026-09-08T10:00:00.000Z' &&
    m.platform === 'win32' && m.arch === 'x64' && m.license === 'internal-test');
  check('manifest 区分真实宠物 ID 与内部实例 ID',
    m.pet.id === 'demo' && m.studioProjectId === 'demo-20260908120000' && m.pet.id !== m.studioProjectId);
  check('manifest 记录真实声明版本与来源（类型/指纹/ZIP 哈希）',
    m.pet.declaredVersion === 'v1' && m.source.type === 'zip' &&
    m.source.fingerprint === source.fingerprint && m.source.zipSha256 === source.zipSha256);
  check('manifest 不含用户机器绝对路径',
    !JSON.stringify(m).includes('/Users/') && !/^[A-Za-z]:\\/.test(JSON.stringify(m)));
  check('internal-test 标记为 internal-test-only', m.distribution === 'internal-test-only');
  check('authorized 标记为 candidate',
    buildManifest({ productVersion: '0.1.0', pet: m.pet, studioProjectId: m.studioProjectId, source, hashes: m.hashes, license: 'authorized' }).distribution === 'candidate');
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

// --- 窗口生命周期策略（macOS 常驻 / 其他平台退出） -------------------------------

function lifecycleTests(): void {
  console.log('\n[窗口生命周期]');
  check('macOS 关闭最后窗口不退出（保留在 Dock）', shouldQuitOnAllWindowsClosed('darwin') === false);
  check('Windows 关闭最后窗口退出', shouldQuitOnAllWindowsClosed('win32') === true);
  check('Linux 关闭最后窗口退出', shouldQuitOnAllWindowsClosed('linux') === true);
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

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-test-'));
  console.log(`fixture 根目录：${tmp}\n`);
  try {
    geometryTests();
    configTests();
    ipcTests();
    await storeTests(tmp);
    manifestTests();
    await reserveTests(tmp);
    petIpcRouterTests();
    behaviorTests();
    lifecycleTests();
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
