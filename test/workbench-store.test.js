const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');

function makeStore(overrides = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-workbench-'));
  return {
    workspaceRoot,
    store: createProjectStore({
      workspaceRoot,
      now: () => new Date('2026-09-01T09:00:00.000Z'),
      randomHex: () => 'abc123',
      ...overrides,
    }),
  };
}

test('creates a versioned project workspace without overwriting it', () => {
  const { workspaceRoot, store } = makeStore();
  const project = store.createProject({ name: '  Demo Pet  ' });
  const projectDirectory = path.join(workspaceRoot, 'projects', project.id);

  assert.equal(project.id, 'studio-20260901-090000-abc123');
  assert.equal(project.name, 'Demo Pet');
  assert.deepEqual(store.loadProject(project.id), project);
  assert.deepEqual(store.loadMostRecentProject(), project);
  assert.deepEqual(fs.readdirSync(projectDirectory).sort(), ['artifacts', 'jobs', 'project.json', 'workspace']);
  assert.throws(() => store.createProject({ name: 'Same instant' }), (error) => error.code === 'PROJECT_EXISTS');
  assert.deepEqual(store.loadProject(project.id), project);
});

test('lists projects by most recent update and restores the explicit recent project', () => {
  let call = 0;
  const times = ['2026-09-01T09:00:00.000Z', '2026-09-01T10:00:00.000Z'];
  const ids = ['abc123', 'def456'];
  const { store } = makeStore({
    now: () => new Date(times[call]),
    randomHex: () => ids[call++],
  });
  const first = store.createProject({ name: 'First' });
  const second = store.createProject({ name: 'Second' });

  assert.deepEqual(store.listProjects().map((project) => project.id), [second.id, first.id]);
  assert.equal(store.loadMostRecentProject().id, second.id);
  store.openProject(first.id);
  assert.equal(store.loadMostRecentProject().id, first.id);
});

test('rejects path traversal and symbolic-link project directories', () => {
  const { workspaceRoot, store } = makeStore();
  assert.throws(() => store.loadProject('../outside'), (error) => error.code === 'INVALID_PROJECT_ID');

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-workbench-outside-'));
  const unsafeId = 'studio-20260901-090000-abc123';
  fs.mkdirSync(path.join(workspaceRoot, 'projects'), { recursive: true });
  fs.symlinkSync(outside, path.join(workspaceRoot, 'projects', unsafeId));
  assert.throws(() => store.loadProject(unsafeId), (error) => error.code === 'UNSAFE_PROJECT_PATH');
});

test('rejects a projects root that is a symbolic link', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-workbench-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-workbench-outside-'));
  fs.symlinkSync(outside, path.join(workspaceRoot, 'projects'));
  const store = createProjectStore({ workspaceRoot });

  assert.throws(() => store.createProject({ name: 'Unsafe root' }), (error) => error.code === 'UNSAFE_WORKSPACE_PATH');
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('does not treat a modified project file as recoverable state', () => {
  const { workspaceRoot, store } = makeStore();
  const project = store.createProject({ name: 'Tamper check' });
  fs.writeFileSync(
    path.join(workspaceRoot, 'projects', project.id, 'project.json'),
    JSON.stringify({ schemaVersion: 1, id: project.id }),
  );

  assert.throws(() => store.loadMostRecentProject(), (error) => error.code === 'INVALID_PROJECT_FILE');
});

test('updates projects atomically and resolves only project-owned paths', () => {
  const { workspaceRoot, store } = makeStore();
  const project = store.createProject({ name: 'Update demo' });
  const updated = store.updateProject(project.id, (current) => ({
    ...current,
    activeStep: 'import',
    steps: { ...current.steps, project: { status: 'completed' }, import: { status: 'active' } },
  }));

  assert.equal(updated.activeStep, 'import');
  assert.equal(store.loadProject(project.id).steps.project.status, 'completed');
  assert.equal(
    store.resolveProjectPath(project.id, 'workspace', 'imports'),
    path.join(workspaceRoot, 'projects', project.id, 'workspace', 'imports'),
  );
  assert.throws(
    () => store.resolveProjectPath(project.id, '..', 'outside'),
    (error) => error.code === 'UNSAFE_PROJECT_PATH',
  );
});
