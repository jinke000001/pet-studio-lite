const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

// Preview children use the packaged application's normal entry. Switch that
// entry to the shared transparent-pet runtime instead of recursively opening
// another workbench window.
if (process.env.DESKTOP_PET_PREVIEW_ROOT) {
  require('../main');
} else {

const { createProjectStore } = require('./project-store');
const { validateProjectId } = require('./contracts');
const { createImportController, explainImportError } = require('./import-controller');
const { createImportSelectionHandler } = require('./import-selection');
const { createPreviewController } = require('./preview-controller');
const { createProductController } = require('./product-controller');
const { createJobController } = require('./job-controller');
const { createProjectLifecycle } = require('./project-lifecycle');
const { createCandidateController } = require('./candidate-controller');
const { createWorkspaceController } = require('./workspace-controller');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BUILDER_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'workbench-builder') : PROJECT_ROOT;
const BUILD_ASSETS_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'workbench-build-assets') : PROJECT_ROOT;
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

const logPath = path.join(userDataPath, 'studio.log');
function log(message) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never block the workbench.
  }
}

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

// Everything that touches project state, controllers, IPC or windows lives
// behind this bootstrap boundary. It may only run while this process holds
// the instance lock; a denied second instance must never reach it, because
// app.quit() alone does not stop in-flight module-level execution.
function bootstrapWorkbench(releaseInstanceLock) {
  const store = createProjectStore({ workspaceRoot: userDataPath });
  store.recoverInterruptedJobs();
  const importController = createImportController({ store });
  const previewController = createPreviewController({
    store,
    electronPath: process.execPath,
    applicationRoot: PROJECT_ROOT,
  });
  const productController = createProductController({ store });
  const candidateController = createCandidateController({ store, applicationRoot: PROJECT_ROOT, builderRoot: BUILDER_ROOT, buildAssetsRoot: BUILD_ASSETS_ROOT });
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
        const project = await importController.importSource(selected);
        return { projectId, importId: project.latestImport.id, artifactId: project.latestImport.artifactId };
      },
      'petdex-import': async (projectId, input, context) => {
        const project = await importController.importPetdex({ projectId, slug: input.slug, authorizationStatus: input.authorizationStatus }, context);
        return { projectId, importId: project.latestImport.id, artifactId: project.latestImport.artifactId };
      },
      export: (projectId) => {
        const project = productController.exportProject(projectId);
        return { projectId, artifactId: project.artifacts.at(-1).id };
      },
      build: (projectId, input, context) => candidateController.build(projectId, input, context),
    },
  });
  let window;
  const lifecycle = createProjectLifecycle({ store, jobs, previewController });
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

  function bootstrap(activeProject) {
    return { projects: store.listProjects(), activeProject };
  }

  function registerHandler(channel, callback) {
    ipcMain.handle(channel, async (event, input) => {
      try {
        assertTrustedSender(event);
        return { ok: true, value: await callback(input) };
      } catch (error) {
        log(`ipc-error channel=${channel} code=${error?.code || 'UNKNOWN'} message=${error?.message || error}`);
        return { ok: false, error: publicError(error) };
      }
    });
  }

  function registerIpc() {
    registerHandler('workbench:get-bootstrap', () => {
      const activeProject = store.loadMostRecentProject();
      // 启动恢复：界面会把最近项目当作活动项目展示，主进程必须同步
      // activeProjectId，否则恢复后的第一次同项目刷新会被误认为项目切换。
      if (activeProject) lifecycle.activateProject(activeProject.id);
      return {
        ...bootstrap(activeProject),
        petPreview: previewController.status(),
      };
    });
    registerHandler('workbench:create-project', (input) => {
      const activeProject = store.createProject(input);
      lifecycle.activateProject(activeProject.id);
      return bootstrap(activeProject);
    });
    registerHandler('workbench:open-project', async (projectId) => {
      const activeProject = await lifecycle.openProject(projectId);
      return bootstrap(activeProject);
    });
    registerHandler('workbench:select-import', async (input) => {
      const currentActiveProjectId = lifecycle.getActiveProjectId();
      if (currentActiveProjectId && currentActiveProjectId !== input.projectId) jobs.cancelProject(currentActiveProjectId);
      await previewController.stop();
      lifecycle.activateProject(input.projectId);
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
    window.webContents.on('did-finish-load', () => log(`renderer-ready url=${window?.webContents.getURL()}`));
    window.webContents.on('render-process-gone', (_event, details) => log(`renderer-gone reason=${details.reason} exitCode=${details.exitCode}`));
    window.on('unresponsive', () => log('window-unresponsive'));
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
    log('studio-ready');
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
  app.on('before-quit', () => { log('studio-before-quit'); jobs.shutdown(); selectedSources.clear(); previewController.stop(); releaseInstanceLock?.(); });
}

log(`studio-start pid=${process.pid} packaged=${app.isPackaged} userData=${userDataPath}`);
let nativeInstanceLock = false;
let lockError = null;
try {
  nativeInstanceLock = app.requestSingleInstanceLock();
} catch (error) {
  lockError = error;
  log(`single-instance-lock-error message=${error && error.message ? error.message : String(error)}`);
}
if (nativeInstanceLock) {
  log('single-instance-lock-acquired');
  bootstrapWorkbench(() => app.releaseSingleInstanceLock());
} else {
  if (!lockError) log('single-instance-lock-denied');
  app.quit();
}

}

module.exports = { assertTrustedSender, publicError };
