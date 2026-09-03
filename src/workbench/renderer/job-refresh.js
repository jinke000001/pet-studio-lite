// 任务轮询的项目刷新判定。
// 首次观察只建立状态基线：历史成功任务不会触发项目重载，因此打开含有
// 历史成功任务的项目后，轮询不会逐个发起有副作用的项目打开操作。
// 只有在本观察周期内迁移到 succeeded 的任务（包括两次轮询之间出现即
// 完成的新任务）才会返回给调用方，用于刷新项目数据。
export function createJobCompletionTracker() {
  let knownStatuses = null;
  return {
    observe(jobs) {
      const currentStatuses = new Map(jobs.map((job) => [job.id, job.status]));
      if (knownStatuses === null) {
        knownStatuses = currentStatuses;
        return null;
      }
      const completed = jobs.find(
        (job) => job.status === 'succeeded' && knownStatuses.get(job.id) !== 'succeeded',
      ) ?? null;
      knownStatuses = currentStatuses;
      return completed;
    },
  };
}
