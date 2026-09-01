import { FormEvent, useEffect, useRef, useState } from 'react';
import type { StepId, WorkbenchBootstrap, WorkbenchProject, WorkbenchResult } from './types';

const steps: Array<{ id: StepId; label: string; hint: string }> = [
  { id: 'project', label: '制作项目', hint: '名称与恢复点' },
  { id: 'import', label: '导入素材', hint: '目录、ZIP 或 Petdex' },
  { id: 'validate', label: '自动检查', hint: '结构、安全与图集' },
  { id: 'preview', label: '制作预览', hint: '动作与真实桌宠' },
  { id: 'product', label: '产品信息', hint: '名称、版本与身份' },
  { id: 'export', label: '导出结果', hint: '标准包与候选' },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function applyResult(
  result: WorkbenchResult<WorkbenchBootstrap>,
  setData: (value: WorkbenchBootstrap) => void,
  setError: (value: string) => void,
) {
  if (result.ok) {
    setData(result.value);
    setError('');
    return true;
  }
  setError(result.error.message);
  return false;
}

export function App() {
  const [data, setData] = useState<WorkbenchBootstrap>({ projects: [], activeProject: null });
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.workbenchApi.getBootstrap()
      .then((result) => applyResult(result, setData, setError))
      .catch(() => setError('工作台启动失败，请关闭后重试。'))
      .finally(() => setIsLoading(false));
  }, []);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const result = await window.workbenchApi.createProject({ name });
      if (applyResult(result, setData, setError)) setName('');
    } catch {
      setError('项目创建失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  async function openProject(project: WorkbenchProject) {
    if (project.id === data.activeProject?.id) return;
    setIsLoading(true);
    try {
      applyResult(await window.workbenchApi.openProject(project.id), setData, setError);
    } catch {
      setError('项目打开失败，请重试。');
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
        <button className="new-project" type="button" onClick={() => nameInput.current?.focus()}>
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
        <div className="phase-note"><span>Phase 6.1</span><p>项目契约、保存与恢复基础</p></div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">内部制作工具 · 未签名候选流程</p>
            <h1>{data.activeProject?.name ?? '开始一个桌宠制作项目'}</h1>
          </div>
          {data.activeProject && <span className="saved-state">已安全保存</span>}
        </header>

        <div className="live-region" aria-live="polite">{isLoading ? '正在读取项目…' : error}</div>

        {error ? (
          <section className="message-panel" role="alert">
            <h2>暂时无法继续</h2><p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>重新加载工作台</button>
          </section>
        ) : data.activeProject ? <ProjectOverview project={data.activeProject} /> : (
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

function ProjectOverview({ project }: { project: WorkbenchProject }) {
  return (
    <section className="project-overview" aria-labelledby="progress-title">
      <div className="overview-intro">
        <div>
          <p className="step-kicker">项目已恢复</p><h2 id="progress-title">制作流程</h2>
          <p>工作台已保存项目基础。导入、校验和预览将在后续阶段接入。</p>
        </div>
        <dl>
          <div><dt>创建时间</dt><dd>{formatTime(project.createdAt)}</dd></div>
          <div><dt>保存方式</dt><dd>版本化、非覆盖</dd></div>
        </dl>
      </div>
      <ol className="step-list">
        {steps.map((step, index) => (
          <li key={step.id} className={step.id === project.activeStep ? 'current' : ''}>
            <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
            <div><h3>{step.label}</h3><p>{step.hint}</p></div>
            <span className="step-status">{step.id === project.activeStep ? '当前' : '待开始'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
