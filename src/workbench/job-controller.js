const crypto = require('node:crypto');

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

function jobId() { return `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; }

function createJobController({ store, handlers = {} }) {
  const active = new Map();

  function activeForProject(projectId) {
    return [...active.values()].some((state) => state.projectId === projectId && !state.cancelled);
  }

  function list(projectId) { return store.loadProject(projectId).jobs; }

  function update(projectId, id, patch) {
    return store.updateProject(projectId, (project) => ({
      ...project,
      jobs: project.jobs.map((job) => job.id === id ? { ...job, ...patch, updatedAt: new Date().toISOString() } : job),
    }));
  }

  function enqueue(projectId, type, input = {}) {
    if (activeForProject(projectId)) {
      const error = new Error('当前项目已有任务运行，请等待、取消或切换后再试。');
      error.code = 'PROJECT_JOB_ACTIVE';
      throw error;
    }
    const createdAt = new Date().toISOString();
    const job = { id: jobId(), type, status: 'queued', progress: 0, step: '排队中', input, createdAt, updatedAt: createdAt, attempts: 1 };
    store.updateProject(projectId, (project) => ({ ...project, jobs: [...project.jobs, job] }));
    const timer = setImmediate(async () => {
      const state = active.get(job.id);
      if (!state || state.cancelled) return;
      state.running = true;
      try {
        update(projectId, job.id, { status: 'running', progress: 10, step: '正在执行' });
        const result = await handlers[type]?.(projectId, input, {
          report: (progress, step) => update(projectId, job.id, { progress, step }),
          isCancelled: () => active.get(job.id)?.cancelled === true,
          setCancel: (cancel) => { if (typeof cancel === 'function' && active.has(job.id)) active.get(job.id).cancel = cancel; },
        });
        if (active.get(job.id)?.cancelled) {
          update(projectId, job.id, { status: 'cancelled', progress: 0, step: '已取消' });
        } else {
          update(projectId, job.id, { status: 'succeeded', progress: 100, step: '已完成', result });
        }
      } catch (error) {
        if (active.get(job.id)?.cancelled) {
          update(projectId, job.id, { status: 'cancelled', progress: 0, step: '已取消' });
        } else {
          update(projectId, job.id, { status: 'failed', progress: 0, step: '失败', error: { code: error.code || 'JOB_FAILED', message: error.message } });
        }
      } finally { active.delete(job.id); }
    });
    active.set(job.id, { projectId, timer, cancelled: false, running: false });
    return job;
  }

  function cancel(projectId, id) {
    const state = active.get(id);
    if (!state) return store.loadProject(projectId).jobs.find((job) => job.id === id) || null;
    state.cancelled = true;
    state.cancel?.();
    clearImmediate(state.timer);
    if (!state.running) active.delete(id);
    const project = update(projectId, id, { status: 'cancelled', progress: 0, step: '已取消' });
    return project.jobs.find((job) => job.id === id);
  }

  function retry(projectId, id) {
    const job = store.loadProject(projectId).jobs.find((candidate) => candidate.id === id);
    if (!job || !TERMINAL.has(job.status) || job.status === 'succeeded') throw new Error('只有失败、取消或中断任务可以重试。');
    return enqueue(projectId, job.type, job.input);
  }

  function cancelProject(projectId) {
    return [...active.entries()]
      .filter(([, state]) => state.projectId === projectId)
      .map(([id]) => cancel(projectId, id));
  }

  function shutdown() {
    for (const [id, state] of [...active.entries()]) cancel(state.projectId, id);
  }

  return { enqueue, list, cancel, cancelProject, retry, shutdown };
}

module.exports = { createJobController };
