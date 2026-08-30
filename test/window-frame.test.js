const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createDisplayMetricsSynchronizer,
  forceWindowsTransparentWindowRepaint,
  synchronizePetWindowFrame,
} = require('../src/core/window-frame');

test('restores the configured logical size around the bottom-center anchor', () => {
  const applied = [];
  let invalidations = 0;
  const window = {
    getBounds: () => ({ x: 100, y: 100, width: 115, height: 130 }),
    setBounds: (bounds) => applied.push(bounds),
    webContents: { invalidate: () => { invalidations += 1; } },
  };

  const bounds = synchronizePetWindowFrame({
    window,
    grid: { cellWidth: 192, cellHeight: 208 },
    scale: 0.75,
    workArea: { x: 0, y: 0, width: 2560, height: 1400 },
  });

  assert.deepEqual(bounds, { x: 86, y: 74, width: 144, height: 156 });
  assert.deepEqual(applied, [bounds]);
  assert.equal(invalidations, 1);
});

test('debounces relevant display metric changes and ignores unrelated metrics', () => {
  const scheduled = new Map();
  const cancelled = [];
  const synchronized = [];
  let nextId = 1;
  const petWindow = { isDestroyed: () => false };
  const synchronizer = createDisplayMetricsSynchronizer({
    getWindow: () => petWindow,
    synchronizeWindow: (window, display, changedMetrics) => {
      synchronized.push([window, display.id, changedMetrics]);
    },
    schedule(callback, delay) {
      const id = nextId;
      nextId += 1;
      scheduled.set(id, { callback, delay });
      return id;
    },
    cancel(id) {
      cancelled.push(id);
      scheduled.delete(id);
    },
  });

  synchronizer.handle({}, { id: 7 }, ['rotation']);
  assert.equal(scheduled.size, 0);
  synchronizer.handle({}, { id: 7 }, ['scaleFactor']);
  synchronizer.handle({}, { id: 7 }, ['bounds', 'workArea']);
  assert.deepEqual(cancelled, [1]);
  assert.equal(scheduled.size, 1);
  const pending = [...scheduled.values()][0];
  assert.equal(pending.delay, 180);
  pending.callback();
  assert.deepEqual(synchronized, [[petWindow, 7, ['bounds', 'workArea']]]);
});

test('forces a Windows transparent surface repaint without changing final bounds', () => {
  const intendedBounds = { x: 100, y: 700, width: 144, height: 156 };
  const applied = [];
  let invalidations = 0;
  const window = {
    getBounds: () => intendedBounds,
    setBounds: (bounds) => applied.push(bounds),
    webContents: { invalidate: () => { invalidations += 1; } },
  };

  assert.equal(forceWindowsTransparentWindowRepaint(window, 'win32'), true);
  assert.deepEqual(applied, [
    { x: 100, y: 699, width: 144, height: 157 },
    intendedBounds,
  ]);
  assert.equal(invalidations, 1);
  assert.equal(forceWindowsTransparentWindowRepaint(window, 'darwin'), false);
});

test('main and renderer require a real renderer frame before showing the pet', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');

  assert.match(mainSource, /screen\.on\('display-metrics-changed'/);
  assert.match(mainSource, /ipcMain\.on\('renderer:first-frame'/);
  assert.match(mainSource, /if \(!windowReadyToShow \|\| !rendererFirstFrameReady\) return/);
  assert.match(preloadSource, /renderer:first-frame/);
  assert.match(rendererSource, /notifyFirstFrameRendered/);
  const dynamicDpiHandler = mainSource.match(
    /displayMetricsSynchronizer = createDisplayMetricsSynchronizer\(\{([\s\S]*?)\n    \}\);/,
  )?.[1] || '';
  assert.doesNotMatch(dynamicDpiHandler, /forceWindowsTransparentWindowRepaint/);
});
