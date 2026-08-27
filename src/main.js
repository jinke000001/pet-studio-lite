const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} = require('electron');

const { loadRuntimeInputs } = require('./core/package-loader');
const { normalizeProductProfile } = require('./core/product-profile');
const { resolveProductProfile, selectProductSelector } = require('./core/profile-selector');
const { inspectWebp } = require('./core/webp-inspector');
const {
  clampBounds,
  createRuntimeContract,
  dragUpdateInterval,
  normalizeSettings,
  resizeAroundAnchor,
} = require('./core/runtime-core');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const packageMetadata = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
const productSelector = selectProductSelector({
  embeddedSelector: packageMetadata.desktopPetProduct,
  environmentSelector: process.env.PET_PRODUCT,
});
const profilePath = resolveProductProfile(PROJECT_ROOT, productSelector);
const selectedProfile = normalizeProductProfile(JSON.parse(fs.readFileSync(profilePath, 'utf8')));

app.setName(selectedProfile.productName);
app.setPath('userData', path.join(app.getPath('appData'), 'DesktopPetWorkflow', selectedProfile.productId));

const hasSingleInstanceLock = app.requestSingleInstanceLock({ productId: selectedProfile.productId });
if (!hasSingleInstanceLock) app.quit();

let runtime;
let window;
let tray;
let settings;
let dragSession;
let dragImmediate;

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const logPath = path.join(app.getPath('userData'), 'app.log');

function log(message) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never stop the pet from running.
  }
}

function loadSettings() {
  try {
    settings = normalizeSettings(runtime.product, JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  } catch {
    settings = normalizeSettings(runtime.product);
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(temporaryPath, settingsPath);
}

function notifyActivity() {
  if (window && !window.isDestroyed()) window.webContents.send('pet:user-activity');
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏', click: toggleWindow },
    {
      label: '大小',
      submenu: [0.5, 0.75, 1, 1.25, 1.5].map((scale) => ({
        label: `${Math.round(scale * 100)}%`,
        type: 'radio',
        checked: settings.scale === scale,
        click: () => applyScale(scale),
      })),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

function applyScale(value) {
  if (!window || window.isDestroyed()) return settings;
  settings = normalizeSettings(runtime.product, { ...settings, scale: value });
  const candidate = resizeAroundAnchor(window.getBounds(), runtime.pet.grid, settings.scale);
  const display = screen.getDisplayMatching(candidate);
  window.setBounds(clampBounds(candidate, display.workArea), false);
  window.webContents.invalidate();
  saveSettings();
  updateTrayMenu();
  notifyActivity();
  return settings;
}

function dragTick() {
  if (!dragSession || !window || window.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const x = Math.round(dragSession.windowX + cursor.x - dragSession.cursorX);
  const y = Math.round(dragSession.windowY + cursor.y - dragSession.cursorY);
  if (x !== dragSession.lastX || y !== dragSession.lastY) {
    dragSession.lastX = x;
    dragSession.lastY = y;
    window.setPosition(x, y, false);
  }
}

function pumpDrag() {
  if (!dragSession) {
    dragImmediate = undefined;
    return;
  }
  const now = performance.now();
  if (now >= dragSession.nextTickAt) {
    dragTick();
    dragSession.nextTickAt = now + dragSession.intervalMs;
  }
  dragImmediate = setImmediate(pumpDrag);
}

function stopDrag() {
  if (dragImmediate) clearImmediate(dragImmediate);
  dragImmediate = undefined;
  if (dragSession && window && !window.isDestroyed()) {
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    window.setBounds(clampBounds(bounds, display.workArea), false);
  }
  dragSession = undefined;
}

function startDrag() {
  if (!window || window.isDestroyed()) return false;
  stopDrag();
  const cursor = screen.getCursorScreenPoint();
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const intervalMs = dragUpdateInterval(display.displayFrequency);
  dragSession = {
    cursorX: cursor.x,
    cursorY: cursor.y,
    windowX: bounds.x,
    windowY: bounds.y,
    lastX: bounds.x,
    lastY: bounds.y,
    intervalMs,
    nextTickAt: performance.now() + intervalMs,
  };
  dragImmediate = setImmediate(pumpDrag);
  return true;
}

function initialBounds() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.round(runtime.pet.grid.cellWidth * settings.scale);
  const height = Math.round(runtime.pet.grid.cellHeight * settings.scale);
  return {
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    width,
    height,
  };
}

function createWindow() {
  const bounds = initialBounds();
  window = new BrowserWindow({
    ...bounds,
    title: runtime.product.productName,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setAlwaysOnTop(true, 'floating');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.on('console-message', (event) => {
    log(`renderer-console level=${event.level} ${event.message} ${event.sourceId}:${event.lineNumber}`);
  });
  window.webContents.on('render-process-gone', (_, details) => {
    log(`renderer-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.once('ready-to-show', () => {
    window.showInactive();
    log(`runtime-ready product=${runtime.product.productId} pet=${runtime.pet.id}`);
  });
  window.on('closed', () => {
    stopDrag();
    window = undefined;
  });
}

function toggleWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isVisible()) window.hide();
  else {
    window.showInactive();
    notifyActivity();
  }
}

function createTray() {
  const size = 24;
  const bitmap = Buffer.alloc(size * size * 4);
  const circles = [
    { x: 12, y: 14, radius: 7 },
    { x: 6, y: 7, radius: 3 },
    { x: 12, y: 5, radius: 3 },
    { x: 18, y: 7, radius: 3 },
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!circles.some((circle) => Math.hypot(x - circle.x, y - circle.y) <= circle.radius)) continue;
      const offset = (y * size + x) * 4;
      bitmap[offset] = 255;
      bitmap[offset + 1] = 255;
      bitmap[offset + 2] = 255;
      bitmap[offset + 3] = 255;
    }
  }
  const trayIcon = nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  tray.setToolTip(runtime.product.productName);
  tray.on('click', toggleWindow);
  updateTrayMenu();
}

function registerIpc() {
  ipcMain.handle('pet:get-runtime', () => ({
    ...createRuntimeContract(runtime.pet, runtime.product),
    atlasUrl: runtime.atlasUrl,
  }));
  ipcMain.handle('pet:get-settings', () => settings);
  ipcMain.handle('pet:set-scale', (_, value) => applyScale(value));
  ipcMain.handle('pet:drag-start', startDrag);
  ipcMain.on('pet:drag-stop', stopDrag);
  ipcMain.on('pet:hide', () => window?.hide());
  ipcMain.on('pet:quit', () => app.quit());
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (window) {
      window.showInactive();
      notifyActivity();
    }
  });

  app.whenReady().then(() => {
    runtime = loadRuntimeInputs({ projectRoot: PROJECT_ROOT, profilePath, inspectAtlas: inspectWebp });
    loadSettings();
    registerIpc();
    createWindow();
    createTray();
  }).catch((error) => {
    log(`startup-failed ${error.stack || error.message}`);
    app.quit();
  });
}

app.on('before-quit', stopDrag);
app.on('window-all-closed', (event) => event.preventDefault());
