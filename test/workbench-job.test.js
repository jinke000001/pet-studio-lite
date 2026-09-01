const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjectStore } = require('../src/workbench/project-store');
const { createJobController } = require('../src/workbench/job-controller');

function harness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-job-'));
  const store = createProjectStore({ workspaceRoot: root, now: () => new Date('2026-09-01T00:00:00.000Z'), randomHex: () => 'abc123' });
  const project = store.createProject({ name: 'jobs' });
  return { store, project };
}

test('persists queued/running/succeeded job lifecycle', async () => {
  const { store, project } = harness();
  const jobs = createJobController({ store, handlers: { export: async (_id, _input, context) => { context.report(50, '半程'); return { artifact: 'ok' }; } } });
  const job = jobs.enqueue(project.id, 'export');
  assert.equal(job.status, 'queued');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const saved = store.loadProject(project.id).jobs[0];
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.progress, 100); assert.equal(saved.result.artifact, 'ok');
});

test('cancels a queued job and retries failed jobs as a new attempt', async () => {
  const { store, project } = harness();
  const jobs = createJobController({ store, handlers: { export: async () => { throw Object.assign(new Error('no'), { code: 'FAIL' }); } } });
  const job = jobs.enqueue(project.id, 'export');
  const cancelled = jobs.cancel(project.id, job.id);
  assert.equal(cancelled.status, 'cancelled');
  const retry = jobs.retry(project.id, job.id); assert.notEqual(retry.id, job.id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(store.loadProject(project.id).jobs.at(-1).status, 'failed');
});

test('cancelling a running build invokes its registered process cleanup', async () => {
  const { store, project } = harness();
  let cancelProcess;
  let processCancelled = false;
  const started = new Promise((resolve) => {
    cancelProcess = resolve;
  });
  const jobs = createJobController({
    store,
    handlers: {
      build: async (_id, _input, context) => {
        context.setCancel(() => {
          processCancelled = true;
          cancelProcess();
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    },
  });
  const job = jobs.enqueue(project.id, 'build');
  await new Promise((resolve) => setImmediate(resolve));
  jobs.cancel(project.id, job.id);
  await started;
  assert.equal(processCancelled, true);
  assert.equal(store.loadProject(project.id).jobs[0].status, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(store.loadProject(project.id).jobs[0].status, 'cancelled');
});

test('rejects duplicate active work in one project and cancels all work on shutdown', async () => {
  const { store, project } = harness();
  let release;
  const jobs = createJobController({ store, handlers: { build: async () => new Promise((resolve) => { release = resolve; }) } });
  const first = jobs.enqueue(project.id, 'build');
  assert.throws(() => jobs.enqueue(project.id, 'export'), (error) => error.code === 'PROJECT_JOB_ACTIVE');
  await new Promise((resolve) => setImmediate(resolve));
  jobs.shutdown();
  assert.equal(store.loadProject(project.id).jobs.find((job) => job.id === first.id).status, 'cancelled');
  release?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.loadProject(project.id).jobs.find((job) => job.id === first.id).status, 'cancelled');
});

test('polling active jobs does not mark them interrupted', async () => {
  const { store, project } = harness();
  let release;
  const jobs = createJobController({ store, handlers: { export: () => new Promise((resolve) => { release = resolve; }) } });
  jobs.enqueue(project.id, 'export');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(jobs.list(project.id)[0].status, 'running');
  assert.equal(jobs.list(project.id)[0].status, 'running');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(jobs.list(project.id)[0].status, 'succeeded');
});
