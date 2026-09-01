import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuthorizationStatus,
  ImportPreview,
  PetPreviewStatus,
  WorkbenchProject,
  WorkbenchResult,
} from './types';

const authorizationLabels: Record<AuthorizationStatus, string> = {
  unknown: '授权情况未知',
  'internal-test': '仅限内部测试',
  authorized: '已获得授权',
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
  const [petStatus, setPetStatus] = useState(previewStatus);

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
    try {
      const result = await window.workbenchApi.selectImport({ projectId: project.id, sourceType, authorizationStatus });
      if (!result.ok) onError(errorMessage(result));
      else if (!result.value.cancelled && result.value.activeProject) onProjectChange(result.value.activeProject);
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

  const imported = project.latestImport;
  const runningHere = petStatus.status === 'running' && petStatus.projectId === project.id;

  return (
    <section className="project-workspace" aria-labelledby="project-workspace-title">
      <div className="overview-intro">
        <div>
          <p className="step-kicker">Phase 6.2 · 导入与预览</p>
          <h2 id="project-workspace-title">导入、检查与制作预览</h2>
          <p>来源路径只由系统选择器交给主进程；工作台界面仅保存安全来源摘要。</p>
        </div>
        <dl>
          <div><dt>项目状态</dt><dd>{imported ? '已有成功导入' : '等待导入'}</dd></div>
          <div><dt>保存方式</dt><dd>版本化、非覆盖</dd></div>
        </dl>
      </div>

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
    </section>
  );
}
