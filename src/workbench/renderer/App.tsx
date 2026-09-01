import { FormEvent, useEffect, useRef, useState } from 'react';
import type { PetPreviewStatus, StepId, StepStatus, WorkbenchBootstrap, WorkbenchProject, WorkbenchResult } from './types';
import { ProjectWorkspace } from './ProjectWorkspace';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

const stepOrder: StepId[] = ['project', 'import', 'validate', 'preview', 'product', 'export'];

const stepLabels: Record<StepId, string> = {
  project: '项目',
  import: '导入素材',
  validate: '自动检查',
  preview: '预览',
  product: '产品信息',
  export: '导出',
};

const stepStatusLabels: Record<StepStatus, string> = {
  pending: '待开始',
  active: '当前',
  completed: '已完成',
  blocked: '被阻断',
};

function StepsRail({ project }: { project: WorkbenchProject }) {
  return (
    <ol className="step-list" aria-label="制作流程六步进度">
      {stepOrder.map((stepId, index) => {
        const status = project.steps[stepId]?.status ?? 'pending';
        const isCurrent = project.activeStep === stepId;
        return (
          <li key={stepId} className={isCurrent ? 'current' : status}>
            <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{stepLabels[stepId]}</h3>
              <p>{isCurrent ? '正在这一步工作' : status === 'blocked' ? '需要先解决前置问题' : status === 'completed' ? '本步已完成并保存' : '尚未开始'}</p>
            </div>
            <span className={`step-status ${status}`}>{stepStatusLabels[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function applyResult(result: WorkbenchResult<WorkbenchBootstrap>, setData: (value: WorkbenchBootstrap) => void) {
  if (result.ok) {
    setData(result.value);
    return '';
  }
  return result.error.message;
}

export function App() {
  const [data, setData] = useState<WorkbenchBootstrap>({ projects: [], activeProject: null });
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [previewStatus, setPreviewStatus] = useState<PetPreviewStatus>({ status: 'stopped' });
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    window.workbenchApi.getBootstrap()
      .then((result) => {
        if (result.ok && result.value.petPreview) setPreviewStatus(result.value.petPreview);
        setFatalError(applyResult(result, setData));
      })
      .catch(() => setFatalError('工作台启动失败，请关闭后重试。'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (isCreating) nameInput.current?.focus();
  }, [isCreating]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setActionError('');
    try {
      const result = await window.workbenchApi.createProject({ name });
      const message = applyResult(result, setData);
      setActionError(message);
      if (!message) {
        setName('');
        setIsCreating(false);
      }
    } catch {
      setActionError('项目创建失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  async function openProject(project: WorkbenchProject) {
    if (project.id === data.activeProject?.id) return;
    setIsLoading(true);
    setActionError('');
    try {
      setActionError(applyResult(await window.workbenchApi.openProject(project.id), setData));
      setPreviewStatus({ status: 'stopped' });
      setIsCreating(false);
    } catch {
      setActionError('项目打开失败，请重试。');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="制作项目">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">宠</span>
          <div><strong>桌宠制作台</strong><small>Desktop Pet Studio</small></div>
        </div>
        <button className="new-project" type="button" onClick={() => setIsCreating(true)}>
          新建制作项目
        </button>
        <nav aria-label="历史项目">
          <p className="section-label">最近项目</p>
          {data.projects.length === 0 ? <p className="sidebar-empty">还没有保存的项目</p> : (
            <ul className="project-list">
              {data.projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={project.id === data.activeProject?.id ? 'project-link active' : 'project-link'}
                    onClick={() => openProject(project)}
                  >
                    <span>{project.name}</span><small>{formatTime(project.updatedAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <div className="phase-note"><span>Phase 6.5</span><p>内部候选工作台；视觉与状态收口</p></div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">内部制作工具 · 未签名候选流程</p>
            <h1>{isCreating ? '开始一个桌宠制作项目' : data.activeProject?.name ?? '开始一个桌宠制作项目'}</h1>
          </div>
          {data.activeProject && <span className="saved-state">已安全保存 · {formatTime(data.activeProject.updatedAt)}</span>}
        </header>

        {isOffline && (
          <div className="offline-banner" role="status">
            当前无网络连接。本地项目与已导入的宠物仍可正常使用；Petdex slug 导入请稍后重试。
          </div>
        )}

        <div className="live-region" aria-live="polite">{isLoading ? '正在读取项目…' : actionError}</div>
        {actionError && (
          <div className="action-error" role="alert">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError('')}>关闭提示</button>
          </div>
        )}

        {fatalError ? (
          <section className="message-panel" role="alert">
            <h2>暂时无法继续</h2><p>{fatalError}</p>
            <p>已保存的项目、导入素材和历史证据不会被覆盖或丢失。</p>
            <button type="button" onClick={() => window.location.reload()}>重新加载工作台</button>
          </section>
        ) : isLoading ? (
          <section className="loading-panel" aria-label="正在读取项目">
            <h2>正在读取项目</h2>
            <p>加载完成前不会显示空项目，请稍候。</p>
            <div className="skeleton-block" aria-hidden="true" />
            <div className="skeleton-block short" aria-hidden="true" />
            <div className="skeleton-block" aria-hidden="true" />
          </section>
        ) : data.activeProject && !isCreating ? (
          <>
            <StepsRail project={data.activeProject} />
            <ProjectWorkspace
              project={data.activeProject}
              previewStatus={previewStatus}
              onProjectChange={(project) => setData((current) => ({
                ...current,
                activeProject: project,
                projects: current.projects.map((candidate) => candidate.id === project.id ? project : candidate),
              }))}
              onError={setActionError}
            />
          </>
        ) : (
          <section className="welcome-panel" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <p className="step-kicker">第一步</p>
              <h2 id="welcome-title">为这次制作建立独立工作区</h2>
              <p>项目会自动保存到版本化目录。原始宠物、历史候选和验收证据不会被覆盖。</p>
            </div>
            <form onSubmit={createProject}>
              <label htmlFor="project-name">项目名称</label>
              <input
                ref={nameInput}
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoComplete="off"
                placeholder="例如：小福猩秋季版本"
              />
              <p className="field-hint">1–80 个字符，之后可在项目中补充产品信息。</p>
              <button type="submit" disabled={!name.trim() || isSaving}>
                {isSaving ? '正在创建…' : '创建并进入项目'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
