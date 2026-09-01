const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function workspaceError(code, message) { const error = new Error(message); error.code = code; return error; }

function copySafeTree(source, destination) {
  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) throw workspaceError('UNSAFE_PROJECT_PATH', '项目产物包含符号链接，不能复制。');
  if (stats.isDirectory()) {
    fs.mkdirSync(destination);
    for (const entry of fs.readdirSync(source)) copySafeTree(path.join(source, entry), path.join(destination, entry));
    return;
  }
  if (!stats.isFile()) throw workspaceError('UNSAFE_PROJECT_PATH', '项目产物包含不支持的文件类型。');
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function createWorkspaceController({ store, reveal = () => {} }) {
  function duplicate(projectId, name) {
    const source = store.loadProject(projectId);
    const created = store.createProject({ name: name || `${source.name} 新版本` });
    if (!source.latestImport) return created;
    const sourceArtifact = source.artifacts.find((artifact) => artifact.id === source.latestImport.artifactId);
    if (!sourceArtifact) throw workspaceError('INVALID_PREVIEW_ARTIFACT', '当前项目缺少可复制的标准宠物包。');
    const copyId = `copy-${crypto.randomBytes(6).toString('hex')}`;
    const copyRoot = store.resolveProjectPath(created.id, 'workspace', 'imports', copyId);
    fs.mkdirSync(copyRoot, { recursive: true });
    copySafeTree(store.resolveProjectPath(projectId, ...sourceArtifact.relativePath.split('/')), path.join(copyRoot, 'package'));
    return store.updateProject(created.id, (project) => ({
      ...project,
      activeStep: source.product ? 'export' : 'preview',
      steps: structuredClone(source.steps),
      jobs: [],
      artifacts: [{ ...sourceArtifact, relativePath: `workspace/imports/${copyId}/package`, createdAt: new Date().toISOString() }],
      latestImport: structuredClone(source.latestImport),
      product: source.product ? structuredClone(source.product) : null,
    }));
  }

  function revealArtifact(projectId, artifactId) {
    if (typeof artifactId !== 'string' || artifactId.length > 160) throw workspaceError('INVALID_ARTIFACT_ID', '产物 ID 无效。');
    const project = store.loadProject(projectId);
    const artifact = project.artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact?.relativePath) throw workspaceError('ARTIFACT_NOT_FOUND', '找不到项目产物。');
    const target = store.resolveProjectPath(projectId, ...artifact.relativePath.split('/'));
    reveal(target);
    return { artifactId, revealed: true };
  }

  return { duplicate, revealArtifact };
}

module.exports = { copySafeTree, createWorkspaceController };
