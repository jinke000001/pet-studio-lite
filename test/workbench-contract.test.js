const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ARTIFACT_KINDS,
  JOB_STATUSES,
  STEP_IDS,
  createWorkbenchProject,
  normalizeCreateProjectInput,
  validateProjectId,
  validateWorkbenchProject,
} = require('../src/workbench/contracts');

test('creates a versioned project contract with the project step active', () => {
  const project = createWorkbenchProject({
    id: 'studio-20260901-090000-abc123',
    name: '  小福猩 新版本  ',
    now: '2026-09-01T09:00:00.000Z',
  });

  assert.equal(project.schemaVersion, 1);
  assert.equal(project.id, 'studio-20260901-090000-abc123');
  assert.equal(project.name, '小福猩 新版本');
  assert.equal(project.activeStep, 'project');
  assert.deepEqual(Object.keys(project.steps), STEP_IDS);
  assert.equal(project.steps.project.status, 'active');
  assert.deepEqual(
    new Set(STEP_IDS.slice(1).map((stepId) => project.steps[stepId].status)),
    new Set(['pending']),
  );
  assert.deepEqual(project.jobs, []);
  assert.deepEqual(project.artifacts, []);
});

test('validates create-project input at the boundary', () => {
  assert.deepEqual(normalizeCreateProjectInput({ name: '  Demo  ' }), { name: 'Demo' });
  assert.throws(() => normalizeCreateProjectInput({ name: '' }), (error) => error.code === 'INVALID_PROJECT_NAME');
  assert.throws(() => normalizeCreateProjectInput({ name: 'x'.repeat(81) }), (error) => error.code === 'INVALID_PROJECT_NAME');
  assert.throws(() => normalizeCreateProjectInput({ name: 'Demo', path: '/tmp' }), (error) => error.code === 'INVALID_PROJECT_INPUT');
});

test('rejects project ids that could escape the workspace', () => {
  assert.equal(validateProjectId('studio-20260901-090000-abc123'), 'studio-20260901-090000-abc123');
  for (const unsafe of ['../outside', '/tmp/project', 'studio\\outside', '.', '']) {
    assert.throws(() => validateProjectId(unsafe), (error) => error.code === 'INVALID_PROJECT_ID');
  }
});

test('rejects persisted projects with unknown job or artifact variants', () => {
  const project = createWorkbenchProject({
    id: 'studio-20260901-090000-abc123',
    name: 'Demo',
    now: '2026-09-01T09:00:00.000Z',
  });

  assert.ok(JOB_STATUSES.includes('interrupted'));
  assert.ok(ARTIFACT_KINDS.includes('windowsCandidate'));
  assert.throws(
    () => validateWorkbenchProject({ ...project, jobs: [{ id: 'job-1', type: 'import', status: 'mystery' }] }),
    (error) => error.code === 'INVALID_PROJECT_FILE',
  );
  assert.throws(
    () => validateWorkbenchProject({ ...project, artifacts: [{ id: 'artifact-1', kind: 'installer' }] }),
    (error) => error.code === 'INVALID_PROJECT_FILE',
  );
});
