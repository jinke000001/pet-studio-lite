// 活动项目生命周期：集中跟踪 activeProjectId，并统一“打开项目”时的
// 旧项目任务取消与预览停止行为。
// 重新打开当前项目只是只读重载：只有真正切换到另一个项目时才取消旧项目
// 任务；预览只在它属于其它项目时才被停止，任务完成后的数据刷新因此不会
// 隐式停止当前项目的真实桌宠预览。
function createProjectLifecycle({ store, jobs, previewController }) {
  let activeProjectId;

  async function openProject(projectId) {
    if (activeProjectId && activeProjectId !== projectId) jobs.cancelProject(activeProjectId);
    const preview = previewController.status();
    if (preview.status === 'running' && preview.projectId !== projectId) await previewController.stop();
    const activeProject = store.openProject(projectId);
    activeProjectId = activeProject.id;
    return activeProject;
  }

  function activateProject(projectId) {
    activeProjectId = projectId;
  }

  function getActiveProjectId() {
    return activeProjectId;
  }

  return { openProject, activateProject, getActiveProjectId };
}

module.exports = { createProjectLifecycle };
