const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

function controllerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function copyRegularFile(source, destination) {
  const stats = fs.lstatSync(source);
  if (!stats.isFile() || stats.isSymbolicLink()) throw controllerError('INVALID_PREVIEW_ARTIFACT', '预览来源文件无效。');
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function createPreviewBundle(store, projectId) {
  const project = store.loadProject(projectId);
  if (!project.latestImport) throw controllerError('IMPORT_NOT_READY', '请先完成一次成功导入。');
  const artifact = project.artifacts.find((candidate) => candidate.id === project.latestImport.artifactId);
  if (!artifact || artifact.kind !== 'standardPackage') {
    throw controllerError('INVALID_PREVIEW_ARTIFACT', '项目导入产物无效。');
  }
  const packageSource = store.resolveProjectPath(projectId, ...artifact.relativePath.split('/'));
  const manifestSource = path.join(packageSource, 'pet.json');
  const manifest = JSON.parse(fs.readFileSync(manifestSource, 'utf8'));
  if (typeof manifest.spritesheetPath !== 'string'
    || manifest.spritesheetPath.includes('/') || manifest.spritesheetPath.includes('\\')) {
    throw controllerError('INVALID_PREVIEW_ARTIFACT', '预览图集路径无效。');
  }
  const bundleRoot = store.resolveProjectPath(projectId, 'workspace', 'previews', project.latestImport.id);
  if (fs.existsSync(bundleRoot)) {
    const marker = path.join(bundleRoot, '.desktop-pet-preview.json');
    if (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink()) {
      throw controllerError('INVALID_PREVIEW_BUNDLE', '已有预览包不完整，工作台拒绝复用。');
    }
    return bundleRoot;
  }
  const previewsRoot = store.resolveProjectPath(projectId, 'workspace', 'previews');
  fs.mkdirSync(previewsRoot, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(previewsRoot, '.tmp-preview-'));
  try {
    const profileDirectory = path.join(temporaryRoot, 'config', 'products');
    const packageDestination = path.join(temporaryRoot, 'local-pets', 'imported');
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(packageDestination, { recursive: true });
    copyRegularFile(manifestSource, path.join(packageDestination, 'pet.json'));
    copyRegularFile(
      path.join(packageSource, manifest.spritesheetPath),
      path.join(packageDestination, manifest.spritesheetPath),
    );
    const suffix = project.id.slice(-6);
    const profile = {
      productId: `studio-preview-${suffix}`,
      productName: `${project.latestImport.pet.displayName} · 制作台预览`,
      petPackagePath: 'local-pets/imported',
      version: '0.0.0-preview',
      build: {
        appId: `com.jinke.desktop-pet.preview.${suffix}`,
        executableName: `StudioPreview${suffix}`,
        artifactName: `studio-preview-${suffix}`,
        iconStrategy: 'electron-default-test',
      },
      defaultScale: 0.75,
      messages: { singleClick: '预览检查中。', doubleClick: '动作响应正常。' },
    };
    fs.writeFileSync(path.join(profileDirectory, 'preview.json'), `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(temporaryRoot, '.desktop-pet-preview.json'), `${JSON.stringify({
      schemaVersion: 1,
      projectId,
      importId: project.latestImport.id,
    }, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporaryRoot, bundleRoot);
    return bundleRoot;
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
}

function createPreviewController({
  store,
  electronPath,
  applicationRoot,
  spawn = childProcess.spawn,
  parentPid = process.pid,
}) {
  let active;

  async function stop() {
    const child = active?.child;
    active = undefined;
    if (!child || child.exitCode !== null) return { status: 'stopped' };
    await new Promise((resolve) => {
      let completed = false;
      const finish = () => { if (!completed) { completed = true; resolve(); } };
      child.once('exit', finish);
      child.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
        finish();
      }, 2000);
      timer.unref?.();
    });
    return { status: 'stopped' };
  }

  async function start(projectId) {
    await stop();
    const bundleRoot = createPreviewBundle(store, projectId);
    const userDataPath = store.resolveProjectPath(projectId, 'workspace', 'preview-user-data');
    fs.mkdirSync(userDataPath, { recursive: true });
    const environment = { ...process.env };
    delete environment.PET_PRODUCT;
    delete environment.ELECTRON_RUN_AS_NODE;
    Object.assign(environment, {
      DESKTOP_PET_PREVIEW_ROOT: bundleRoot,
      DESKTOP_PET_PREVIEW_USER_DATA: userDataPath,
      DESKTOP_PET_PREVIEW_PARENT_PID: String(parentPid),
    });
    const child = spawn(electronPath, ['.'], {
      cwd: applicationRoot,
      env: environment,
      stdio: 'ignore',
    });
    active = { child, projectId };
    child.once('exit', () => { if (active?.child === child) active = undefined; });
    try {
      await waitForSpawn(child);
    } catch (error) {
      if (active?.child === child) active = undefined;
      throw controllerError('PREVIEW_START_FAILED', `真实桌宠预览启动失败：${error.message}`);
    }
    return { status: 'running', projectId };
  }

  function status() {
    return active ? { status: 'running', projectId: active.projectId } : { status: 'stopped' };
  }

  return { start, status, stop };
}

module.exports = { createPreviewBundle, createPreviewController };
