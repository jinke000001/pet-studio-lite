import type { DesktopRect } from './desktop-terrain';

/**
 * BrowserWindow 为气泡和交互保留了透明空间；物理碰撞只应使用底部
 * 居中的精灵单格。这组 inset 描述 actor 在原生窗口内的位置。
 */
export interface DesktopActorInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DesktopActorLayout {
  actor: DesktopRect;
  insets: DesktopActorInsets;
}

function finiteRect(rect: DesktopRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0;
}

function normalizedInsets(insets: DesktopActorInsets, width: number, height: number): DesktopActorInsets {
  if (![insets.left, insets.top, insets.right, insets.bottom].every(Number.isFinite)
    || insets.left < 0
    || insets.top < 0
    || insets.right < 0
    || insets.bottom < 0
    || insets.left + insets.right >= width
    || insets.top + insets.bottom >= height) {
    throw new Error('Shimeji actor insets must leave a finite visible area');
  }
  return insets;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * 让原生窗口以有限速度追赶物理 actor。普通逐帧移动会直接命中目标；
 * 只有窗口地形快照造成的大幅坐标变化才会被拆成连续的小步。
 */
export function approachWindowPosition(
  current: { x: number; y: number },
  target: { x: number; y: number },
  deltaMs: number,
  maxSpeedPxPerSecond: number,
): { x: number; y: number } {
  if (![current.x, current.y, target.x, target.y, deltaMs, maxSpeedPxPerSecond].every(Number.isFinite)) {
    return current;
  }

  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return target;

  const maxStep = Math.max(0, deltaMs) * Math.max(0, maxSpeedPxPerSecond) / 1_000;
  if (maxStep <= 0) return current;
  if (distance <= maxStep) {
    return { x: Math.round(target.x), y: Math.round(target.y) };
  }

  const ratio = maxStep / distance;
  return {
    x: Math.round(current.x + dx * ratio),
    y: Math.round(current.y + dy * ratio),
  };
}

/** 根据 CSS 的底部居中布局，从原生窗口换算实际参与碰撞的精灵单格。 */
export function deriveBottomCenteredActorLayout(
  windowBounds: DesktopRect,
  renderedSprite: { width: number; height: number; contentInsets?: DesktopActorInsets },
): DesktopActorLayout {
  if (!finiteRect(windowBounds)
    || !Number.isFinite(renderedSprite.width)
    || !Number.isFinite(renderedSprite.height)
    || renderedSprite.width <= 0
    || renderedSprite.height <= 0) {
    throw new Error('Shimeji window and rendered sprite bounds must be finite and greater than zero');
  }

  const cellWidth = Math.max(1, Math.min(windowBounds.width, Math.round(renderedSprite.width)));
  const cellHeight = Math.max(1, Math.min(windowBounds.height, Math.round(renderedSprite.height)));
  const contentInsets = normalizedInsets(
    renderedSprite.contentInsets
      ? {
        left: Math.round(renderedSprite.contentInsets.left),
        top: Math.round(renderedSprite.contentInsets.top),
        right: Math.round(renderedSprite.contentInsets.right),
        bottom: Math.round(renderedSprite.contentInsets.bottom),
      }
      : { left: 0, top: 0, right: 0, bottom: 0 },
    cellWidth,
    cellHeight,
  );
  const cellLeft = Math.floor((windowBounds.width - cellWidth) / 2);
  const cellTop = windowBounds.height - cellHeight;
  const left = cellLeft + contentInsets.left;
  const top = cellTop + contentInsets.top;
  const actorWidth = cellWidth - contentInsets.left - contentInsets.right;
  const actorHeight = cellHeight - contentInsets.top - contentInsets.bottom;
  const insets = {
    left,
    top,
    right: windowBounds.width - left - actorWidth,
    bottom: windowBounds.height - top - actorHeight,
  };

  return {
    actor: {
      x: windowBounds.x + left,
      y: windowBounds.y + top,
      width: actorWidth,
      height: actorHeight,
    },
    insets,
  };
}

/** 把物理 actor 左上角换回 BrowserWindow 左上角。 */
export function windowPositionForActor(
  actor: Pick<DesktopRect, 'x' | 'y'>,
  insets: DesktopActorInsets,
): { x: number; y: number } {
  return {
    x: Math.round(actor.x - insets.left),
    y: Math.round(actor.y - insets.top),
  };
}

/**
 * 夹紧原生窗口时只要求 actor 留在 workArea 内。窗口用于气泡的透明
 * 留白可以伸出屏幕，否则角色会在边框前隔着整块透明区域。
 */
export function clampWindowPositionByActor(
  requested: DesktopRect,
  rawInsets: DesktopActorInsets,
  workArea: DesktopRect,
): DesktopRect {
  if (!finiteRect(requested) || !finiteRect(workArea)) {
    throw new Error('Shimeji window and work area must be finite and greater than zero');
  }
  const insets = normalizedInsets(rawInsets, requested.width, requested.height);
  const minX = workArea.x - insets.left;
  const maxX = workArea.x + workArea.width - requested.width + insets.right;
  const minY = workArea.y - insets.top;
  const maxY = workArea.y + workArea.height - requested.height + insets.bottom;
  return {
    x: Math.round(clamp(requested.x, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(requested.y, minY, Math.max(minY, maxY))),
    width: requested.width,
    height: requested.height,
  };
}
