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

/** 根据 CSS 的底部居中布局，从原生窗口换算实际参与碰撞的精灵单格。 */
export function deriveBottomCenteredActorLayout(
  windowBounds: DesktopRect,
  renderedSprite: { width: number; height: number },
): DesktopActorLayout {
  if (!finiteRect(windowBounds)
    || !Number.isFinite(renderedSprite.width)
    || !Number.isFinite(renderedSprite.height)
    || renderedSprite.width <= 0
    || renderedSprite.height <= 0) {
    throw new Error('Shimeji window and rendered sprite bounds must be finite and greater than zero');
  }

  const actorWidth = Math.max(1, Math.min(windowBounds.width, Math.round(renderedSprite.width)));
  const actorHeight = Math.max(1, Math.min(windowBounds.height, Math.round(renderedSprite.height)));
  const left = Math.floor((windowBounds.width - actorWidth) / 2);
  const right = windowBounds.width - actorWidth - left;
  const top = windowBounds.height - actorHeight;
  const insets = { left, top, right, bottom: 0 };

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
