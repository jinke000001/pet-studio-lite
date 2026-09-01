import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuthorizationStatus,
  ImportPreview,
  JobStatus,
  PetPreviewStatus,
  WorkbenchJob,
  WorkbenchProject,
  WorkbenchResult,
} from './types';

const authorizationLabels: Record<AuthorizationStatus, string> = {
  unknown: '授权情况未知',
  'internal-test': '仅限内部测试',
  authorized: '已获得授权',
};

const jobStatusLabels: Record<JobStatus, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已成功',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

const jobTypeLabels: Record<string, string> = {
  build: '候选构建',
  export: '项目导出',
};

const productFieldLabels: Record<string, string> = {
  productName: '产品名称',
  version: '版本号',
  productId: '产品 ID',
  appId: '应用身份',
  executableName: '可执行文件名',
  artifactName: '产物文件名',
};

const actionLabels: Record<string, string> = {
  idle: '待机',
  'running-right': '向右跑',
  'running-left': '向左跑',
  waving: '挥手',
  jumping: '跳跃',
  failed: '失败',
  waiting: '等待',
  running: '奔跑',
  review: '检查',
};

function SpriteFrame({ preview, row, column, large = false }: {
  preview: ImportPreview;
  row: number;
  column: number;
  large?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const context = canvas.current?.getContext('2d');
      if (!context) return;
      const { cellWidth, cellHeight } = preview.pet.grid;
      context.clearRect(0, 0, cellWidth, cellHeight);
      context.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
    };
    image.src = preview.atlasDataUrl;
    return () => { image.onload = null; };
  }, [preview, row, column]);
  return <canvas ref={canvas} className={large ? 'sprite-frame large' : 'sprite-frame'} width={preview.pet.grid.cellWidth} height={preview.pet.grid.cellHeight} aria-hidden="true" />;
}

function errorMessage<T>(result: WorkbenchResult<T>) {
  if (result.ok) return '';
  return [result.error.title, result.error.message, result.error.unaffected, result.error.action]
    .filter(Boolean).join(' ');
}

export function ProjectWorkspace({
  project,
  previewStatus,
  onProjectChange,
  onError,
}: {
  project: WorkbenchProject;
  previewStatus: PetPreviewStatus;
  onProjectChange(project: WorkbenchProject): void;
  onError(message: string): void;
}) {
  const [authorizationStatus, setAuthorizationStatus] = useState<AuthorizationStatus>(
    project.latestImport?.authorizationStatus ?? 'internal-test',
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedAction, setSelectedAction] = useState('idle');
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState('');
  const [infoNote, setInfoNote] = useState('');
  const [petStatus, setPetStatus] = useState(previewStatus);
  const [product, setProduct] = useState({ productName: project.product?.productName as string ?? '', version: project.product?.version as string ?? '0.1.0', productId: project.product?.productId as string ?? `${project.id}-product`, appId: project.product?.appId as string ?? `com.jinke.${project.id}`, executableName: project.product?.executableName as string ?? 'DesktopPetCandidate', artifactName: project.product?.artifactName as string ?? 'desktop-pet-candidate', targets: (project.product?.targets as Array<'mac' | 'win'> | undefined) ?? ['mac'] });
  const [jobs, setJobs] = useState<Array<WorkbenchJob>>([]);

  useEffect(() => {
    setPreview(null);
    setAuthorizationStatus(project.latestImport?.authorizationStatus ?? 'internal-test');
    setPetStatus(previewStatus);
    if (!project.latestImport) return;
    window.workbenchApi.getImportPreview(project.id).then((result) => {
      if (result.ok) setPreview(result.value);
      else onError(errorMessage(result));
    }).catch(() => onError('无法读取最近一次成功导入的预览。'));
  }, [project.id, project.latestImport?.id, previewStatus, onError]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => window.workbenchApi.listJobs(project.id).then((result) => { if (mounted && result.ok) setJobs(result.value as Array<WorkbenchJob>); }).catch(() => {});
    refresh(); const timer = window.setInterval(refresh, 1000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [project.id, project.updatedAt]);

  const activeAction = useMemo(
    () => preview?.actions.find((action) => action.name === selectedAction) ?? preview?.actions[0],
    [preview, selectedAction],
  );

  useEffect(() => {
    setFrame(0);
    if (!activeAction || activeAction.frames < 2) return undefined;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % activeAction.frames), 140);
    return () => window.clearInterval(timer);
  }, [activeAction]);

  async function importPet(sourceType: 'directory' | 'zip') {
    setBusy(`import-${sourceType}`);
    onError('');
    setInfoNote('');
    try {
      const result = await window.workbenchApi.selectImport({ projectId: project.id, sourceType, authorizationStatus });
      if (!result.ok) onError(errorMessage(result));
      else if (result.value.cancelled) setInfoNote('已取消选择，项目与已有导入未做任何改动。');
      else if (result.value.activeProject) onProjectChange(result.value.activeProject);
    } catch {
      onError('导入请求失败；原始素材和最近一次成功导入未受影响。请安全重试。');
    } finally {
      setBusy('');
    }
  }

  async function togglePetPreview() {
    setBusy('pet-preview');
    onError('');
    try {
      const runningHere = petStatus.status === 'running' && petStatus.projectId === project.id;
      const result = runningHere
        ? await window.workbenchApi.stopPetPreview()
        : await window.workbenchApi.startPetPreview(project.id);
      if (result.ok) setPetStatus(result.value);
      else onError(errorMessage(result));
    } catch {
      onError('真实桌宠预览控制失败，请重试。');
    } finally {
      setBusy('');
    }
  }

  async function saveProduct() {
    setBusy('product'); onError('');
    const result = await window.workbenchApi.saveProduct({ projectId: project.id, product });
    if (result.ok) onProjectChange(result.value); else onError(errorMessage(result));
    setBusy('');
  }

  async function exportProject() {
    setBusy('export'); onError('');
    const result = await window.workbenchApi.exportProject(project.id);
    if (result.ok) onProjectChange(result.value); else onError(errorMessage(result));
    setBusy('');
  }

  async function exportStandardPackage() {
    setBusy('standard-package'); onError('');
    const result = await window.workbenchApi.exportStandardPackage(project.id);
    if (result.ok) onProjectChange(result.value); else onError(errorMessage(result));
    setBusy('');
  }

  async function startCandidateJob(target: 'mac' | 'win') {
    setBusy(`candidate-${target}`); onError('');
    const result = await window.workbenchApi.startCandidateJob({ projectId: project.id, targets: [target] });
    if (!result.ok) onError(errorMessage(result));
    setBusy('');
  }

  async function startExportJob() {
    setBusy('export-job'); onError('');
    const result = await window.workbenchApi.startExportJob(project.id);
    if (!result.ok) onError(errorMessage(result));
    setBusy('');
  }

  async function cancelJob(jobId: string) {
    setBusy(`cancel-${jobId}`); onError('');
    const result = await window.workbenchApi.cancelJob({ projectId: project.id, jobId });
    if (!result.ok) onError(errorMessage(result));
    setBusy('');
  }

  async function retryJob(jobId: string) {
    setBusy(`retry-${jobId}`); onError('');
    const result = await window.workbenchApi.retryJob({ projectId: project.id, jobId });
    if (!result.ok) onError(errorMessage(result));
    setBusy('');
  }

  const imported = project.latestImport;
  const runningHere = petStatus.status === 'running' && petStatus.projectId === project.id;
  const interruptedJobs = jobs.filter((job) => job.status === 'interrupted');
  const distributable = imported?.authorizationStatus === 'authorized';

  return (
    <section className="project-workspace" aria-labelledby="project-workspace-title">
      <div className="overview-intro">
        <div>
          <p className="step-kicker">Phase 6.5 · 导入与预览</p>
          <h2 id="project-workspace-title">导入、检查与制作预览</h2>
          <p>来源路径只由系统选择器交给主进程；工作台界面仅保存安全来源摘要。</p>
        </div>
        <dl>
          <div><dt>项目状态</dt><dd>{imported ? '已有成功导入' : '等待导入'}</dd></div>
          <div><dt>保存方式</dt><dd>版本化、非覆盖</dd></div>
          <div><dt>项目 ID</dt><dd className="project-id">{project.id}</dd></div>
        </dl>
      </div>

      {infoNote && <p className="info-note" role="status">{infoNote}</p>}

      <div className="workbench-grid">
        <section className="tool-panel" aria-labelledby="import-title">
          <p className="panel-index">01</p><h3 id="import-title">选择素材</h3>
          <label htmlFor="authorization-status">素材授权状态</label>
          <select id="authorization-status" value={authorizationStatus} onChange={(event) => setAuthorizationStatus(event.target.value as AuthorizationStatus)}>
            {Object.entries(authorizationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <p className="field-hint">未知或内部测试素材可验证，但不能作为可分发结论。</p>
          <div className="button-row">
            <button type="button" onClick={() => importPet('directory')} disabled={Boolean(busy)}>
              {busy === 'import-directory' ? '正在导入…' : '选择 v1/v2 目录'}
            </button>
            <button type="button" className="secondary" onClick={() => importPet('zip')} disabled={Boolean(busy)}>
              {busy === 'import-zip' ? '正在导入…' : '选择 ZIP'}
            </button>
          </div>
          {imported && <p className="source-summary">最近来源：<strong>{imported.sourceLabel}</strong><br />安全标识：{imported.sourceIdentity}</p>}
        </section>

        <section className={`tool-panel validation-panel ${imported?.validation.level ?? ''}`} aria-labelledby="validation-title">
          <p className="panel-index">02</p><h3 id="validation-title">自动检查</h3>
          {!imported ? <p className="empty-copy">导入后显示结构、安全、图集与授权检查。</p> : (
            <>
              <span className="status-pill">{imported.validation.level === 'passed' ? '通过' : '警告'}</span>
              <ul className="result-list">{imported.validation.messages.map((message) => <li key={message}>{message}</li>)}</ul>
              <p className="unaffected">原始素材、历史候选和上一次成功版本不会被覆盖。</p>
              <p className="next-action">下一步：检查联系表与动作，再启动真实桌宠预览。</p>
            </>
          )}
        </section>
      </div>

      {imported && preview && (
        <section className="preview-panel" aria-labelledby="preview-title">
          <div className="preview-heading">
            <div><p className="panel-index">03</p><h3 id="preview-title">联系表与逐动作预览</h3></div>
            <button type="button" onClick={togglePetPreview} disabled={Boolean(busy)} aria-pressed={runningHere}>
              {busy === 'pet-preview' ? '正在处理…' : runningHere ? '停止真实桌宠' : '启动真实桌宠'}
            </button>
          </div>
          <dl className="pet-facts">
            <div><dt>身份</dt><dd>{imported.pet.displayName} · {imported.pet.id}</dd></div>
            <div><dt>版本</dt><dd>Petdex v{imported.pet.spriteVersionNumber}</dd></div>
            <div><dt>图集</dt><dd>{imported.pet.grid.columns}×{imported.pet.grid.rows} · {imported.pet.grid.cellWidth}×{imported.pet.grid.cellHeight}px</dd></div>
            <div><dt>Alpha</dt><dd>已检测</dd></div>
            <div><dt>方向</dt><dd>{imported.pet.lookDirections ? '16 个注视方向' : 'v1 标准动作'}</dd></div>
            <div><dt>授权</dt><dd>{authorizationLabels[imported.authorizationStatus]}</dd></div>
          </dl>
          <div className="preview-layout">
            <div>
              <div className="sprite-stage"><SpriteFrame preview={preview} row={activeAction?.row ?? 0} column={frame} large /></div>
              <p className="animation-caption">{actionLabels[activeAction?.name ?? 'idle'] ?? activeAction?.name} · 第 {frame + 1}/{activeAction?.frames ?? 1} 帧</p>
            </div>
            <div className="contact-sheet" aria-label="标准动作联系表">
              {preview.actions.map((action) => (
                <button key={action.name} type="button" className={selectedAction === action.name ? 'selected' : ''} onClick={() => setSelectedAction(action.name)}>
                  <SpriteFrame preview={preview} row={action.row} column={0} /><span>{actionLabels[action.name] ?? action.name}</span>
                </button>
              ))}
            </div>
          </div>
          {imported.pet.lookDirections && (
            <div className="look-strip" aria-label="十六个注视方向">
              {Array.from({ length: 16 }, (_, index) => (
                <div key={index}><SpriteFrame preview={preview} row={index < 8 ? 9 : 10} column={index % 8} /><small>{index * 22.5}°</small></div>
              ))}
            </div>
          )}
        </section>
      )}
      {imported && (
        <section className="tool-panel product-panel" aria-labelledby="product-title">
          <p className="panel-index">04</p><h3 id="product-title">产品信息与导出</h3>
          <div className="product-fields">{Object.entries(product).filter(([key]) => key !== 'targets').map(([key, value]) => (
            <label key={key} htmlFor={`product-${key}`}>
              {productFieldLabels[key] ?? key}
              <input
                id={`product-${key}`}
                value={String(value)}
                onChange={(event) => setProduct((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}</div>
          <fieldset className="target-fields"><legend>目标平台</legend>{(['mac', 'win'] as const).map((target) => <label key={target}><input type="checkbox" checked={product.targets.includes(target)} onChange={(event) => setProduct((current) => ({ ...current, targets: event.target.checked ? [...new Set([...current.targets, target])] : current.targets.filter((value) => value !== target) }))} />{target === 'mac' ? 'macOS 未签名候选' : 'Windows 未签名候选'}</label>)}</fieldset>
          <div className="button-row">
            <button type="button" onClick={saveProduct} disabled={Boolean(busy)}>{busy === 'product' ? '保存中…' : '保存产品配置'}</button>
            <button type="button" className="secondary" onClick={exportStandardPackage} disabled={Boolean(busy)}>{busy === 'standard-package' ? '导出中…' : '导出标准包'}</button>
            <button type="button" className="secondary" onClick={exportProject} disabled={Boolean(busy) || !project.product}>{busy === 'export' ? '导出中…' : '导出可恢复项目包'}</button>
            <button type="button" className="secondary" onClick={startExportJob} disabled={Boolean(busy) || !project.product}>{busy === 'export-job' ? '排队中…' : '后台导出项目包'}</button>
            <button type="button" onClick={() => startCandidateJob('mac')} disabled={Boolean(busy) || !project.product || !distributable}>{busy === 'candidate-mac' ? '排队中…' : '构建 macOS 候选'}</button>
            <button type="button" onClick={() => startCandidateJob('win')} disabled={Boolean(busy) || !project.product || !distributable}>{busy === 'candidate-win' ? '排队中…' : '构建 Windows 候选'}</button>
          </div>
          {!distributable && <p className="recovery-note" role="status">当前授权为“{authorizationLabels[imported.authorizationStatus]}”：可导出标准包和项目包，但不可生成可分发候选。请核实授权后重新导入。</p>}
          {distributable && <p className="field-hint">macOS 候选仍需真实运行验证；Windows 构建只形成静态候选，installed mode 与 100%/125%/150% DPI 必须外部验收。</p>}
          {project.product && <p className="source-summary">当前配置已保存；导出采用版本化、非覆盖目录。</p>}
        </section>
      )}
      <section className="tool-panel jobs-panel" aria-labelledby="jobs-title">
        <p className="panel-index">05</p><h3 id="jobs-title">任务中心</h3>
        {interruptedJobs.length > 0 && (
          <p className="recovery-note" role="status">
            检测到 {interruptedJobs.length} 个被中断的任务：工作台退出时未完成的任务已安全标记为中断，不会继续执行；可在下方安全重试，重试会生成新任务、不覆盖原记录。
          </p>
        )}
        {jobs.length === 0 ? <p className="empty-copy">暂无任务。导出等耗时操作会在这里排队并保留进度与证据。</p> : (
          <ul className="job-list">
            {jobs.slice().reverse().map((job) => {
              const isActive = job.status === 'queued' || job.status === 'running';
              const canRetry = job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted';
              return (
                <li key={job.id} className={`job-row ${job.status}`}>
                  <div className="job-main">
                    <strong>{jobTypeLabels[job.type] ?? job.type}</strong>
                    <span>{job.step}</span>
                    {isActive && (
                      <progress className="job-progress" max={100} value={job.progress ?? 0} aria-label={`${jobTypeLabels[job.type] ?? job.type}进度`} />
                    )}
                    {job.status === 'failed' && job.error && (
                      <span className="job-error">失败原因：{job.error.message}</span>
                    )}
                  </div>
                  <div className="job-side">
                    <span className={`job-status ${job.status}`}>
                      {jobStatusLabels[job.status]}{isActive ? ` ${job.progress ?? 0}%` : ''}
                    </span>
                    {isActive && (
                      <button type="button" className="job-action" onClick={() => cancelJob(job.id)} disabled={Boolean(busy)}>
                        {busy === `cancel-${job.id}` ? '取消中…' : '取消'}
                      </button>
                    )}
                    {canRetry && (
                      <button type="button" className="job-action" onClick={() => retryJob(job.id)} disabled={Boolean(busy)}>
                        {busy === `retry-${job.id}` ? '重试中…' : '安全重试'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
