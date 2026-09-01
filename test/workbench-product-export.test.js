const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const { createProductController, normalizeProductInput } = require('../src/workbench/product-controller');

function harness(authorizationStatus = 'authorized') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-product-'));
  const store = createProjectStore({ workspaceRoot: root, now: () => new Date('2026-09-01T00:00:00.000Z'), randomHex: () => 'abc123' });
  const project = store.createProject({ name: 'product' });
  const packageDirectory = store.resolveProjectPath(project.id, 'workspace', 'normalized');
  fs.mkdirSync(packageDirectory);
  fs.writeFileSync(path.join(packageDirectory, 'pet.json'), JSON.stringify({ id: 'sample', displayName: 'Sample', spritesheetPath: 'spritesheet.webp' }));
  fs.writeFileSync(path.join(packageDirectory, 'spritesheet.webp'), 'atlas-bytes');
  store.updateProject(project.id, (current) => ({
    ...current,
    latestImport: {
      id: 'import-123456789abc', sourceType: 'directory', sourceLabel: 'sample', sourceIdentity: 'directory-123456789abc', authorizationStatus,
      importedAt: '2026-09-01T00:00:00.000Z', artifactId: 'normalized',
      pet: { id: 'sample', displayName: 'Sample', spriteVersionNumber: 1, hasAlpha: true, grid: {}, actions: [] },
      validation: { level: authorizationStatus === 'authorized' ? 'passed' : 'warning', messages: [] },
    },
    artifacts: [{ id: 'normalized', kind: 'standardPackage', relativePath: 'workspace/normalized' }],
  }));
  return { root, store, project: store.loadProject(project.id), controller: createProductController({ store }) };
}

test('exports a self-contained standard package with per-file hashes without overwriting history', () => {
  const { store, project, controller } = harness();
  const first = controller.exportStandardPackage(project.id);
  const second = controller.exportStandardPackage(project.id);
  const exports = second.artifacts.filter((artifact) => artifact.kind === 'standardPackage' && artifact.id.startsWith('standard-'));
  assert.equal(exports.length, 2);
  assert.notEqual(exports[0].relativePath, exports[1].relativePath);
  const directory = store.resolveProjectPath(project.id, ...exports[0].relativePath.split('/'));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'export-manifest.json')));
  assert.deepEqual(manifest.files.map((file) => file.name), ['pet.json', 'spritesheet.webp']);
  for (const file of manifest.files) {
    const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file.name))).digest('hex');
    assert.equal(file.sha256, expected);
  }
  assert.equal(fs.existsSync(path.join(directory, 'pet.json')), true);
  assert.equal(first.artifacts.length + 1, second.artifacts.length);
});

test('exports a recoverable project archive containing project state and normalized pet package', () => {
  const { store, project, controller } = harness();
  controller.save(project.id, { productName: 'Sample Pet', version: '1.2.3', productId: 'sample-pet', appId: 'com.jinke.sample-pet', executableName: 'SamplePet', artifactName: 'sample-pet', targets: ['mac'] });
  const updated = controller.exportProject(project.id);
  const artifact = updated.artifacts.find((candidate) => candidate.kind === 'projectArchive');
  const directory = store.resolveProjectPath(project.id, ...artifact.relativePath.split('/'));
  assert.equal(fs.existsSync(path.join(directory, 'project.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'standard-package', 'pet.json')), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  assert.deepEqual(manifest.contents, ['project.json', 'standard-package/pet.json']);
});

test('rejects empty, duplicate, or unsupported product build targets', () => {
  const input = { productName: 'Sample Pet', version: '1.2.3', productId: 'sample-pet', appId: 'com.jinke.sample-pet', executableName: 'SamplePet', artifactName: 'sample-pet' };
  for (const targets of [[], ['linux'], ['mac', 'mac']]) {
    assert.throws(() => normalizeProductInput({ ...input, targets }), (error) => error.code === 'INVALID_PRODUCT_INPUT');
  }
  assert.deepEqual(normalizeProductInput({ ...input, targets: ['win', 'mac'] }).targets, ['win', 'mac']);
});
