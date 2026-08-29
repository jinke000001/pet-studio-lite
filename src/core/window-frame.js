const { clampBounds, resizeAroundAnchor } = require('./runtime-core');

const RELEVANT_DISPLAY_METRICS = new Set(['bounds', 'workArea', 'scaleFactor']);

function synchronizePetWindowFrame({ window, grid, scale, workArea }) {
  const intendedBounds = resizeAroundAnchor(window.getBounds(), grid, scale);
  const bounds = clampBounds(intendedBounds, workArea);
  window.setBounds(bounds, false);
  window.webContents.invalidate();
  return bounds;
}

function forceWindowsTransparentWindowRepaint(window, platform = process.platform) {
  if (platform !== 'win32') return false;
  const intendedBounds = window.getBounds();
  window.setBounds({
    ...intendedBounds,
    y: intendedBounds.y - 1,
    height: intendedBounds.height + 1,
  }, false);
  window.setBounds(intendedBounds, false);
  window.webContents.invalidate();
  return true;
}

function createDisplayMetricsSynchronizer({
  getWindow,
  synchronizeWindow,
  delayMs = 180,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let pendingTimer;

  function handle(_event, display, changedMetrics = []) {
    if (!changedMetrics.some((metric) => RELEVANT_DISPLAY_METRICS.has(metric))) return;
    if (pendingTimer !== undefined) cancel(pendingTimer);
    pendingTimer = schedule(() => {
      pendingTimer = undefined;
      const window = getWindow();
      if (!window || window.isDestroyed?.()) return;
      synchronizeWindow(window, display);
    }, delayMs);
  }

  function dispose() {
    if (pendingTimer === undefined) return;
    cancel(pendingTimer);
    pendingTimer = undefined;
  }

  return { dispose, handle };
}

module.exports = {
  createDisplayMetricsSynchronizer,
  forceWindowsTransparentWindowRepaint,
  synchronizePetWindowFrame,
};
