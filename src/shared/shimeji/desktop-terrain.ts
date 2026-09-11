/**
 * Shimeji 桌面地形（纯逻辑）。
 *
 * Windows 桥只负责提供窗口快照；这里把快照转换成宠物可使用的平台和
 * 攀爬边缘。模块不依赖 Electron、DOM 或 Win32，坐标约定由桥统一成与
 * Electron BrowserWindow 相同的桌面坐标后再传入。
 */

export interface DesktopRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWindowSnapshot extends DesktopRect {
  /** HWND 使用字符串表达，避免 64 位句柄经过 JavaScript number 丢精度。 */
  id: string;
  visible: boolean;
  minimized?: boolean;
  cloaked?: boolean;
  own?: boolean;
}

export interface DesktopActorBounds extends DesktopRect {}

export interface PlatformSurface {
  id: string;
  windowId: string | null;
  left: number;
  right: number;
  y: number;
}

export interface WallSurface {
  windowId: string;
  edge: 'left' | 'right';
  x: number;
  top: number;
  bottom: number;
}

export interface DesktopTerrain {
  workArea: DesktopRect;
  floorY: number;
  platforms: PlatformSurface[];
  walls: WallSurface[];
}

export interface LandingProbe {
  previousFootY: number;
  nextFootY: number;
  footX: number;
}

export interface WallContact extends WallSurface {
  /** 碰墙后宠物左上角应吸附到的横坐标。 */
  actorX: number;
}

export type SupportResult =
  | { kind: 'supported'; id: string; left: number; right: number; y: number }
  | { kind: 'lost' };

const MIN_WINDOW_EDGE_PX = 2;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function validRect(rect: DesktopRect): boolean {
  return finite(rect.x)
    && finite(rect.y)
    && finite(rect.width)
    && finite(rect.height)
    && rect.width >= MIN_WINDOW_EDGE_PX
    && rect.height >= MIN_WINDOW_EDGE_PX;
}

function rectRight(rect: DesktopRect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: DesktopRect): number {
  return rect.y + rect.height;
}

/** 把只读窗口快照收敛成当前工作区内可碰撞的顶边和左右边。 */
export function buildDesktopTerrain(
  workArea: DesktopRect,
  windows: readonly DesktopWindowSnapshot[],
): DesktopTerrain {
  if (!validRect(workArea)) throw new Error('桌面工作区必须是有限且大于零的矩形');

  const areaRight = rectRight(workArea);
  const areaBottom = rectBottom(workArea);
  const platforms: PlatformSurface[] = [];
  const walls: WallSurface[] = [];

  for (const win of windows) {
    if (!validRect(win) || !win.id || !win.visible || win.minimized || win.cloaked || win.own) continue;

    const left = Math.max(workArea.x, win.x);
    const right = Math.min(areaRight, rectRight(win));
    const top = Math.max(workArea.y, win.y);
    const bottom = Math.min(areaBottom, rectBottom(win));
    if (right - left < MIN_WINDOW_EDGE_PX || bottom - top < MIN_WINDOW_EDGE_PX) continue;

    platforms.push({ id: win.id, windowId: win.id, left, right, y: top });
    walls.push({ windowId: win.id, edge: 'left', x: left, top, bottom });
    walls.push({ windowId: win.id, edge: 'right', x: right, top, bottom });
  }

  // 从上到下排序，连续下落跨过多个平台时选择最先撞到的一个。
  platforms.sort((a, b) => a.y - b.y || a.left - b.left || a.id.localeCompare(b.id));
  return { workArea: { ...workArea }, floorY: areaBottom, platforms, walls };
}

/**
 * 连续碰撞检测：比较上一帧和下一帧脚底位置，避免高速下落穿透窗口顶边。
 */
export function findLandingSurface(probe: LandingProbe, terrain: DesktopTerrain): PlatformSurface | null {
  if (!finite(probe.previousFootY) || !finite(probe.nextFootY) || !finite(probe.footX)) return null;
  if (probe.nextFootY < probe.previousFootY) return null;

  const candidates: PlatformSurface[] = [
    ...terrain.platforms,
    {
      id: 'work-area-floor',
      windowId: null,
      left: terrain.workArea.x,
      right: rectRight(terrain.workArea),
      y: terrain.floorY,
    },
  ];

  let nearest: PlatformSurface | null = null;
  for (const surface of candidates) {
    const crossed = probe.previousFootY <= surface.y && probe.nextFootY >= surface.y;
    const horizontallyInside = probe.footX >= surface.left && probe.footX <= surface.right;
    if (!crossed || !horizontallyInside) continue;
    if (!nearest || surface.y < nearest.y) nearest = surface;
  }
  return nearest;
}

/** 检查一次水平移动是否穿过可攀爬窗口边缘。 */
export function findWallContact(
  actor: DesktopActorBounds,
  nextX: number,
  terrain: DesktopTerrain,
): WallContact | null {
  if (!validRect(actor) || !finite(nextX) || nextX === actor.x) return null;

  const movingRight = nextX > actor.x;
  const actorTop = actor.y;
  const actorBottom = rectBottom(actor);
  const previousEdge = movingRight ? rectRight(actor) : actor.x;
  const nextEdge = movingRight ? nextX + actor.width : nextX;

  let nearest: WallContact | null = null;
  for (const wall of terrain.walls) {
    if (movingRight && wall.edge !== 'left') continue;
    if (!movingRight && wall.edge !== 'right') continue;
    if (actorBottom <= wall.top || actorTop >= wall.bottom) continue;

    const crossed = movingRight
      ? previousEdge <= wall.x && nextEdge >= wall.x
      : previousEdge >= wall.x && nextEdge <= wall.x;
    if (!crossed) continue;

    const contact: WallContact = {
      ...wall,
      actorX: movingRight ? wall.x - actor.width : wall.x,
    };
    if (!nearest) {
      nearest = contact;
    } else if (movingRight ? contact.x < nearest.x : contact.x > nearest.x) {
      nearest = contact;
    }
  }
  return nearest;
}

/**
 * 重新核对宠物当前依附的平台。目标仍存在时返回最新边界，让调用方跟随
 * 窗口移动；目标消失、最小化或被过滤后返回 lost，调用方应进入坠落。
 */
export function reconcileSupport(
  _actor: DesktopActorBounds,
  supportId: string | null,
  terrain: DesktopTerrain,
): SupportResult {
  if (!supportId) return { kind: 'lost' };
  if (supportId === 'work-area-floor') {
    return {
      kind: 'supported',
      id: supportId,
      left: terrain.workArea.x,
      right: rectRight(terrain.workArea),
      y: terrain.floorY,
    };
  }
  const surface = terrain.platforms.find((candidate) => candidate.id === supportId);
  if (!surface) return { kind: 'lost' };
  return { kind: 'supported', id: surface.id, left: surface.left, right: surface.right, y: surface.y };
}
