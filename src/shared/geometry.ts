/**
 * 宠物窗口的纯几何计算（不依赖 Electron，可直接在 Node 里单测）。
 *
 * 核心约定：缩放时窗口的 bottom-center 锚点不动 —— 宠物给人的感觉是
 * "站在原地长大/缩小"，而不是以左上角为支点漂移。缩放后的窗口还必须
 * 整体夹紧在当前匹配显示器的 workArea 内，避免默认停在右下角的用户
 * 放大窗口后宠物越出屏幕。
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

/**
 * 计算缩放后的窗口位置与尺寸。
 *
 * @param prev      缩放前窗口的实际 bounds（屏幕坐标）
 * @param nextSize  缩放后的窗口边长（窗口始终是正方形：基准尺寸 × zoom）
 * @param workArea  当前匹配显示器（screen.getDisplayMatching）的 workArea
 *
 * 锚点：prev 的 bottom-center（x + width/2, y + height）在新窗口中保持
 * 不变；随后整体夹紧到 workArea —— 锚点与夹紧冲突时夹紧优先（保证窗口
 * 完全可见）。窗口比 workArea 还大时贴 workArea 原点。
 */
export function computeAnchoredZoomBounds(prev: Rect, nextSize: number, workArea: Rect): Rect {
  const anchorX = prev.x + prev.width / 2;   // bottom-center 的 x
  const anchorBottom = prev.y + prev.height; // bottom-center 的 y

  let x = Math.round(anchorX - nextSize / 2);
  let y = Math.round(anchorBottom - nextSize);

  const maxX = workArea.x + workArea.width - nextSize;
  const maxY = workArea.y + workArea.height - nextSize;
  // workArea 比窗口还小时 hi < lo，直接把窗口贴到 workArea 原点。
  x = maxX < workArea.x ? workArea.x : clamp(x, workArea.x, maxX);
  y = maxY < workArea.y ? workArea.y : clamp(y, workArea.y, maxY);

  return { x, y, width: nextSize, height: nextSize };
}

/**
 * "回到屏幕右下角"的复位位置（首次启动的默认位也用它）：
 * 目标 = 当前显示器 workArea 右下角向内收 margin；workArea 比窗口大不了
 * 多少时夹紧保证窗口整体可见，比窗口还小时贴 workArea 原点（与
 * computeAnchoredZoomBounds 的夹紧策略一致）。
 *
 * 坐标全部使用 Electron 的 DIP（已含显示器缩放，多显示器原点可为负），
 * 因此对多显示器与缩放置换天然兼容。
 */
export function computeWorkAreaHomePosition(workArea: Rect, windowSize: number, margin = 32): { x: number; y: number } {
  const maxX = workArea.x + workArea.width - windowSize;
  const maxY = workArea.y + workArea.height - windowSize;
  const x = maxX < workArea.x ? workArea.x : Math.max(workArea.x, maxX - margin);
  const y = maxY < workArea.y ? workArea.y : Math.max(workArea.y, maxY - margin);
  return { x, y };
}
