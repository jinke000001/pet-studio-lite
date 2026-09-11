import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDesktopTerrain,
  findLandingSurface,
  findWallContact,
  reconcileSupport,
  type DesktopActorBounds,
  type DesktopWindowSnapshot,
} from '../src/shared/shimeji/desktop-terrain';
import { advanceDesktopActor, type DesktopActor } from '../src/shared/shimeji/desktop-motion';
import {
  normalizeWindowSnapshots,
  parseWindowProbePayload,
  WINDOW_PROBE_PROTOCOL_VERSION,
} from '../src/shared/shimeji/window-snapshot';
import { SharedWindowSnapshotSource, WindowSnapshotMonitor } from '../src/pet/window-snapshot-monitor';
import { DesktopRuntimeSession } from '../src/shared/shimeji/desktop-runtime-session';
import {
  approachWindowPosition,
  clampWindowPositionByActor,
  deriveBottomCenteredActorLayout,
  windowPositionForActor,
} from '../src/shared/shimeji/desktop-actor-layout';
import {
  compileClassicShimeji,
  compileClassicRuntimePlan,
  selectClassicBehavior,
} from '../src/shared/shimeji/classic-config';
import { PointerVelocityTracker } from '../src/shared/shimeji/pointer-velocity';
import { ensureUtf8Bom } from '../src/shared/text-encoding';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log('[Shimeji 桌面地形]');

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const terrain = buildDesktopTerrain(workArea, [
  { id: 'notepad', x: 200, y: 400, width: 700, height: 500, visible: true },
  { id: 'browser', x: 1000, y: 180, width: 800, height: 760, visible: true },
  { id: 'minimized', x: 50, y: 50, width: 500, height: 300, visible: true, minimized: true },
  { id: 'cloaked', x: 60, y: 60, width: 500, height: 300, visible: true, cloaked: true },
  { id: 'pet-window', x: 10, y: 10, width: 200, height: 200, visible: true, own: true },
  { id: 'broken', x: Number.NaN, y: 0, width: 100, height: 100, visible: true },
]);

check('保留工作区底边作为最终地面', terrain.floorY === 1040);
check('只把合法、可见、非自身窗口变成平台', terrain.platforms.length === 2);
check('窗口平台按屏幕高度从上到下排序', terrain.platforms[0]?.id === 'browser');
check('每个窗口同时提供左右攀爬边缘', terrain.walls.length === 4);

const landing = findLandingSurface(
  { previousFootY: 360, nextFootY: 720, footX: 500 },
  terrain,
);
check('快速下落也会落到穿越的窗口顶边', landing?.id === 'notepad');
check('落地高度使用窗口真实顶边', landing?.y === 400);

const floorLanding = findLandingSurface(
  { previousFootY: 900, nextFootY: 1200, footX: 950 },
  terrain,
);
check('没有窗口承接时落到工作区底边', floorLanding?.id === 'work-area-floor');

const actor: DesktopActorBounds = { x: 120, y: 650, width: 80, height: 120 };
const wall = findWallContact(actor, 260, terrain);
check('向右行走穿过窗口左边缘时识别攀爬目标', wall?.windowId === 'notepad' && wall.edge === 'left');

const noWall = findWallContact({ ...actor, y: 930 }, 260, terrain);
check('宠物与窗口垂直方向不重叠时不误判碰墙', noWall === null);

const onNotepad: DesktopActorBounds = { x: 360, y: 280, width: 80, height: 120 };
const supported = reconcileSupport(onNotepad, 'notepad', terrain);
check('仍存在的平台继续支撑宠物', supported.kind === 'supported' && supported.y === 400);

const withoutNotepad = buildDesktopTerrain(workArea, [
  { id: 'browser', x: 1000, y: 180, width: 800, height: 760, visible: true },
]);
const lost = reconcileSupport(onNotepad, 'notepad', withoutNotepad);
check('目标窗口消失后明确进入失去支撑状态', lost.kind === 'lost');

const movedNotepad = buildDesktopTerrain(workArea, [
  { id: 'notepad', x: 300, y: 460, width: 700, height: 500, visible: true },
]);
const moved = reconcileSupport(onNotepad, 'notepad', movedNotepad);
check('目标窗口移动后返回新的平台高度', moved.kind === 'supported' && moved.y === 460);

console.log('\n[Shimeji 基础运动]');

const climbingTerrain = buildDesktopTerrain(workArea, [
  { id: 'editor', x: 200, y: 400, width: 700, height: 640, visible: true },
]);
const groundWalker: DesktopActor = {
  x: 110,
  y: 920,
  width: 80,
  height: 120,
  state: 'walking',
  facing: 'right',
  vx: 100,
  vy: 0,
  supportId: 'work-area-floor',
  supportOffsetX: 150,
  climb: null,
};

const startedClimbing = advanceDesktopActor(groundWalker, climbingTerrain, 200);
check('地面行走碰到窗口侧边后进入攀爬', startedClimbing.state === 'climbing');
check('攀爬时记录目标窗口和边缘', startedClimbing.climb?.windowId === 'editor' && startedClimbing.climb.edge === 'left');
check('攀爬时吸附到窗口左边缘', startedClimbing.x === 120);

const reachedTop = advanceDesktopActor(startedClimbing, climbingTerrain, 8_000);
check('爬到窗口顶边后重新进入行走', reachedTop.state === 'walking');
check('爬到顶部后由目标窗口平台支撑', reachedTop.supportId === 'editor');
check('爬到顶部后脚底与窗口顶边对齐', reachedTop.y + reachedTop.height === 400);

const fallingAfterClose = advanceDesktopActor(reachedTop, buildDesktopTerrain(workArea, []), 16);
check('支撑窗口关闭后立即切换为坠落', fallingAfterClose.state === 'falling');
check('窗口关闭后不再保留旧支撑引用', fallingAfterClose.supportId === null);

const landedOnFloor = advanceDesktopActor(fallingAfterClose, buildDesktopTerrain(workArea, []), 2_000);
check('坠落跨过工作区底边时不会穿透', landedOnFloor.state === 'walking');
check('坠落结束后落在工作区底边', landedOnFloor.y + landedOnFloor.height === 1040);
check('落地后记录工作区底边支撑', landedOnFloor.supportId === 'work-area-floor');

const recoveredBelowFloor = advanceDesktopActor({
  ...fallingAfterClose,
  x: 2_200,
  y: 1_200,
  state: 'falling',
}, buildDesktopTerrain(workArea, []), 16);
check('拖到工作区下方松手后会立即恢复到可见地面',
  recoveredBelowFloor.state === 'walking'
  && recoveredBelowFloor.y + recoveredBelowFloor.height === workArea.height
  && recoveredBelowFloor.x + recoveredBelowFloor.width <= workArea.width);

const movedWhileStanding = advanceDesktopActor(
  { ...reachedTop, supportOffsetX: 200 },
  buildDesktopTerrain(workArea, [
    { id: 'editor', x: 320, y: 460, width: 700, height: 580, visible: true },
  ]),
  0,
);
check('窗口移动时宠物保持相同的平台横向锚点', movedWhileStanding.x === 480);
check('窗口移动时宠物继续贴住新的顶边', movedWhileStanding.y + movedWhileStanding.height === 460);

const floorEdgeWalker: DesktopActor = {
  ...groundWalker,
  x: 1840,
  facing: 'right',
  supportOffsetX: 1880,
};
const turnedAtDesktopEdge = advanceDesktopActor(floorEdgeWalker, buildDesktopTerrain(workArea, []), 500);
check('走到工作区右边缘时在屏内转身', turnedAtDesktopEdge.x === 1840 && turnedAtDesktopEdge.facing === 'left');

console.log('\n[Shimeji 运行会话]');

const stationarySession = new DesktopRuntimeSession({ x: 360, y: 280, width: 80, height: 120 });
stationarySession.advance(terrain, 16);
const followedPlatform = stationarySession.advance(movedNotepad, 16);
check('静止宠物也会跟随支撑窗口移动', followedPlatform.x === 460 && followedPlatform.y === 340);
const fellAfterPlatformClosed = stationarySession.advance(buildDesktopTerrain(workArea, []), 100);
check('静止宠物的平台关闭后仍进入坠落', fellAfterPlatformClosed.state === 'falling' && fellAfterPlatformClosed.y > 340);

const walkingSession = new DesktopRuntimeSession({ x: 10, y: 920, width: 80, height: 120 });
walkingSession.setWalking(true, 'right');
walkingSession.advance(buildDesktopTerrain(workArea, []), 16);
const walkedOnFloor = walkingSession.advance(buildDesktopTerrain(workArea, []), 500);
check('会话开始游走后使用共享运动核心推进', walkedOnFloor.x > 10 && walkingSession.visualState === 'walking');

const climbingSession = new DesktopRuntimeSession({ x: 110, y: 920, width: 80, height: 120 });
climbingSession.setWalking(true, 'right');
climbingSession.advance(climbingTerrain, 16);
const climbingFrame = climbingSession.advance(climbingTerrain, 200);
check('会话碰到窗口侧边后暴露独立的攀爬视觉状态',
  climbingFrame.state === 'climbing' && climbingSession.visualState === 'climbing');

console.log('\n[Shimeji 可见角色碰撞布局]');

const actorLayout = deriveBottomCenteredActorLayout(
  { x: 100, y: 200, width: 400, height: 400 },
  { width: 153.6, height: 166.4 },
);
check('碰撞使用底部居中的角色尺寸而不是整个透明窗口',
  actorLayout.actor.x === 223
  && actorLayout.actor.y === 434
  && actorLayout.actor.width === 154
  && actorLayout.actor.height === 166);
check('角色位置可无损换算回窗口左上角',
  windowPositionForActor(actorLayout.actor, actorLayout.insets).x === 100
  && windowPositionForActor(actorLayout.actor, actorLayout.insets).y === 200);

const alphaAwareLayout = deriveBottomCenteredActorLayout(
  { x: 100, y: 200, width: 400, height: 400 },
  {
    width: 153.6,
    height: 166.4,
    contentInsets: { left: 10, top: 38, right: 10, bottom: 10 },
  },
);
check('碰撞范围进一步收紧到整套动画的稳定可见像素外框',
  alphaAwareLayout.actor.x === 233
  && alphaAwareLayout.actor.y === 472
  && alphaAwareLayout.actor.width === 134
  && alphaAwareLayout.actor.height === 118
  && alphaAwareLayout.insets.left === 133
  && alphaAwareLayout.insets.top === 272
  && alphaAwareLayout.insets.right === 133
  && alphaAwareLayout.insets.bottom === 10);
check('可见像素外框仍可无损换算回窗口左上角',
  windowPositionForActor(alphaAwareLayout.actor, alphaAwareLayout.insets).x === 100
  && windowPositionForActor(alphaAwareLayout.actor, alphaAwareLayout.insets).y === 200);

const topTouchingWindow = clampWindowPositionByActor(
  { x: 100, y: -500, width: 400, height: 400 },
  actorLayout.insets,
  workArea,
);
check('角色碰到屏幕顶边时只允许透明留白出屏',
  topTouchingWindow.y === -234
  && topTouchingWindow.y + actorLayout.insets.top === workArea.y);

const rightTouchingWindow = clampWindowPositionByActor(
  { x: 2_000, y: 300, width: 400, height: 400 },
  actorLayout.insets,
  workArea,
);
check('角色碰到屏幕右边时不会隔着一个透明窗口留白',
  rightTouchingWindow.x === 1_643
  && rightTouchingWindow.x + 400 - actorLayout.insets.right === 1_920);

const smoothedWindow = approachWindowPosition(
  { x: 0, y: 0 },
  { x: 300, y: 400 },
  100,
  1_000,
);
check('地形快照跳变时窗口按速率连续追赶而不是瞬移',
  smoothedWindow.x === 60 && smoothedWindow.y === 80);
check('普通小步移动不被额外延迟',
  approachWindowPosition({ x: 10, y: 20 }, { x: 11, y: 21 }, 16, 1_000).x === 11);

console.log('\n[Windows 窗口桥协议]');

const probePayload = parseWindowProbePayload(JSON.stringify({
  version: WINDOW_PROBE_PROTOCOL_VERSION,
  coordinateSpace: 'physical',
  windows: [
    { id: '9007199254740993', pid: 42, left: 200, top: 100, right: 1000, bottom: 700, visible: true, minimized: false, cloaked: false },
    { id: '8', pid: 99, left: 40, top: 20, right: 240, bottom: 220, visible: true, minimized: false, cloaked: false },
    { id: '8', pid: 99, left: 0, top: 0, right: 1, bottom: 1, visible: true, minimized: false, cloaked: false },
    { id: 'bad-handle', pid: 12, left: 0, top: 0, right: 100, bottom: 100, visible: true, minimized: false, cloaked: false },
    { id: '10', pid: 12, left: 100, top: 100, right: 90, bottom: 200, visible: true, minimized: false, cloaked: false },
  ],
}));
check('窗口句柄保持字符串，不经过不安全 number', probePayload.windows[0]?.id === '9007199254740993');
check('坏矩形、坏句柄和重复句柄被丢弃', probePayload.windows.length === 2);

const normalizedWindows = normalizeWindowSnapshots(probePayload, 99, (rect) => ({
  x: rect.x / 2,
  y: rect.y / 2,
  width: rect.width / 2,
  height: rect.height / 2,
}));
check('物理像素矩形通过适配器转换为 Electron DIP', normalizedWindows[0]?.width === 400 && normalizedWindows[0]?.height === 300);
check('属于当前进程的 HWND 会标记为自身窗口', normalizedWindows[1]?.own === true);

let invalidJsonRejected = false;
try { parseWindowProbePayload('{broken'); } catch { invalidJsonRejected = true; }
check('拒绝原生桥返回的非法 JSON', invalidJsonRejected);

let unsupportedProtocolRejected = false;
try {
  parseWindowProbePayload(JSON.stringify({ version: 2, coordinateSpace: 'physical', windows: [] }));
} catch { unsupportedProtocolRejected = true; }
check('拒绝不兼容的协议版本', unsupportedProtocolRejected);

console.log('\n[窗口快照生命周期]');

let releaseCapture: ((windows: DesktopWindowSnapshot[]) => void) | null = null;
let captureCount = 0;
const deferredMonitor = new WindowSnapshotMonitor(() => {
  captureCount += 1;
  return new Promise<DesktopWindowSnapshot[]>((resolve) => { releaseCapture = resolve; });
});
const firstRefresh = deferredMonitor.refresh();
const overlappingRefresh = deferredMonitor.refresh();
check('慢探测期间不会启动重叠的系统查询', captureCount === 1);
releaseCapture?.([{ id: '77', x: 10, y: 20, width: 300, height: 200, visible: true }]);
await Promise.all([firstRefresh, overlappingRefresh]);
check('成功探测会发布最新窗口快照', deferredMonitor.snapshot[0]?.id === '77');

let reportedErrors = 0;
let resilientCaptureCount = 0;
const resilientMonitor = new WindowSnapshotMonitor(
  async () => {
    resilientCaptureCount += 1;
    if (resilientCaptureCount > 1) throw new Error('temporary probe failure');
    return [{ id: '88', x: 10, y: 20, width: 300, height: 200, visible: true }];
  },
  { onError: () => { reportedErrors += 1; } },
);
await resilientMonitor.refresh();
await resilientMonitor.refresh();
check('临时失败保留最后一次成功快照', resilientMonitor.snapshot[0]?.id === '88');
check('临时失败通过受控错误通道上报', reportedErrors === 1);

let sharedCaptureCount = 0;
const sharedSource = new SharedWindowSnapshotSource(async () => {
  sharedCaptureCount += 1;
  return [];
});
const unsubscribeA = sharedSource.subscribe(() => {});
const unsubscribeB = sharedSource.subscribe(() => {});
await Promise.resolve();
check('多个宠物订阅只启动一个共享窗口探测源', sharedSource.active && sharedCaptureCount === 1);
unsubscribeA();
check('关闭一只宠物不会停止其他宠物使用的探测源', sharedSource.active);
unsubscribeB();
unsubscribeB();
check('最后一只宠物关闭后停止探测源且退订幂等', !sharedSource.active);

console.log('\n[经典 Shimeji 配置兼容]');

const classicActions = `<?xml version="1.0"?>
<Mascot xmlns="http://www.group-finity.com/Mascot"><ActionList>
  <Action Name="Stand" Type="Pause" BorderType="Floor" Duration="600"><Animation>
    <Pose Image="/shime1.png" ImageRight="/shime1-r.png" Duration="250" />
  </Animation></Action>
  <Action Name="Walk" Type="Move" BorderType="Floor" Duration="1200"><Animation>
    <Pose Image="/shime2.png" Duration="6" />
    <Pose Image="../escape.png" Duration="#{dynamic}" />
  </Animation></Action>
  <Action Name="Fall" Type="Embedded" Class="com.group_finity.mascot.action.Fall" />
  <Action Name="Dragged" Type="Embedded" Class="com.group_finity.mascot.action.Dragged" />
  <Action Name="Thrown" Type="Embedded" Class="com.group_finity.mascot.action.Thrown" />
  <Action Name="ChaseMouse" Type="Move" BorderType="Floor" Duration="800" />
  <Action Name="Sit" Type="Stay" BorderType="Floor" Duration="1200"><Animation><Pose Image="/shime3.png" Duration="600" /></Animation></Action>
  <Action Name="LookAround" Type="Animate" BorderType="Floor" Duration="900"><Animation><Pose Image="/shime4.png" Duration="450" /></Animation></Action>
  <Action Name="Run" Type="Move" BorderType="Floor" Duration="1000"><Animation><Pose Image="/shime5.png" Duration="125" /></Animation></Action>
  <Action Name="Creep" Type="Move" BorderType="Floor" Duration="1400"><Animation><Pose Image="/shime6.png" Duration="175" /></Animation></Action>
  <Action Name="CrawlAlongCeiling" Type="Move" BorderType="Ceiling" Duration="1400"><Animation><Pose Image="/shime6.png" Duration="175" /></Animation></Action>
  <Action Name="Divide" Type="Sequence" Duration="1000"><Animation><Pose Image="/shime6.png" Duration="175" /></Animation></Action>
  <Action Name="Dynamic" Type="Move" Duration="#{mascot.anchor.x}" />
</ActionList></Mascot>`;
const classicBehaviors = `<?xml version="1.0"?>
<Mascot xmlns="http://www.group-finity.com/Mascot"><BehaviorList>
  <Behavior Name="Stand" Frequency="50"><NextBehaviorList Add="false">
    <BehaviorReference Name="Walk" Frequency="30" />
    <BehaviorReference Name="Fall" Frequency="10" />
  </NextBehaviorList></Behavior>
  <Behavior Name="Walk" Frequency="30" />
  <Behavior Name="Fall" Frequency="10" />
  <Behavior Name="Dragged" Frequency="0" />
  <Behavior Name="Thrown" Frequency="0" />
  <Behavior Name="ChaseMouse" Frequency="0" />
  <Behavior Name="Sit" Frequency="20" />
  <Behavior Name="LookAround" Frequency="10" />
  <Behavior Name="Run" Frequency="15" />
  <Behavior Name="Creep" Frequency="5" />
  <Behavior Name="CrawlAlongCeiling" Frequency="5" />
  <Behavior Name="Divide" Frequency="5" />
</BehaviorList></Mascot>`;
const compiledClassic = compileClassicShimeji(classicActions, classicBehaviors);
check('解析经典 Action/Behavior 与后继权重', compiledClassic.ok
  && compiledClassic.profile.actions.length === 12
  && compiledClassic.profile.behaviors.find((behavior) => behavior.name === 'Stand')?.next.length === 2);
check('高价值地面动作可区分坐下、观察、奔跑与爬行', compiledClassic.ok
  && compiledClassic.profile.actions.find((action) => action.name === 'Sit')?.kind === 'sit'
  && compiledClassic.profile.actions.find((action) => action.name === 'LookAround')?.kind === 'look'
  && compiledClassic.profile.actions.find((action) => action.name === 'Run')?.kind === 'run'
  && compiledClassic.profile.actions.find((action) => action.name === 'Creep')?.kind === 'crawl');
check('墙面/天花板复合动作优先归入物理攀爬语义', compiledClassic.ok
  && compiledClassic.profile.actions.find((action) => action.name === 'CrawlAlongCeiling')?.kind === 'climb');
check('安全提取 Pose 图片、右向帧和固定时长', compiledClassic.ok
  && compiledClassic.profile.actions.find((action) => action.name === 'Stand')?.poses[0]?.image === 'shime1.png'
  && compiledClassic.profile.actions.find((action) => action.name === 'Stand')?.poses[0]?.imageRight === 'shime1-r.png'
  && compiledClassic.profile.actions.find((action) => action.name === 'Stand')?.poses[0]?.durationMs === 250);
check('Pose 路径逃逸与动态时长被跳过而不执行', compiledClassic.ok
  && compiledClassic.profile.actions.find((action) => action.name === 'Walk')?.poses.length === 1
  && compiledClassic.warnings.some((warning) => warning.includes('Walk Pose')));
check('动态表达式不执行并从兼容子集中排除', compiledClassic.ok
  && !compiledClassic.profile.actions.some((action) => action.name === 'Dynamic')
  && compiledClassic.warnings.some((warning) => warning.includes('Dynamic')));
check('固定随机数按 Frequency 确定性选择行为', compiledClassic.ok
  && selectClassicBehavior(compiledClassic.profile, 0, 'Stand')?.name === 'Walk'
  && selectClassicBehavior(compiledClassic.profile, 0.99, 'Stand')?.name === 'Fall');
const runtimePlan = compiledClassic.ok ? compileClassicRuntimePlan(compiledClassic.profile) : [];
check('经典频率编译为等待与游走计划',
  runtimePlan.some((behavior) => behavior.name === 'Stand' && behavior.kind === 'waiting' && behavior.weight === 50)
  && runtimePlan.some((behavior) => behavior.name === 'Walk' && behavior.kind === 'wander' && behavior.weight === 30)
  && runtimePlan.some((behavior) => behavior.name === 'Sit' && behavior.kind === 'waiting')
  && runtimePlan.some((behavior) => behavior.name === 'LookAround' && behavior.kind === 'review')
  && runtimePlan.some((behavior) => behavior.name === 'Run' && behavior.kind === 'wander')
  && runtimePlan.some((behavior) => behavior.name === 'Creep' && behavior.kind === 'wander'));
check('物理动作不会进入随机自动行为计划',
  !runtimePlan.some((behavior) => ['Fall', 'Dragged', 'Thrown', 'CrawlAlongCeiling'].includes(behavior.name)));
check('未知动作不会被猜成观察行为自动触发',
  !runtimePlan.some((behavior) => behavior.name === 'Divide'));
if (compiledClassic.ok) {
  const oversizedPlan = compileClassicRuntimePlan({
    actions: compiledClassic.profile.actions,
    behaviors: Array.from({ length: 140 }, (_, index) => ({
      name: `Walk-${index}`,
      actionName: 'Walk',
      frequency: 1,
      next: [],
    })),
  });
  check('经典自动行为计划在加载契约上限内截断', oversizedPlan.length === 128);
  const fanoutActions = Array.from({ length: 8 }, (_, index) => ({
    name: `Fanout-${index}`,
    kind: 'unknown' as const,
    type: 'Sequence',
    border: null,
    durationMs: null,
    references: Array.from({ length: 8 }, () => index === 7 ? 'Walk' : `Fanout-${index + 1}`),
    poses: [],
  }));
  const boundedFanoutPlan = compileClassicRuntimePlan({
    actions: [...compiledClassic.profile.actions, ...fanoutActions],
    behaviors: [{ name: 'Fanout', actionName: 'Fanout-0', frequency: 1, next: [] }],
  });
  check('高扇出动作引用通过缓存解析且不会指数展开',
    boundedFanoutPlan[0]?.kind === 'wander' && boundedFanoutPlan[0].durationMs <= 10_000);
}

const withDoctype = compileClassicShimeji(
  '<!DOCTYPE Mascot SYSTEM "https://example.invalid/evil.dtd"><Mascot/>',
  classicBehaviors,
);
check('拒绝 DOCTYPE 与外部实体入口', !withDoctype.ok && withDoctype.errors.some((error) => error.includes('DOCTYPE')));

const missingRequired = compileClassicShimeji(
  '<Mascot><ActionList><Action Name="Stand" Type="Pause" /></ActionList></Mascot>',
  '<Mascot><BehaviorList><Behavior Name="Stand" Frequency="1" /></BehaviorList></Mascot>',
);
check('缺少 Fall/Dragged/Thrown 必备动作时明确拒绝', !missingRequired.ok && missingRequired.errors.some((error) => error.includes('Fall')));

console.log('\n[拖拽与惯性投掷]');

const velocityTracker = new PointerVelocityTracker();
velocityTracker.record(100, 300, 0);
velocityTracker.record(130, 270, 50);
velocityTracker.record(180, 240, 100);
const releaseVelocity = velocityTracker.velocity();
check('按最近指针样本计算二维释放速度', releaseVelocity.vx === 800 && releaseVelocity.vy === -600);
velocityTracker.record(10_000, -10_000, 101);
const clampedVelocity = velocityTracker.velocity();
check('异常高速投掷被限制到安全上限', Math.abs(clampedVelocity.vx) <= 1_600 && Math.abs(clampedVelocity.vy) <= 1_600);

const thrownSession = new DesktopRuntimeSession({ x: 400, y: 700, width: 80, height: 120 });
thrownSession.release({ vx: 600, vy: -900 });
const thrownFrame = thrownSession.advance(buildDesktopTerrain(workArea, []), 100);
check('释放后同时保留水平惯性和向上抛速', thrownFrame.x > 400 && thrownFrame.y < 700 && thrownSession.visualState === 'jumping');

const edgeThrownSession = new DesktopRuntimeSession({ x: 1830, y: 500, width: 80, height: 120 });
edgeThrownSession.release({ vx: 900, vy: 0 });
const bouncedFrame = edgeThrownSession.advance(buildDesktopTerrain(workArea, []), 100);
check('投掷撞到工作区侧边后立即停止水平滑行且不出屏',
  bouncedFrame.x === 1840 && bouncedFrame.vx === 0 && bouncedFrame.vy >= 0);

const topThrownSession = new DesktopRuntimeSession({ x: 700, y: 10, width: 80, height: 120 });
topThrownSession.release({ vx: 700, vy: -900 });
const topImpactFrame = topThrownSession.advance(buildDesktopTerrain(workArea, []), 100);
check('投掷撞到工作区顶边后不沿顶边水平滑行',
  topImpactFrame.y === workArea.y && topImpactFrame.vx === 0 && topImpactFrame.vy >= 0);

console.log('\n[Windows PowerShell 脚本编码]');

const utf8Script = Buffer.from("Write-Output '桌宠验收'\n", 'utf8');
const bomScript = ensureUtf8Bom(utf8Script);
check('为含中文的 Windows PowerShell 5.1 脚本添加 UTF-8 BOM',
  bomScript.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  && bomScript.subarray(3).equals(utf8Script));
check('已有 UTF-8 BOM 时保持字节稳定', ensureUtf8Bom(bomScript).equals(bomScript));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acceptanceScript = await fs.readFile(path.join(repoRoot, 'scripts', 'windows-shimeji-acceptance.ps1'), 'utf8');
check('Windows 验收脚本提供可选 1 小时长稳模式',
  acceptanceScript.includes('$SoakMinutes')
  && acceptanceScript.includes('$SampleSeconds')
  && acceptanceScript.includes('soak-samples.json'));
check('长稳模式采集工作集、句柄和直属 PowerShell 探测进程',
  acceptanceScript.includes('WorkingSet64')
  && acceptanceScript.includes('HandleCount')
  && acceptanceScript.includes('Get-AppProbeProcessCount'));
check('长稳模式循环召唤/关闭宠物并在结尾检查残留',
  acceptanceScript.includes('lifecycleCycles')
  && acceptanceScript.includes('关闭最后一只后运行时完全退出'));
check('Windows 证据启动前复核运行时 EXE 与 manifest 身份',
  acceptanceScript.includes('runtime-integrity.json')
  && acceptanceScript.includes('Get-FileHash')
  && acceptanceScript.includes('runtimeExeSha256'));
check('Windows 证据绑定实际验收脚本并记录 Windows 10/11 系统身份',
  acceptanceScript.includes('$PSCommandPath')
  && acceptanceScript.includes('acceptanceScriptSha256')
  && acceptanceScript.includes('Get-CimInstance Win32_OperatingSystem')
  && acceptanceScript.includes('windowsGeneration'));
check('Windows 脚本可选结构化记录 core/mixed 人工视觉验收',
  acceptanceScript.includes("[ValidateSet('none', 'core', 'mixed')]")
  && acceptanceScript.includes('Read-Host')
  && acceptanceScript.includes("id = 'mixed-dpi-anchor'")
  && acceptanceScript.includes('manual = [ordered]@{'));
check('人工验收每项保存对应屏幕截图且证据使用 schema v3',
  acceptanceScript.includes('manual-$($spec.id).png')
  && acceptanceScript.includes('schemaVersion = 3'));
check('Windows 脚本启动时核对目标 DPI 并使用可辨识的证据目录名',
  acceptanceScript.includes('$ExpectedDpiPercent')
  && acceptanceScript.includes('[ValidateSet(100, 125, 150)][int]$ExpectedDpiPercent = 100')
  && acceptanceScript.includes("'当前 DPI 与目标档位一致'")
  && acceptanceScript.includes('"win$windowsGeneration-dpi$dpiPercent-$ManualProfile"')
  && acceptanceScript.includes('"acceptance-evidence-$runLabel-"'));
const exportChecker = await fs.readFile(path.join(repoRoot, 'scripts', 'check-export.mjs'), 'utf8');
check('导出静态核验按放宽后的受控 ZIP 限制读取大型 Electron EXE',
  exportChecker.includes('readZipEntry(buf, exeEntry, ZIP_LIMITS_RELAXED)'));

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
