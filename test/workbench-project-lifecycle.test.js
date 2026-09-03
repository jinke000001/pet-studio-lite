const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const { createProjectLifecycle } = require('../src/workbench/project-lifecycle');

function makeWorld() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-lifecycle-'));
  const store = createProjectStore({ workspaceRoot });
  const projectA = store.createProject({ name: '项目甲' });
  const projectB = store.createProject({ name: '项目乙' });
  const jobs = { cancelled: [], cancelProject(projectId) { this.cancelled.push(projectId); } };
  const preview = {
    runningProjectId: null,
    stopCalls: 0,
    status() {
      return this.runningProjectId
        ? { status: 'running', projectId: this.runningProjectId }
        : { status: 'stopped' };
    },
    async stop() {
      this.stopCalls += 1;
      this.runningProjectId = null;
      return { status: 'stopped' };
    },
  };
  const lifecycle = createProjectLifecycle({ store, jobs, previewController: preview });
  return { store, projectA, projectB, jobs, preview, lifecycle };
}

test('重新打开当前项目不会停止预览、不会取消任务（历史成功任务刷新场景）', async () => {
  const { projectA, jobs, preview, lifecycle } = makeWorld();
  lifecycle.activateProject(projectA.id);
  preview.runningProjectId = projectA.id;

  const reopened = await lifecycle.openProject(projectA.id);

  assert.equal(reopened.id, projectA.id);
  assert.equal(preview.stopCalls, 0);
  assert.deepEqual(jobs.cancelled, []);
  assert.equal(preview.status().status, 'running');
  assert.equal(lifecycle.getActiveProjectId(), projectA.id);
});

test('预览未运行时重新打开当前项目同样不产生停止调用', async () => {
  const { projectA, jobs, preview, lifecycle } = makeWorld();
  lifecycle.activateProject(projectA.id);

  await lifecycle.openProject(projectA.id);

  assert.equal(preview.stopCalls, 0);
  assert.deepEqual(jobs.cancelled, []);
});

test('切换到另一个项目仍停止旧预览并取消旧项目任务', async () => {
  const { projectA, projectB, jobs, preview, lifecycle } = makeWorld();
  lifecycle.activateProject(projectA.id);
  preview.runningProjectId = projectA.id;

  const opened = await lifecycle.openProject(projectB.id);

  assert.equal(opened.id, projectB.id);
  assert.deepEqual(jobs.cancelled, [projectA.id]);
  assert.equal(preview.stopCalls, 1);
  assert.equal(preview.status().status, 'stopped');
  assert.equal(lifecycle.getActiveProjectId(), projectB.id);
});

test('打开的项目与正在运行的预览不属于同一项目时必须停止该预览', async () => {
  const { projectA, projectB, preview, lifecycle } = makeWorld();
  lifecycle.activateProject(projectA.id);
  preview.runningProjectId = projectB.id;

  await lifecycle.openProject(projectA.id);

  assert.equal(preview.stopCalls, 1);
  assert.equal(preview.status().status, 'stopped');
});

test('启动恢复激活的项目再次打开不会误停预览', async () => {
  const { projectA, jobs, preview, lifecycle } = makeWorld();
  // 模拟 workbench:get-bootstrap 的恢复：activeProjectId 来自最近项目记录。
  lifecycle.activateProject(projectA.id);
  preview.runningProjectId = projectA.id;

  await lifecycle.openProject(projectA.id);
  await lifecycle.openProject(projectA.id);

  assert.equal(preview.stopCalls, 0);
  assert.deepEqual(jobs.cancelled, []);
  assert.equal(preview.status().status, 'running');
});

test('尚未激活任何项目时，打开项目仍停止属于其它项目的残留预览', async () => {
  const { projectA, preview, lifecycle } = makeWorld();
  preview.runningProjectId = 'preview-orphan';

  await lifecycle.openProject(projectA.id);

  assert.equal(preview.stopCalls, 1);
  assert.equal(lifecycle.getActiveProjectId(), projectA.id);
});

test('重新打开当前项目返回磁盘上的最新项目数据', async () => {
  const { store, projectA, lifecycle } = makeWorld();
  lifecycle.activateProject(projectA.id);
  await lifecycle.openProject(projectA.id);

  store.updateProject(projectA.id, (current) => ({
    ...current,
    artifacts: [...current.artifacts, {
      id: 'artifact-new', kind: 'projectArchive',
      relativePath: 'workspace/exports/artifact-new', createdAt: '2026-09-03T01:00:00.000Z',
    }],
  }));
  const reopened = await lifecycle.openProject(projectA.id);

  assert.equal(reopened.artifacts.length, 1);
  assert.equal(reopened.artifacts[0].id, 'artifact-new');
});
