const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const { createPreviewController, resolvePreviewSpawnCwd } = require('../src/workbench/preview-controller');

function makeStore() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-preview-'));
  const store = createProjectStore({
    workspaceRoot,
    now: () => new Date('2026-09-01T09:00:00.000Z'),
    randomHex: () => 'abc123',
  });
  const project = store.createProject({ name: 'Preview' });
  const packageDirectory = store.resolveProjectPath(project.id, 'workspace', 'imports', 'sample', 'package');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, 'pet.json'), JSON.stringify({
    id: 'sample', displayName: 'Sample', spritesheetPath: 'spritesheet.webp',
  }));
  fs.writeFileSync(path.join(packageDirectory, 'spritesheet.webp'), 'atlas');
  store.updateProject(project.id, (current) => ({
    ...current,
    latestImport: {
      id: 'import-abc123abc123', sourceType: 'directory', sourceLabel: 'sample',
      sourceIdentity: 'sample-source', authorizationStatus: 'internal-test',
      importedAt: '2026-09-01T09:00:00.000Z', artifactId: 'package-abc123abc123',
      pet: { id: 'sample', displayName: 'Sample', spriteVersionNumber: 1, hasAlpha: true,
        grid: { columns: 8, rows: 9, cellWidth: 192, cellHeight: 208 }, lookDirections: false, actions: ['idle'] },
      validation: { level: 'warning', messages: ['internal'] },
    },
    artifacts: [{
      id: 'package-abc123abc123', kind: 'standardPackage',
      relativePath: 'workspace/imports/sample/package', createdAt: '2026-09-01T09:00:00.000Z',
    }],
  }));
  return { store, project };
}

test('starts only one isolated preview and stops the previous child before replacement', async () => {
  const { store, project } = makeStore();
  const children = [];
  const spawn = (_command, args, options) => {
    const child = new EventEmitter();
    child.pid = 4000 + children.length;
    child.exitCode = null;
    child.kill = () => { child.exitCode = 0; child.emit('exit', 0, null); return true; };
    child.options = options;
    child.args = args;
    children.push(child);
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  const controller = createPreviewController({
    store,
    electronPath: '/electron',
    applicationRoot: path.resolve(os.tmpdir(), 'application'),
    spawn,
    parentPid: 999,
  });

  const first = await controller.start(project.id);
  assert.equal(first.status, 'running');
  assert.equal(children.length, 1);
  assert.equal(children[0].options.env.DESKTOP_PET_PREVIEW_PARENT_PID, '999');
  assert.equal(children[0].options.env.PET_PRODUCT, undefined);
  assert.deepEqual(children[0].args, [path.join(path.resolve(os.tmpdir(), 'application'), 'src', 'main.js')]);
  await controller.start(project.id);
  assert.equal(children[0].exitCode, 0);
  assert.equal(children.length, 2);
  assert.deepEqual(await controller.stop(), { status: 'stopped' });
  assert.equal(children[1].exitCode, 0);
});

test('resolves a real app.asar directory fixture to its physical parent (electron asar patch shape)', () => {
  // Inside a packaged app, Electron's asar patch makes statSync(app.asar)
  // report a directory. A real directory named app.asar reproduces that shape.
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-resources-'));
  const asarRoot = path.join(resources, 'app.asar');
  fs.mkdirSync(asarRoot);
  assert.equal(fs.statSync(asarRoot).isDirectory(), true);
  assert.equal(resolvePreviewSpawnCwd(asarRoot), resources);
});

test('keeps an existing source directory as its own preview cwd', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-source-'));
  assert.equal(resolvePreviewSpawnCwd(sourceRoot), sourceRoot);
});

test('rejects a non-absolute preview application root', () => {
  assert.throws(() => resolvePreviewSpawnCwd(path.join('relative', 'app.asar')), (error) => error.code === 'PREVIEW_START_FAILED');
  assert.throws(() => resolvePreviewSpawnCwd(''), (error) => error.code === 'PREVIEW_START_FAILED');
});

test('spawns a packaged preview with the physical Resources directory as cwd and the asar runtime entry', async () => {
  const { store, project } = makeStore();
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-resources-'));
  const asarRoot = path.join(resources, 'app.asar');
  fs.mkdirSync(asarRoot);
  const children = [];
  const spawn = (_command, args, options) => {
    const child = new EventEmitter();
    child.pid = 7000;
    child.exitCode = null;
    child.kill = () => { child.exitCode = 0; child.emit('exit', 0, null); return true; };
    child.args = args;
    child.options = options;
    children.push(child);
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  const controller = createPreviewController({
    store,
    electronPath: '/electron',
    applicationRoot: asarRoot,
    spawn,
  });

  const started = await controller.start(project.id);
  assert.equal(started.status, 'running');
  assert.equal(children.length, 1);
  assert.equal(children[0].options.cwd, resources);
  assert.deepEqual(children[0].args, [path.join(asarRoot, 'src', 'main.js')]);
  assert.deepEqual(await controller.stop(), { status: 'stopped' });
});

test('uses a physical cwd when the runtime entry lives inside app.asar', () => {
  const applicationRoot = path.resolve(os.tmpdir(), 'application');
  const asarRoot = path.join(applicationRoot, 'resources', 'app.asar');
  assert.equal(resolvePreviewSpawnCwd(asarRoot), path.dirname(asarRoot));
  assert.equal(resolvePreviewSpawnCwd(applicationRoot), applicationRoot);
});

test('refuses preview when the project has no successful import', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-preview-'));
  const store = createProjectStore({ workspaceRoot });
  const project = store.createProject({ name: 'Empty' });
  const controller = createPreviewController({ store, electronPath: '/electron', applicationRoot: '/app' });
  await assert.rejects(controller.start(project.id), (error) => error.code === 'IMPORT_NOT_READY');
});
