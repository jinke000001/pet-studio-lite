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
import { WindowSnapshotMonitor } from '../src/pet/window-snapshot-monitor';

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

const movedWhileStanding = advanceDesktopActor(
  { ...reachedTop, supportOffsetX: 200 },
  buildDesktopTerrain(workArea, [
    { id: 'editor', x: 320, y: 460, width: 700, height: 580, visible: true },
  ]),
  0,
);
check('窗口移动时宠物保持相同的平台横向锚点', movedWhileStanding.x === 480);
check('窗口移动时宠物继续贴住新的顶边', movedWhileStanding.y + movedWhileStanding.height === 460);

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

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
