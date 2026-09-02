const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const { createProductController } = require('../src/workbench/product-controller');
const { createCandidateController, runBuilder } = require('../src/workbench/candidate-controller');

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
  const applicationRoot = path.resolve(__dirname, '..');
  return createCandidateController({
    store: harnessValue.store,
    applicationRoot,
    builderRoot: applicationRoot,
    buildAssetsRoot: applicationRoot,
    now: () => new Date('2026-09-01T01:02:03.000Z'),
    randomHex: () => `00000${sequence += 1}`,
    spawnBuilder: async (_command, options) => {
      assert.equal(options.spawnOptions.env.ELECTRON_RUN_AS_NODE, '1');
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
  assert.deepEqual(config.files.filter((entry) => typeof entry === 'object' && entry.to === 'package.json').map((entry) => entry.from), [path.resolve(__dirname, '..', 'package.json')]);
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

function spawnBuilderRecording(calls, result = { code: 0, stdout: 'ok', stderr: '' }) {
  return async (command, options) => {
    calls.push({ command, options });
    const configPath = options.args[options.args.indexOf('--config') + 1];
    const config = JSON.parse(fs.readFileSync(configPath));
    const artifacts = path.join(config.directories.output);
    fs.mkdirSync(path.join(artifacts, 'Sample Pet.app', 'Contents', 'Resources'), { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'Sample Pet.app', 'Contents', 'Resources', 'app.asar'), 'asar');
    return result;
  };
}

test('spawns the builder through the controlled launcher with a normalized argument protocol', async () => {
  const value = harness();
  const applicationRoot = path.resolve(__dirname, '..');
  const calls = [];
  const controller = controllerFor(value, { spawnBuilder: spawnBuilderRecording(calls) });
  await controller.build(value.project.id, { targets: ['mac', 'win'] }, context);
  assert.equal(calls.length, 1);
  const { command, options } = calls[0];
  assert.equal(command, process.execPath);
  const [launcher, cli, ...builderArgs] = options.args;
  assert.equal(launcher, path.join(applicationRoot, 'src', 'workbench', 'builder-launcher.js'));
  assert.equal(cli, path.join(applicationRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'));
  assert.equal(builderArgs.length, 6);
  assert.deepEqual(builderArgs.slice(0, 2), ['--publish', 'never']);
  assert.equal(builderArgs[2], '--config');
  const configPath = builderArgs[3];
  assert.equal(path.isAbsolute(configPath), true);
  assert.equal(path.basename(configPath), 'build-config.json');
  assert.ok(configPath.startsWith(value.store.resolveProjectPath(value.project.id, 'workspace', 'exports')));
  assert.deepEqual(builderArgs.slice(4), ['--mac', '--win']);
  assert.equal(options.spawnOptions.cwd, applicationRoot);
  assert.deepEqual(options.spawnOptions.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(options.spawnOptions.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(options.spawnOptions.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(options.spawnOptions.env.ELECTRON_BUILDER_PUBLISH, 'never');
  assert.equal(options.spawnOptions.env.DESKTOP_PET_BUILDER_ROOT, applicationRoot);
});

test('uses the packaged builderRoot, buildAssetsRoot and launcher location for in-app builds', async () => {
  const value = harness();
  const resources = path.join(value.root, 'packaged', 'Contents', 'Resources');
  const applicationRoot = path.join(resources, 'app.asar');
  const builderRoot = path.join(resources, 'workbench-builder');
  const buildAssetsRoot = path.join(resources, 'workbench-build-assets');
  // The packaged workbench-builder runtime always carries electron-builder's
  // package.json; the manifest step reads the builder version from it.
  fs.mkdirSync(path.join(builderRoot, 'node_modules', 'electron-builder'), { recursive: true });
  fs.writeFileSync(path.join(builderRoot, 'node_modules', 'electron-builder', 'package.json'), JSON.stringify({ name: 'electron-builder', version: '26.15.3' }));
  const calls = [];
  const controller = createCandidateController({
    store: value.store,
    applicationRoot,
    builderRoot,
    buildAssetsRoot,
    now: () => new Date('2026-09-01T01:02:03.000Z'),
    randomHex: () => '00abcd',
    spawnBuilder: spawnBuilderRecording(calls),
    discoverArtifacts: () => [],
    inspectAsar: () => ({ embeddedSelector: 'workbench-project', asar: { sha256: 'asar' }, atlas: { sha256: 'atlas' } }),
    createManifest: ({ targets, profile, runDirectory }) => ({ generatedAt: '2026-09-01T01:02:03.000Z', targets, product: profile, acceptance: {}, runDirectory }),
  });
  await controller.build(value.project.id, { targets: ['win'] }, context);
  assert.equal(calls.length, 1);
  const { options } = calls[0];
  const [launcher, cli, ...builderArgs] = options.args;
  assert.equal(launcher, path.join(applicationRoot, 'src', 'workbench', 'builder-launcher.js'));
  assert.equal(cli, path.join(builderRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'));
  assert.deepEqual(builderArgs.slice(4), ['--win']);
  assert.equal(options.spawnOptions.cwd, buildAssetsRoot);
  assert.equal(options.spawnOptions.env.DESKTOP_PET_BUILDER_ROOT, builderRoot);
  const config = JSON.parse(fs.readFileSync(builderArgs[3]));
  assert.deepEqual(config.files.filter((entry) => typeof entry === 'object' && entry.to === 'package.json').map((entry) => entry.from), [path.join(buildAssetsRoot, 'package.json')]);
});

test('preserves builder log and failure evidence when the builder exits non-zero', async () => {
  const value = harness();
  const controller = controllerFor(value, {
    spawnBuilder: async () => ({ code: 9, signal: null, stdout: 'builder-out\n', stderr: 'builder-err\n' }),
  });
  await assert.rejects(controller.build(value.project.id, { targets: ['mac'] }, context), (error) => error.code === 'BUILD_FAILED');
  const exportsRoot = value.store.resolveProjectPath(value.project.id, 'workspace', 'exports');
  const runDirectory = path.join(exportsRoot, fs.readdirSync(exportsRoot)[0]);
  assert.equal(fs.readFileSync(path.join(runDirectory, 'builder.log'), 'utf8'), 'builder-out\nbuilder-err\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runDirectory, 'build-failure.json'), 'utf8')), { status: 9, signal: null });
});

test('runBuilder captures builder stdout and stderr', async () => {
  const result = await runBuilder(process.execPath, {
    args: ['-e', 'process.stdout.write("builder-out");process.stderr.write("builder-err")'],
    spawnOptions: { stdio: ['ignore', 'pipe', 'pipe'] },
  }, { setCancel() {} });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'builder-out');
  assert.equal(result.stderr, 'builder-err');
});

test('runBuilder terminates the real builder child with SIGTERM on cancel', async () => {
  let cancel;
  const promise = runBuilder(process.execPath, {
    args: ['-e', 'setTimeout(() => {}, 60000)'],
    spawnOptions: { stdio: ['ignore', 'pipe', 'pipe'] },
  }, { setCancel: (cancelCallback) => { cancel = cancelCallback; } });
  await new Promise((resolve) => setTimeout(resolve, 200));
  cancel();
  const result = await promise;
  assert.equal(result.code, null);
  assert.equal(result.signal, 'SIGTERM');
});
