const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const { createProjectStore } = require('./project-store');
const { validateProjectId } = require('./contracts');
const { createImportController, explainImportError } = require('./import-controller');
const { createImportSelectionHandler } = require('./import-selection');
const { createPreviewController } = require('./preview-controller');
const { createProductController } = require('./product-controller');
const { createJobController } = require('./job-controller');
const { createCandidateController } = require('./candidate-controller');
const { createWorkspaceController } = require('./workspace-controller');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RENDERER_ENTRY = path.join(PROJECT_ROOT, '.workbench-dist', 'index.html');
const TRUSTED_RENDERER_URL = pathToFileURL(RENDERER_ENTRY).href;
const PUBLIC_ERROR_CODES = new Set([
  'INVALID_PROJECT_FILE', 'INVALID_PROJECT_ID', 'INVALID_PROJECT_INPUT',
  'INVALID_PROJECT_NAME', 'PROJECT_EXISTS', 'PROJECT_NOT_FOUND', 'UNSAFE_PROJECT_PATH',
]);

app.setName('桌宠制作台');
const userDataOverride = process.env.DESKTOP_PET_STUDIO_USER_DATA;
const userDataPath = userDataOverride && path.isAbsolute(userDataOverride)
  ? path.resolve(userDataOverride)
  : path.join(app.getPath('appData'), 'DesktopPetWorkflow', 'studio');
app.setPath('userData', userDataPath);
app.setAppUserModelId('com.jinke.desktop-pet.studio');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const store = createProjectStore({ workspaceRoot: userDataPath });
store.recoverInterruptedJobs();
const importController = createImportController({ store });
const previewController = createPreviewController({
  store,
  electronPath: process.execPath,
  applicationRoot: PROJECT_ROOT,
});
const productController = createProductController({ store });
const candidateController = createCandidateController({ store, applicationRoot: PROJECT_ROOT });
const workspaceController = createWorkspaceController({ store, reveal: (target) => shell.showItemInFolder(target) });
const selectedSources = new Map();
const jobs = createJobController({
  store,
  handlers: {
    import: async (projectId, input, context) => {
      const selected = selectedSources.get(input.selectionToken);
      if (!selected || selected.projectId !== projectId) {
        const error = new Error('导入选择已失效，请重新选择素材。'); error.code = 'IMPORT_SELECTION_EXPIRED'; throw error;
      }
      context.report(20, '复制并检查素材');
      return importController.importSource(selected);
    },
    'petdex-import': (projectId, input, context) => importController.importPetdex({ projectId, slug: input.slug, authorizationStatus: input.authorizationStatus }, context),
    export: (projectId) => productController.exportProject(projectId),
    build: (projectId, input, context) => candidateController.build(projectId, input, context),
  },
});
let window;
const selectImport = createImportSelectionHandler({
  dialog,
  getWindow: () => window,
  importController,
  enqueueImport: (selected) => {
    const selectionToken = crypto.randomBytes(16).toString('hex');
    selectedSources.set(selectionToken, selected);
    return jobs.enqueue(selected.projectId, 'import', { selectionToken });
  },
});

function assertTrustedSender(event) {
  if (event.senderFrame?.url !== TRUSTED_RENDERER_URL) {
    const error = new Error('不受信任的工作台请求。');
    error.code = 'UNTRUSTED_RENDERER';
    throw error;
  }
}

function publicError(error) {
  if (error && PUBLIC_ERROR_CODES.has(error.code)) return { code: error.code, message: error.message };
  return explainImportError(error);
}

function bootstrap(activeProject) {
  return { projects: store.listProjects(), activeProject };
}

function registerHandler(channel, callback) {
  ipcMain.handle(channel, async (event, input) => {
    try {
      assertTrustedSender(event);
      return { ok: true, value: await callback(input) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });
}

function registerIpc() {
  registerHandler('workbench:get-bootstrap', () => ({
    ...bootstrap(store.loadMostRecentProject()),
    petPreview: previewController.status(),
  }));
  registerHandler('workbench:create-project', (input) => {
    const activeProject = store.createProject(input);
    return bootstrap(activeProject);
  });
  registerHandler('workbench:open-project', async (projectId) => {
    jobs.cancelProject(store.loadMostRecentProject()?.id);
    await previewController.stop();
    const activeProject = store.openProject(projectId);
    return bootstrap(activeProject);
  });
  registerHandler('workbench:select-import', async (input) => {
    await previewController.stop();
    const result = await selectImport(input);
    return { ...bootstrap(result.project || store.loadProject(input.projectId)), cancelled: result.cancelled };
  });
  registerHandler('workbench:get-import-preview', (projectId) => (
    importController.loadPreview(validateProjectId(projectId))
  ));
  registerHandler('workbench:start-pet-preview', (projectId) => (
    previewController.start(validateProjectId(projectId))
  ));
  registerHandler('workbench:stop-pet-preview', () => previewController.stop());
  registerHandler('workbench:get-pet-preview-status', () => previewController.status());
  registerHandler('workbench:save-product', ({ projectId, product }) => productController.save(validateProjectId(projectId), product));
  registerHandler('workbench:export-project', (projectId) => productController.exportProject(validateProjectId(projectId)));
  registerHandler('workbench:export-standard-package', (projectId) => productController.exportStandardPackage(validateProjectId(projectId)));
  registerHandler('workbench:list-jobs', (projectId) => jobs.list(validateProjectId(projectId)));
  registerHandler('workbench:start-export-job', ({ projectId }) => jobs.enqueue(validateProjectId(projectId), 'export'));
  registerHandler('workbench:start-petdex-job', ({ projectId, slug, authorizationStatus }) => jobs.enqueue(validateProjectId(projectId), 'petdex-import', { slug, authorizationStatus }));
  registerHandler('workbench:duplicate-project', ({ projectId, name }) => bootstrap(workspaceController.duplicate(validateProjectId(projectId), name)));
  registerHandler('workbench:reveal-artifact', ({ projectId, artifactId }) => workspaceController.revealArtifact(validateProjectId(projectId), artifactId));
  registerHandler('workbench:start-candidate-job', ({ projectId, targets }) => jobs.enqueue(validateProjectId(projectId), 'build', { targets }));
  registerHandler('workbench:cancel-job', ({ projectId, jobId }) => jobs.cancel(validateProjectId(projectId), jobId));
  registerHandler('workbench:retry-job', ({ projectId, jobId }) => jobs.retry(validateProjectId(projectId), jobId));
}

function createWindow() {
  if (!fs.existsSync(RENDERER_ENTRY)) throw new Error('工作台前端尚未构建，请先运行 npm run studio:build。');
  window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: '桌宠制作台',
    backgroundColor: '#f5f3ee',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== TRUSTED_RENDERER_URL) event.preventDefault();
  });
  window.once('ready-to-show', () => window?.show());
  window.loadFile(RENDERER_ENTRY);
  window.on('closed', () => {
    previewController.stop();
    window = undefined;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  console.log('studio-ready');
  app.on('activate', () => { if (!window) createWindow(); });
});

app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { jobs.shutdown(); selectedSources.clear(); previewController.stop(); });

module.exports = { assertTrustedSender, publicError };
