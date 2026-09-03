const test = require('node:test');
const assert = require('node:assert/strict');

// 被测模块是 renderer 使用的纯 ESM 判定模块，Node 通过语法检测按 ESM 加载。
async function loadTrackerFactory() {
  const module = await import('../src/workbench/renderer/job-refresh.js');
  return module.createJobCompletionTracker;
}

function job(id, status) {
  return { id, type: 'export', status, progress: status === 'succeeded' ? 100 : 0 };
}

test('首次轮询只建立基线：多个历史成功任务不触发项目重载', async () => {
  const createJobCompletionTracker = await loadTrackerFactory();
  const tracker = createJobCompletionTracker();
  const historical = [
    job('job-h1', 'succeeded'),
    job('job-h2', 'succeeded'),
    job('job-h3', 'succeeded'),
    job('job-h4', 'succeeded'),
    job('job-h5', 'succeeded'),
  ];

  assert.equal(tracker.observe(historical), null);
  // 后续轮询中同样的历史任务也不允许再次触发。
  assert.equal(tracker.observe(historical), null);
  assert.equal(tracker.observe(historical), null);
});

test('观察到任务从运行中迁移为成功时返回该任务', async () => {
  const createJobCompletionTracker = await loadTrackerFactory();
  const tracker = createJobCompletionTracker();

  assert.equal(tracker.observe([job('job-1', 'queued')]), null);
  assert.equal(tracker.observe([job('job-1', 'running')]), null);
  const completed = tracker.observe([job('job-1', 'succeeded')]);
  assert.equal(completed?.id, 'job-1');
  // 同一个成功状态只允许触发一次。
  assert.equal(tracker.observe([job('job-1', 'succeeded')]), null);
});

test('轮询间隔内出现即完成的新任务也会触发一次刷新', async () => {
  const createJobCompletionTracker = await loadTrackerFactory();
  const tracker = createJobCompletionTracker();

  assert.equal(tracker.observe([job('job-old', 'succeeded')]), null);
  const completed = tracker.observe([job('job-old', 'succeeded'), job('job-new', 'succeeded')]);
  assert.equal(completed?.id, 'job-new');
});

test('失败、取消与中断的任务不触发刷新', async () => {
  const createJobCompletionTracker = await loadTrackerFactory();
  const tracker = createJobCompletionTracker();

  assert.equal(tracker.observe([job('job-1', 'running')]), null);
  assert.equal(tracker.observe([job('job-1', 'failed')]), null);
  assert.equal(tracker.observe([job('job-2', 'running')]), null);
  assert.equal(tracker.observe([job('job-2', 'cancelled')]), null);
  assert.equal(tracker.observe([job('job-3', 'interrupted')]), null);
});

test('每个 tracker 独立建基线：切换项目后历史成功任务不再触发', async () => {
  const createJobCompletionTracker = await loadTrackerFactory();
  const trackerA = createJobCompletionTracker();
  const trackerB = createJobCompletionTracker();

  assert.equal(trackerA.observe([job('job-a1', 'succeeded')]), null);
  assert.equal(trackerB.observe([job('job-b1', 'succeeded'), job('job-b2', 'succeeded')]), null);
  const completed = trackerB.observe([job('job-b1', 'succeeded'), job('job-b2', 'succeeded'), job('job-b3', 'succeeded')]);
  assert.equal(completed?.id, 'job-b3');
});
