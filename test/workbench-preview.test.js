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
    applicationRoot: '/application',
    spawn,
    parentPid: 999,
  });

  const first = await controller.start(project.id);
  assert.equal(first.status, 'running');
  assert.equal(children.length, 1);
  assert.equal(children[0].options.env.DESKTOP_PET_PREVIEW_PARENT_PID, '999');
  assert.equal(children[0].options.env.PET_PRODUCT, undefined);
  assert.deepEqual(children[0].args, ['/application/src/main.js']);
  await controller.start(project.id);
  assert.equal(children[0].exitCode, 0);
  assert.equal(children.length, 2);
  assert.deepEqual(await controller.stop(), { status: 'stopped' });
  assert.equal(children[1].exitCode, 0);
});

test('uses a physical cwd when the runtime entry lives inside app.asar', () => {
  assert.equal(resolvePreviewSpawnCwd('/application/resources/app.asar'), '/application/resources');
  assert.equal(resolvePreviewSpawnCwd('/application'), '/application');
});

test('refuses preview when the project has no successful import', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-preview-'));
  const store = createProjectStore({ workspaceRoot });
  const project = store.createProject({ name: 'Empty' });
  const controller = createPreviewController({ store, electronPath: '/electron', applicationRoot: '/app' });
  await assert.rejects(controller.start(project.id), (error) => error.code === 'IMPORT_NOT_READY');
});
