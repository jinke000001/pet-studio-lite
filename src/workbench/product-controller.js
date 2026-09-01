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
  return { ...values, targets: Array.isArray(input.targets) && input.targets.length ? input.targets.filter((target) => ['mac', 'win'].includes(target)) : ['mac', 'win'] };
}
function createProductController({ store }) {
  return {
    save(projectId, input) {
      const product = normalizeProductInput(input);
      return store.updateProject(projectId, (project) => ({ ...project, product, activeStep: 'export', steps: { ...project.steps, product: { status: 'completed' }, export: { status: 'active' } } }));
    },
    exportProject(projectId) {
      const project = store.loadProject(projectId); if (!project.product || !project.latestImport) throw productError('EXPORT_NOT_READY', '请先完成导入和产品配置。');
      const root = store.resolveProjectPath(projectId, 'workspace', 'exports'); fs.mkdirSync(root, { recursive: true });
      const id = `export-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; const out = path.join(root, id); fs.mkdirSync(out);
      fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, kind: 'projectArchive', projectId, product: project.product, importedAt: project.latestImport.importedAt, exportedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
      const relativePath = path.relative(store.resolveProjectPath(projectId), out).split(path.sep).join('/');
      return store.updateProject(projectId, (current) => ({ ...current, artifacts: [...current.artifacts, { id, kind: 'projectArchive', relativePath, createdAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out, 'manifest.json'))).digest('hex') }], activeStep: 'export', steps: { ...current.steps, export: { status: 'completed' } } }));
    },
  };
}
module.exports = { normalizeProductInput, createProductController };
