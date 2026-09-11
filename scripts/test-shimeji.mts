import {
  buildDesktopTerrain,
  findLandingSurface,
  findWallContact,
  reconcileSupport,
  type DesktopActorBounds,
} from '../src/shared/shimeji/desktop-terrain';
import { advanceDesktopActor, type DesktopActor } from '../src/shared/shimeji/desktop-motion';

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

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
