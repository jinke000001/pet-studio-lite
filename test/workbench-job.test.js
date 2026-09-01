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
