import React, { useEffect, useMemo, useState } from 'react';
import type { StudioApi } from '../preload/studio';
import type { ExportProgressEvent, PreviewPayload, ProjectMeta, StudioState } from '../shared/types';
import { resolveDistribution, distributionNote } from '../shared/manifest';
import { removeConfirmMessage } from '../shared/messages';
import { validatePetConfig, ZOOM_LEVELS } from '../shared/config';
import { Sprite, type PetState } from './pet/Sprite';

declare global {
  interface Window {
    studio: StudioApi;
  }
}

type Step = 'import' | 'check' | 'preview' | 'config' | 'export';

const STEPS: Array<{ id: Step; label: string; hint: string }> = [
  { id: 'import',  label: '导入', hint: '选择宠物包' },
  { id: 'check',   label: '检查', hint: '结构与图集校验' },
  { id: 'preview', label: '预览', hint: '动作与桌宠效果' },
  { id: 'config',  label: '配置', hint: '名字 / 缩放 / 行为' },
  { id: 'export',  label: '导出', hint: 'Windows 便携包' },
];

/** 动作预览的中文标签（覆盖全部已知动作行，让用户能主动检查图集每一行）。 */
const STATE_LABELS: Record<string, string> = {
  idle: '待机',
  walking: '行走',
  running: '奔跑',
  talking: '说话/挥手',
  jumping: '跳跃',
  dragging: '被拖动',
  waiting: '等待',
  review: '思考/观察',
  failed: '失败（不会自动播放）',
  extra1: '附加动作 1（v2，语义未公开）',
  extra2: '附加动作 2（v2，语义未公开）',
};
/** 展示顺序：先常见动作，再附加动作。 */
const STATE_ORDER = ['idle', 'walking', 'running', 'talking', 'jumping', 'dragging', 'waiting', 'review', 'failed', 'extra1', 'extra2'];

const LICENSE_LABEL: Record<string, string> = {
  'authorized': '已授权',
  'internal-test': '内部测试',
  'unknown': '未声明授权',
};

/** 使用方式展示：unknown 原包给普通用户可理解的说明，而不是技术错误。 */
function usageLabel(project: ProjectMeta): string {
  if (project.license === 'unknown') return '个人／内部体验（原包未声明授权）';
  return project.usageMode === 'general' ? '常规使用' : '个人／内部体验';
}

export function App() {
  const [state, setState] = useState<StudioState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('import');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await window.studio.getState();
      setState(s);
      setLoadErr(null);
      if (s.recovered) setNotice('检测到配置索引损坏，已自动备份并恢复为空项目列表（旧文件保留在 userData 下 .corrupt 备份）。');
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => { void refresh(); }, []);

  const current: ProjectMeta | null = useMemo(() => {
    if (!state) return null;
    return state.index.projects.find((p) => p.id === state.index.currentProjectId) ?? null;
  }, [state]);

  async function doImport(kind: 'dir' | 'zip') {
    setBusy('importing');
    setNotice(null);
    try {
      const res = await window.studio.importPack(kind);
      if (res.ok) {
        await refresh();
        setStep('check');
        setNotice(`已导入「${res.project.displayName}」（${res.project.petdexVersion}）`);
      } else if (!res.cancelled) {
        setNotice(null);
        await refresh();
        setImportErrors(res.errors);
      }
    } finally {
      setBusy(null);
    }
  }

  /** 删除最近项目：先确认（说明影响范围），失败时刷新真实状态并报错。 */
  async function requestRemove(p: ProjectMeta) {
    if (!window.confirm(removeConfirmMessage(p.displayName))) return; // 取消：不做任何修改
    try {
      const next = await window.studio.removeProject(p.id);
      setState(next);
      setNotice(`已删除「${p.displayName}」（仅删除制作台工作区副本，原始宠物包与已导出的 ZIP 不受影响）`);
      // 没有项目了：回到导入页，其余步骤因 current 为空自动禁用
      if (next.index.projects.length === 0) setStep('import');
    } catch (err) {
      // 删除失败：以磁盘真实状态为准刷新，避免 UI 与磁盘不一致
      await refresh();
      setNotice(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const [importErrors, setImportErrors] = useState<string[]>([]);

  if (loadErr) {
    return (
      <div className="fatal">
        <h1>制作台启动失败</h1>
        <p>{loadErr}</p>
        <button className="btn" onClick={() => void refresh()}>重试</button>
      </div>
    );
  }
  if (!state) return <div className="fatal"><p>加载中…</p></div>;

  return (
    <div className="layout">
      <aside className="rail">
        <div className="brand">
          <div className="brand-name">Pet Studio Lite</div>
          <div className="brand-sub">桌宠制作台 · 完全离线</div>
        </div>
        <nav className="steps">
          {STEPS.map((s, i) => {
            const locked = s.id !== 'import' && !current;
            return (
              <button
                key={s.id}
                className={`step ${step === s.id ? 'step--on' : ''}`}
                disabled={locked}
                onClick={() => setStep(s.id)}
              >
                <span className="step-no">{i + 1}</span>
                <span className="step-text">
                  <span className="step-label">{s.label}</span>
                  <span className="step-hint">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="rail-projects">
          <div className="rail-projects-title">最近项目</div>
          {state.index.projects.length === 0 && <div className="rail-empty">还没有项目</div>}
          {state.index.projects.map((p) => (
            // 行是纯容器；「选择项目」与「删除项目」是两个并列的原生 <button>，
            // 互不嵌套 —— 键盘（Enter/空格）与鼠标点删除都不会触发项目切换。
            <div
              key={p.id}
              className={`rail-project ${current?.id === p.id ? 'rail-project--on' : ''}`}
            >
              <button
                type="button"
                className="rail-project-select"
                title={p.id}
                onClick={async () => {
                  setState(await window.studio.selectProject(p.id));
                }}
              >
                <span className="rail-project-name">{p.displayName}</span>
                <span className="rail-project-meta">{p.petdexVersion}</span>
              </button>
              <button
                type="button"
                className="rail-project-del"
                aria-label={`删除项目 ${p.displayName}`}
                title="删除项目（仅删除工作区副本）"
                onClick={(e) => {
                  e.stopPropagation(); // 防御：删除事件永远不冒泡成行交互
                  void requestRemove(p);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="content">
        {notice && <div className="notice" onClick={() => setNotice(null)}>{notice}</div>}
        {step === 'import' && (
          <ImportStep
            busy={busy === 'importing'}
            errors={importErrors}
            projects={state.index.projects}
            onImport={doImport}
            onClearErrors={() => setImportErrors([])}
          />
        )}
        {step === 'check' && current && <CheckStep project={current} />}
        {step === 'preview' && current && <PreviewStep project={current} />}
        {step === 'config' && current && (
          <ConfigStep
            project={current}
            onSaved={(meta) => {
              setState((s) => s && ({
                ...s,
                index: {
                  ...s.index,
                  projects: s.index.projects.map((p) => (p.id === meta.id ? meta : p)),
                },
              }));
              setNotice('配置已保存');
            }}
          />
        )}
        {step === 'export' && current && <ExportStep project={current} />}
      </main>
    </div>
  );
}

// --- 步骤 1：导入 -----------------------------------------------------------

/** 命令一键复制（剪贴板 API 不可用时退回 execCommand）。 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button className="link copy-btn" onClick={() => void copy()}>{copied ? '已复制 ✓' : '复制'}</button>
  );
}

function CommandLine({ cmd }: { cmd: string }) {
  return (
    <div className="cmd-line">
      <code>{cmd}</code>
      <CopyButton text={cmd} />
    </div>
  );
}

/**
 * 新手帮助：如何从 Petdex 获取宠物包。
 * 命令与保存位置以 Petdex 官方 CLI（npm: petdex）实际行为为准：
 * `petdex install <名字>` 会把宠物包放到 ~/.petdex/pets/<名字>/ 并在终端
 * 输出保存位置；制作台本身不联网、不读取任何 Petdex 目录。
 */
function PetdexHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-box">
      <button className="help-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`help-arrow ${open ? 'help-arrow--open' : ''}`}>▸</span>
        第一次使用？如何从 Petdex 获取宠物包
      </button>
      {open && (
        <div className="help-body">
          <ol className="help-steps">
            <li>安装 <strong>Node.js 20 或更高版本</strong>（官网 nodejs.org，安装后重新打开终端）。</li>
            <li>打开终端（macOS：聚焦搜索输入「终端」；Windows：PowerShell）。</li>
            <li>
              用 Petdex 官方 CLI 下载宠物，例如：
              <CommandLine cmd="npx petdex install boba" />
              下载完成后，终端会显示保存位置（默认在 <code>~/.petdex/pets/boba/</code>，
              请以终端实际输出为准）。
            </li>
            <li>
              回到本页面，点「选择宠物包目录」选中刚才的目录；
              如果你拿到的是 <code>.zip</code> 文件，则点「选择 ZIP 压缩包」。
            </li>
          </ol>
          <p className="muted">
            高频用户可全局安装一次，之后直接用 <code>petdex</code> 命令：
          </p>
          <CommandLine cmd="npm install -g petdex" />
          <p className="muted">
            制作台不会自动联网下载，也不会读取你的 Petdex 目录——所有文件都由你主动选择。
            「在制作台里一键下载并导入」是后续版本的能力，当前版本请先按上面步骤获取宠物包。
          </p>
        </div>
      )}
    </div>
  );
}

function ImportStep(props: {
  busy: boolean;
  errors: string[];
  projects: ProjectMeta[];
  onImport: (kind: 'dir' | 'zip') => void;
  onClearErrors: () => void;
}) {
  return (
    <section>
      <h1>导入宠物包</h1>
      <p className="lead">
        选择一个 Petdex 宠物包目录或 ZIP 压缩包。导入会把包复制到制作台自己的工作区，
        不会修改你的原始文件。
      </p>
      <div className="import-actions">
        <button className="btn btn-primary" disabled={props.busy} onClick={() => props.onImport('dir')}>
          {props.busy ? '导入中…' : '选择宠物包目录'}
        </button>
        <button className="btn" disabled={props.busy} onClick={() => props.onImport('zip')}>
          选择 ZIP 压缩包
        </button>
      </div>
      <PetdexHelp />
      {props.errors.length > 0 && (
        <div className="error-panel">
          <div className="error-panel-title">
            导入失败
            <button className="link" onClick={props.onClearErrors}>知道了</button>
          </div>
          {props.errors.map((e, i) => <div className="error-line" key={i}>{e}</div>)}
          <div className="error-hint">修复后可以重新导入；失败的导入不会留下半成品项目。</div>
        </div>
      )}
      {props.projects.length > 0 && (
        <p className="muted">已有 {props.projects.length} 个项目。从左侧「最近项目」切换，或在检查 / 预览 / 配置步骤继续。</p>
      )}
    </section>
  );
}

// --- 步骤 2：检查 -----------------------------------------------------------

function CheckStep({ project }: { project: ProjectMeta }) {
  const [result, setResult] = useState<{ ok: boolean; errors: string[] } | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setResult(await window.studio.recheck(project.id));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { void run(); }, [project.id]);

  const items = [
    { label: '包结构与 pet.json', ok: result?.ok ?? null },
    { label: `图集尺寸（识别为 ${project.petdexVersion}）`, ok: result?.ok ?? null },
    { label: '图像可解码性', ok: result?.ok ?? null },
    { label: '包内路径安全', ok: result?.ok ?? null },
  ];

  return (
    <section>
      <h1>检查「{project.displayName}」</h1>
      <p className="lead">对项目工作区里的只读副本重新做完整校验。原始来源：{project.sourcePath}</p>
      <div className="card">
        {items.map((it) => (
          <div className="check-row" key={it.label}>
            <span className={`check-dot ${it.ok === null ? 'check-dot--pending' : it.ok ? 'check-dot--ok' : 'check-dot--bad'}`} />
            <span>{it.label}</span>
            <span className="check-state">{it.ok === null ? '检查中…' : it.ok ? '通过' : '失败'}</span>
          </div>
        ))}
        <div className="check-row">
          <span className="check-dot check-dot--ok" />
          <span>原包授权状态</span>
          <span className="check-state">{LICENSE_LABEL[project.license]}</span>
        </div>
        <div className="check-row">
          <span className="check-dot check-dot--ok" />
          <span>使用方式</span>
          <span className="check-state">{usageLabel(project)}</span>
        </div>
      </div>
      {result && !result.ok && (
        <div className="error-panel">
          <div className="error-panel-title">检查未通过</div>
          {result.errors.map((e, i) => <div className="error-line" key={i}>{e}</div>)}
          <div className="error-hint">请修复原始包后回到「导入」重新导入（工作区副本不做原地修复）。</div>
        </div>
      )}
      <button className="btn" disabled={running} onClick={() => void run()}>{running ? '检查中…' : '重新检查'}</button>
    </section>
  );
}

// --- 步骤 3：预览 -----------------------------------------------------------

function PreviewStep({ project }: { project: ProjectMeta }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stateName, setStateName] = useState<PetState>('idle');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setPayload(null);
    setError(null);
    window.studio.getPreviewPayload(project.id)
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => { void window.studio.stopPetPreview(); };
  }, [project.id]);

  // 预览窗口的任何关闭途径（制作台按钮 / 宠物右键菜单 / 系统关闭）都会
  // 收到 main 的通知，保证按钮状态与真实窗口一致。
  useEffect(() => {
    return window.studio.onPreviewClosed(() => setPreviewOpen(false));
  }, []);

  // 按固定顺序展示图集里实际存在的所有动作（含 v2 的 extra1/extra2）。
  const stateButtons = payload
    ? STATE_ORDER.filter((s) => s in payload.sprite.states)
    : [];

  return (
    <section>
      <h1>预览「{project.displayName}」</h1>
      {error && (
        <div className="error-panel">
          <div className="error-panel-title">预览加载失败</div>
          <div className="error-line">{error}</div>
          <div className="error-hint">可以回到「检查」查看详细原因，或回「导入」重新选择包。</div>
        </div>
      )}
      {payload && (
        <>
          <div className="preview-stage">
            <div className="preview-sprite">
              <Sprite
                config={payload.sprite}
                spritesheetUrl={payload.spritesheetDataUrl}
                state={stateName}
                zoom={2}
              />
            </div>
            <div className="preview-controls">
              {stateButtons.map((s) => (
                <button
                  key={s}
                  className={`chip ${stateName === s ? 'chip--on' : ''}`}
                  onClick={() => setStateName(s as PetState)}
                >
                  {STATE_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>真实桌宠预览</h2>
            <p className="muted">
              打开一个透明、无边框、置顶的真实桌宠窗口（与导出的 Windows 桌宠同一套代码）。
              可以拖动、单击、右键缩放；预览窗口不写任何持久化状态。
            </p>
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (previewOpen) {
                  await window.studio.stopPetPreview();
                  setPreviewOpen(false);
                } else {
                  const res = await window.studio.startPetPreview(project.id);
                  if (res.ok) setPreviewOpen(true);
                  else setError(res.error ?? '预览启动失败');
                }
              }}
            >
              {previewOpen ? '关闭桌宠预览' : '打开桌宠预览'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// --- 步骤 4：配置 -----------------------------------------------------------

function ConfigStep({ project, onSaved }: { project: ProjectMeta; onSaved: (m: ProjectMeta) => void }) {
  const [name, setName] = useState(project.config.petName);
  const [zoom, setZoom] = useState(project.config.zoom);
  const [wander, setWander] = useState(project.config.wanderEnabled);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(project.config.petName);
    setZoom(project.config.zoom);
    setWander(project.config.wanderEnabled);
    setErrors([]);
  }, [project.id]);

  async function save() {
    const check = validatePetConfig({ petName: name, zoom, wanderEnabled: wander });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const meta = await window.studio.updateConfig(project.id, check.config);
      onSaved(meta);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    name !== project.config.petName ||
    zoom !== project.config.zoom ||
    wander !== project.config.wanderEnabled;

  return (
    <section>
      <h1>配置「{project.displayName}」</h1>
      <p className="lead">配置会保存到项目里，并随导出一起进入独立桌宠。</p>
      <div className="card">
        <label className="field">
          <span className="field-label">宠物显示名称</span>
          <input
            className="field-input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="field-hint">1–24 个字符，显示在气泡和关于窗口里。</span>
        </label>
        <label className="field">
          <span className="field-label">默认缩放</span>
          <select className="field-input" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>{Math.round(z * 100)}%</option>
            ))}
          </select>
          <span className="field-hint">桌宠首次启动时的窗口大小；用户还可用右键菜单调整。</span>
        </label>
        <label className="field field--row">
          <input type="checkbox" checked={wander} onChange={(e) => setWander(e.target.checked)} />
          <span>允许闲置时自动游走</span>
        </label>
        <p className="field-hint">等待和思考会在闲置后自动触发；点击或拖动会重新计时。</p>
        {errors.length > 0 && (
          <div className="error-panel">
            {errors.map((e, i) => <div className="error-line" key={i}>{e}</div>)}
          </div>
        )}
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存配置'}
        </button>
      </div>
    </section>
  );
}

// --- 步骤 5：导出 -----------------------------------------------------------

function ExportStep({ project }: { project: ProjectMeta }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgressEvent[]>([]);
  const [result, setResult] = useState<{ zipPath: string; sha256: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.studio.onExportProgress((e) => {
      setProgress((p) => [...p, e]);
    });
  }, []);

  const distribution = resolveDistribution(project.license, project.usageMode);
  const note = distributionNote(project.license, project.usageMode);

  async function run() {
    setRunning(true);
    setProgress([]);
    setResult(null);
    setError(null);
    try {
      const res = await window.studio.exportProject(project.id);
      if (res.ok) setResult({ zipPath: res.zipPath, sha256: res.sha256 });
      else if (!res.cancelled) setError(res.error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h1>导出 Windows 便携包</h1>
      <p className="lead">
        导出一个不依赖任何开发环境的 Windows x64 便携 ZIP：解压后双击 EXE 即可运行桌宠。
        每次导出生成新文件，不会覆盖之前的产物。
      </p>

      <div className="card">
        <div className="check-row">
          <span className="check-dot check-dot--ok" />
          <span>原包授权状态</span>
          <span className="check-state">{LICENSE_LABEL[project.license]}</span>
        </div>
        <div className="check-row">
          <span className="check-dot check-dot--ok" />
          <span>使用方式</span>
          <span className="check-state">{usageLabel(project)}</span>
        </div>
        <div className="check-row">
          <span className={`check-dot ${distribution === 'candidate' ? 'check-dot--ok' : 'check-dot--pending'}`} />
          <span>产物性质</span>
          <span className="check-state">
            {distribution === 'candidate' ? '可分发候选（candidate）' : '仅个人／内部测试（internal-test-only）'}
          </span>
        </div>
        <div className="check-row">
          <span className="check-dot check-dot--ok" />
          <span>配置</span>
          <span className="check-state">
            {project.config.petName} · {Math.round(project.config.zoom * 100)}% · {project.config.wanderEnabled ? '游走开' : '游走关'}
          </span>
        </div>
      </div>

      {distribution === 'internal-test-only' && (
        <div className="info-panel">
          <div className="info-line">{note}</div>
        </div>
      )}

      <button className="btn btn-primary" disabled={running} onClick={() => void run()}>
        {running ? '导出中，请稍候…' : '选择导出位置并导出'}
      </button>

      {progress.length > 0 && (
        <div className="card">
          {progress.map((p, i) => (
            <div className="progress-line" key={i}>
              <span className="check-dot check-dot--ok" /> {p.message}
            </div>
          ))}
          {running && <div className="progress-line muted">进行中…（首次导出需要下载 Electron 运行时，可能耗时几分钟）</div>}
        </div>
      )}

      {result && (
        <div className="success-panel">
          <div className="success-title">导出完成</div>
          <div className="mono">{result.zipPath}</div>
          <div className="mono muted">SHA-256：{result.sha256}</div>
          <button className="btn" onClick={() => void window.studio.revealExport(result.zipPath)}>
            打开所在文件夹
          </button>
        </div>
      )}

      {error && (
        <div className="error-panel">
          <div className="error-panel-title">导出失败</div>
          <div className="error-line">{error}</div>
          <div className="error-hint">失败不会留下看似成功的 ZIP；修复后可以重试。</div>
        </div>
      )}
    </section>
  );
}
