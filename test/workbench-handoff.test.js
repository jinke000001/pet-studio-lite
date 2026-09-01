const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateWorkbenchProject } = require('../src/workbench/contracts');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('Kimi handoff mock data follows the workbench project contract', () => {
  const mockPath = path.join(PROJECT_ROOT, 'Resources', 'phase-6-workbench-mock-data.json');
  const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));

  assert.equal(mock.schemaVersion, 1);
  assert.deepEqual(mock.scenarios.empty.projects, []);
  assert.equal(mock.scenarios.empty.activeProject, null);
  assert.equal(mock.scenarios.active.projects.length, 2);
  validateWorkbenchProject(mock.scenarios.active.activeProject);
  mock.scenarios.active.projects.forEach(validateWorkbenchProject);
  assert.ok(mock.errors.some((error) => error.code === 'INVALID_PROJECT_NAME'));
  assert.ok(mock.errors.some((error) => error.code === 'INVALID_PROJECT_FILE'));
});

test('Kimi handoff fixes the page, field, state, and ownership boundaries', () => {
  const handoff = fs.readFileSync(
    path.join(PROJECT_ROOT, 'Resources', 'kimi-phase-6-workbench-handoff.md'),
    'utf8',
  );

  for (const heading of ['页面清单', '字段规则', '状态矩阵', '错误示例', '职责边界']) {
    assert.match(handoff, new RegExp(`## ${heading}`));
  }
  assert.match(handoff, /Kimi 不修改/);
  assert.match(handoff, /src\/workbench\/renderer/);
  assert.match(handoff, /prefers-reduced-motion/);
});
