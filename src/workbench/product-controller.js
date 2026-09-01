const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function productError(code, message) { const error = new Error(message); error.code = code; return error; }
function normalizeProductInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw productError('INVALID_PRODUCT_INPUT', '产品配置无效。');
  const fields = ['productName', 'version', 'productId', 'appId', 'executableName', 'artifactName'];
  if (fields.some((field) => typeof input[field] !== 'string' || !input[field].trim())) throw productError('INVALID_PRODUCT_INPUT', '产品名称、版本和身份字段均不能为空。');
  const values = Object.fromEntries(fields.map((field) => [field, input[field].trim()]));
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(values.version)) throw productError('INVALID_PRODUCT_INPUT', '版本应使用语义化版本格式。');
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(values.productId) || !/^com\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(values.appId)) throw productError('INVALID_PRODUCT_INPUT', '产品 ID 或 appId 格式不安全。');
  if (!/^[A-Za-z][A-Za-z0-9-]{2,47}$/.test(values.executableName) || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(values.artifactName)) throw productError('INVALID_PRODUCT_INPUT', '可执行文件或产物名称格式不安全。');
  const targets = input.targets === undefined ? ['mac', 'win'] : input.targets;
  if (!Array.isArray(targets) || targets.length === 0 || new Set(targets).size !== targets.length
    || targets.some((target) => !['mac', 'win'].includes(target))) {
    throw productError('INVALID_PRODUCT_INPUT', '目标平台应为不重复的 mac 或 win。');
  }
  return { ...values, targets: [...targets] };
}
function createProductController({ store }) {
  function projectDirectory(projectId) {
    return path.dirname(store.resolveProjectPath(projectId, 'project.json'));
  }
  function packageDirectory(projectId, project) {
    const artifact = project.artifacts.find((candidate) => candidate.id === project.latestImport?.artifactId);
    if (!artifact) throw productError('EXPORT_NOT_READY', '标准宠物包不存在。');
    return store.resolveProjectPath(projectId, ...artifact.relativePath.split('/'));
  }
  function copyPackage(source, destination) {
    fs.mkdirSync(destination);
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'pet.json'), 'utf8'));
    for (const name of ['pet.json', manifest.spritesheetPath]) fs.copyFileSync(path.join(source, name), path.join(destination, name), fs.constants.COPYFILE_EXCL);
  }
  return {
    save(projectId, input) {
      const product = normalizeProductInput(input);
      return store.updateProject(projectId, (project) => ({ ...project, product, activeStep: 'export', steps: { ...project.steps, product: { status: 'completed' }, export: { status: 'active' } } }));
    },
    exportProject(projectId) {
      const project = store.loadProject(projectId); if (!project.product || !project.latestImport) throw productError('EXPORT_NOT_READY', '请先完成导入和产品配置。');
      const root = store.resolveProjectPath(projectId, 'workspace', 'exports'); fs.mkdirSync(root, { recursive: true });
      const id = `export-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; const out = path.join(root, id); fs.mkdirSync(out);
      const packageOut = path.join(out, 'standard-package'); copyPackage(packageDirectory(projectId, project), packageOut);
      fs.copyFileSync(store.resolveProjectPath(projectId, 'project.json'), path.join(out, 'project.json'), fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, kind: 'projectArchive', projectId, product: project.product, importedAt: project.latestImport.importedAt, exportedAt: new Date().toISOString(), contents: ['project.json', 'standard-package/pet.json'] }, null, 2)}\n`, { flag: 'wx' });
      const relativePath = path.relative(projectDirectory(projectId), out).split(path.sep).join('/');
      return store.updateProject(projectId, (current) => ({ ...current, artifacts: [...current.artifacts, { id, kind: 'projectArchive', relativePath, createdAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out, 'manifest.json'))).digest('hex') }], activeStep: 'export', steps: { ...current.steps, export: { status: 'completed' } } }));
    },
    exportStandardPackage(projectId) {
      const project = store.loadProject(projectId); if (!project.latestImport) throw productError('EXPORT_NOT_READY', '请先完成成功导入。');
      const root = store.resolveProjectPath(projectId, 'workspace', 'exports'); fs.mkdirSync(root, { recursive: true });
      const id = `standard-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; const out = path.join(root, id); copyPackage(packageDirectory(projectId, project), out);
      const files = fs.readdirSync(out).sort().map((name) => { const bytes = fs.readFileSync(path.join(out, name)); return { name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; });
      fs.writeFileSync(path.join(out, 'export-manifest.json'), `${JSON.stringify({ schemaVersion: 1, kind: 'standardPackage', exportedAt: new Date().toISOString(), source: project.latestImport.sourceIdentity, authorizationStatus: project.latestImport.authorizationStatus, evidenceLevel: 'normalized-source-package', files }, null, 2)}\n`, { flag: 'wx' });
      const relativePath = path.relative(projectDirectory(projectId), out).replaceAll(path.sep, '/');
      return store.updateProject(projectId, (current) => ({ ...current, artifacts: [...current.artifacts, { id, kind: 'standardPackage', relativePath, createdAt: new Date().toISOString() }] }));
    },
  };
}
module.exports = { normalizeProductInput, createProductController };
