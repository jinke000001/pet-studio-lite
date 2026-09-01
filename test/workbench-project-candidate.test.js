const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const { createProductController } = require('../src/workbench/product-controller');
const { createCandidateController } = require('../src/workbench/candidate-controller');

function harness(authorizationStatus = 'authorized') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-candidate-'));
  const store = createProjectStore({ workspaceRoot: root, now: () => new Date('2026-09-01T00:00:00.000Z'), randomHex: () => 'abc123' });
  const project = store.createProject({ name: 'candidate' });
  const packageDirectory = store.resolveProjectPath(project.id, 'workspace', 'normalized');
  fs.mkdirSync(packageDirectory);
  fs.writeFileSync(path.join(packageDirectory, 'pet.json'), JSON.stringify({ id: 'sample', displayName: 'Sample', spritesheetPath: 'spritesheet.webp' }));
  fs.writeFileSync(path.join(packageDirectory, 'spritesheet.webp'), 'atlas');
  store.updateProject(project.id, (current) => ({ ...current, latestImport: { id: 'import-123456789abc', sourceType: 'directory', sourceLabel: 'sample', sourceIdentity: 'directory-123456789abc', authorizationStatus, importedAt: '2026-09-01T00:00:00.000Z', artifactId: 'normalized', pet: { id: 'sample', displayName: 'Sample', spriteVersionNumber: 1, hasAlpha: true, grid: {}, actions: [] }, validation: { level: authorizationStatus === 'authorized' ? 'passed' : 'warning', messages: [] } }, artifacts: [{ id: 'normalized', kind: 'standardPackage', relativePath: 'workspace/normalized' }] }));
  createProductController({ store }).save(project.id, { productName: 'Sample Pet', version: '1.2.3', productId: 'sample-pet', appId: 'com.jinke.sample-pet', executableName: 'SamplePet', artifactName: 'sample-pet', targets: ['mac'] });
  return { root, store, project: store.loadProject(project.id) };
}

function controllerFor(harnessValue, overrides = {}) {
  let sequence = 0;
  return createCandidateController({
    store: harnessValue.store,
    applicationRoot: path.resolve(__dirname, '..'),
    now: () => new Date('2026-09-01T01:02:03.000Z'),
    randomHex: () => `00000${sequence += 1}`,
    spawnBuilder: async (_command, options) => {
      const configPath = options.args[options.args.indexOf('--config') + 1];
      const config = JSON.parse(fs.readFileSync(configPath));
      const artifacts = path.join(config.directories.output);
      fs.mkdirSync(path.join(artifacts, 'Sample Pet.app', 'Contents', 'Resources'), { recursive: true });
      fs.writeFileSync(path.join(artifacts, 'Sample Pet.app', 'Contents', 'Resources', 'app.asar'), 'asar');
      return { code: 0, stdout: 'ok', stderr: '' };
    },
    discoverArtifacts: (runDirectory) => [path.join(runDirectory, 'artifacts', 'Sample Pet.app', 'Contents', 'Resources', 'app.asar')],
    inspectAsar: () => ({ embeddedSelector: 'workbench-project', asar: { sha256: 'asar' }, atlas: { sha256: 'atlas' } }),
    createManifest: ({ targets, profile, runDirectory }) => ({ generatedAt: '2026-09-01T01:02:03.000Z', targets, product: profile, acceptance: { macOS: { packagedApp: 'candidate-built-not-yet-runtime-verified' }, windows: { installedMode: 'unverified' } }, runDirectory }),
    ...overrides,
  });
}

const context = { report() {}, isCancelled: () => false, setCancel() {} };

test('requires authorized source material before building a candidate', async () => {
  for (const status of ['unknown', 'internal-test']) {
    const value = harness(status);
    await assert.rejects(controllerFor(value).build(value.project.id, { targets: ['mac'] }, context), (error) => error.code === 'DISTRIBUTION_NOT_AUTHORIZED');
  }
});

test('builds from only the active normalized package and preserves versioned candidate history', async () => {
  const value = harness();
  const controller = controllerFor(value);
  await controller.build(value.project.id, { targets: ['mac'] }, context);
  await controller.build(value.project.id, { targets: ['mac'] }, context);
  const candidates = value.store.loadProject(value.project.id).artifacts.filter((artifact) => artifact.kind === 'macCandidate');
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].relativePath, candidates[1].relativePath);
  const config = JSON.parse(fs.readFileSync(value.store.resolveProjectPath(value.project.id, ...candidates[0].relativePath.split('/'), 'build-config.json')));
  assert.ok(config.files.includes('package.json'));
  assert.deepEqual(config.files.filter((entry) => typeof entry === 'object' && entry.to === 'config').map((entry) => entry.to), ['config']);
  assert.deepEqual(config.files.filter((entry) => typeof entry === 'object' && entry.to.startsWith('local-pets/')).map((entry) => entry.to), ['local-pets/imported']);
  assert.deepEqual(config.extraMetadata.desktopPetProduct, 'workbench-project');
});

test('rejects invalid or duplicate candidate targets before spawning', async () => {
  const value = harness();
  for (const targets of [['linux'], ['mac', 'mac']]) {
    await assert.rejects(controllerFor(value).build(value.project.id, { targets }, context), (error) => error.code === 'INVALID_BUILD_TARGET');
  }
});

test('cleans partial candidate payloads while preserving cancellation evidence', async () => {
  const value = harness();
  const cancelledContext = { report() {}, isCancelled: () => true, setCancel() {} };
  const controller = controllerFor(value, {
    spawnBuilder: async (_command, options) => {
      const configPath = options.args[options.args.indexOf('--config') + 1];
      const config = JSON.parse(fs.readFileSync(configPath));
      fs.mkdirSync(config.directories.output, { recursive: true });
      fs.writeFileSync(path.join(config.directories.output, 'partial.bin'), 'partial');
      return { code: null, signal: 'SIGTERM', stdout: '', stderr: '' };
    },
  });
  await assert.rejects(controller.build(value.project.id, { targets: ['mac'] }, cancelledContext), (error) => error.code === 'BUILD_CANCELLED');
  const exportsRoot = value.store.resolveProjectPath(value.project.id, 'workspace', 'exports');
  const runDirectory = path.join(exportsRoot, fs.readdirSync(exportsRoot)[0]);
  assert.equal(fs.existsSync(path.join(runDirectory, 'artifacts')), false);
  assert.equal(fs.existsSync(path.join(runDirectory, 'generated')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDirectory, 'build-cancelled.json'))).status, 'cancelled');
});
