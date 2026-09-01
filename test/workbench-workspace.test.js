const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjectStore } = require('../src/workbench/project-store');
const { createWorkspaceController } = require('../src/workbench/workspace-controller');

test('duplicates only recoverable project state and reveals artifacts without returning paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-copy-'));
  let tick = 0;
  const store = createProjectStore({ workspaceRoot: root, now: () => new Date(`2026-09-01T00:00:0${tick++}.000Z`), randomHex: () => 'abc123' });
  const source = store.createProject({ name: 'source' });
  const packageRoot = store.resolveProjectPath(source.id, 'workspace', 'package'); fs.mkdirSync(packageRoot);
  fs.writeFileSync(path.join(packageRoot, 'pet.json'), '{}'); fs.writeFileSync(path.join(packageRoot, 'spritesheet.webp'), 'atlas');
  store.updateProject(source.id, (project) => ({ ...project, latestImport: { id: 'import-123456789abc', sourceType: 'directory', sourceLabel: 'sample', sourceIdentity: 'directory-123456789abc', authorizationStatus: 'authorized', importedAt: '2026-09-01T00:00:00.000Z', artifactId: 'package-1', pet: { id: 'sample', displayName: 'Sample', spriteVersionNumber: 1, hasAlpha: true, grid: {}, actions: [] }, validation: { level: 'passed', messages: [] } }, product: { productName: 'Sample' }, jobs: [{ id: 'old-job', type: 'export', status: 'succeeded' }], artifacts: [{ id: 'package-1', kind: 'standardPackage', relativePath: 'workspace/package' }] }));
  let revealedPath;
  const controller = createWorkspaceController({ store, reveal: (value) => { revealedPath = value; } });
  const copied = controller.duplicate(source.id, 'copy');
  assert.equal(copied.name, 'copy'); assert.deepEqual(copied.jobs, []); assert.equal(copied.product.productName, 'Sample');
  assert.equal(fs.existsSync(store.resolveProjectPath(copied.id, ...copied.artifacts[0].relativePath.split('/'), 'pet.json')), true);
  const response = controller.revealArtifact(copied.id, copied.artifacts[0].id);
  assert.deepEqual(response, { artifactId: 'package-1', revealed: true });
  assert.equal(JSON.stringify(response).includes(root), false); assert.ok(revealedPath.startsWith(root));
});

test('refuses to duplicate a package modified to contain a symbolic link', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-copy-')); let tick = 0;
  const store = createProjectStore({ workspaceRoot: root, now: () => new Date(`2026-09-01T00:00:0${tick++}.000Z`), randomHex: () => 'abc123' });
  const source = store.createProject({ name: 'source' }); const packageRoot = store.resolveProjectPath(source.id, 'workspace', 'package'); fs.mkdirSync(packageRoot); fs.symlinkSync('/tmp', path.join(packageRoot, 'unsafe'));
  store.updateProject(source.id, (project) => ({ ...project, latestImport: { id: 'import-123456789abc', sourceType: 'directory', sourceLabel: 'sample', sourceIdentity: 'directory-123456789abc', authorizationStatus: 'authorized', importedAt: '2026-09-01T00:00:00.000Z', artifactId: 'package-1', pet: { id: 'sample', displayName: 'Sample', spriteVersionNumber: 1, hasAlpha: true, grid: {}, actions: [] }, validation: { level: 'passed', messages: [] } }, artifacts: [{ id: 'package-1', kind: 'standardPackage', relativePath: 'workspace/package' }] }));
  assert.throws(() => createWorkspaceController({ store }).duplicate(source.id), (error) => error.code === 'UNSAFE_PROJECT_PATH');
});
