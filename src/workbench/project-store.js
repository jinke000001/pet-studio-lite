const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  createWorkbenchProject,
  validateProjectId,
  validateWorkbenchProject,
} = require('./contracts');

const MAX_PROJECT_FILE_BYTES = 1024 * 1024;

function storeError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function projectIdFor(date, randomHex) {
  const timestamp = date.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
  return `studio-${timestamp}-${randomHex()}`;
}

function writeJsonFile(filePath, value, { replace = false } = {}) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  try {
    if (replace) fs.rmSync(filePath, { force: true });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function readJsonFile(filePath, errorCode, message) {
  let stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    throw storeError(errorCode, message, error);
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_PROJECT_FILE_BYTES) {
    throw storeError(errorCode, message);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw storeError(errorCode, message, error);
  }
}

function createProjectStore({
  workspaceRoot,
  now = () => new Date(),
  randomHex = () => crypto.randomBytes(3).toString('hex'),
}) {
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) {
    throw storeError('INVALID_WORKSPACE_ROOT', '工作台存储目录无效。');
  }
  const projectsRoot = path.join(workspaceRoot, 'projects');
  const recentPath = path.join(workspaceRoot, 'recent.json');

  function ensureRoot() {
    fs.mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
    const workspaceStats = fs.lstatSync(workspaceRoot);
    if (!workspaceStats.isDirectory() || workspaceStats.isSymbolicLink()) {
      throw storeError('UNSAFE_WORKSPACE_PATH', '工作台存储目录不安全。');
    }
    fs.mkdirSync(projectsRoot, { recursive: true, mode: 0o700 });
    const projectsStats = fs.lstatSync(projectsRoot);
    if (!projectsStats.isDirectory() || projectsStats.isSymbolicLink()) {
      throw storeError('UNSAFE_WORKSPACE_PATH', '工作台项目目录不安全。');
    }
  }

  function projectDirectory(projectId) {
    return path.join(projectsRoot, validateProjectId(projectId));
  }

  function assertSafeProjectDirectory(directory) {
    let stats;
    try {
      stats = fs.lstatSync(directory);
    } catch (error) {
      throw storeError('PROJECT_NOT_FOUND', '找不到制作项目。', error);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError('UNSAFE_PROJECT_PATH', '制作项目目录不安全。');
    }
  }

  function remember(projectId) {
    ensureRoot();
    writeJsonFile(recentPath, { projectId: validateProjectId(projectId) }, { replace: true });
  }

  function loadProject(projectId) {
    ensureRoot();
    const directory = projectDirectory(projectId);
    assertSafeProjectDirectory(directory);
    const projectPath = path.join(directory, 'project.json');
    let project;
    try {
      project = readJsonFile(projectPath, 'INVALID_PROJECT_FILE', '制作项目文件无效。');
      validateWorkbenchProject(project);
    } catch (error) {
      if (error.code === 'INVALID_PROJECT_FILE') throw error;
      throw storeError('INVALID_PROJECT_FILE', '制作项目文件无效。', error);
    }
    if (project.id !== projectId) throw storeError('INVALID_PROJECT_FILE', '制作项目身份不一致。');
    return project;
  }

  function listProjects() {
    ensureRoot();
    return fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^studio-[0-9]{8}-[0-9]{6}-[a-f0-9]{6}$/.test(entry.name))
      .map((entry) => loadProject(entry.name))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  function createProject(input) {
    ensureRoot();
    const createdAt = now();
    const project = createWorkbenchProject({
      id: projectIdFor(createdAt, randomHex),
      name: input?.name,
      now: createdAt.toISOString(),
    });
    const directory = projectDirectory(project.id);
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') throw storeError('PROJECT_EXISTS', '同一版本的制作项目已存在。', error);
      throw error;
    }
    try {
      for (const name of ['workspace', 'jobs', 'artifacts']) {
        fs.mkdirSync(path.join(directory, name), { mode: 0o700 });
      }
      writeJsonFile(path.join(directory, 'project.json'), project);
      remember(project.id);
      return project;
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }

  function openProject(projectId) {
    const project = loadProject(projectId);
    remember(project.id);
    return project;
  }

  function loadMostRecentProject() {
    ensureRoot();
    if (!fs.existsSync(recentPath)) return listProjects()[0] || null;
    const recent = readJsonFile(recentPath, 'INVALID_RECENT_FILE', '最近项目记录无效。');
    if (!recent || Object.keys(recent).length !== 1) {
      throw storeError('INVALID_RECENT_FILE', '最近项目记录无效。');
    }
    return loadProject(validateProjectId(recent.projectId));
  }

  return { createProject, listProjects, loadMostRecentProject, loadProject, openProject };
}

module.exports = { createProjectStore, projectIdFor };
