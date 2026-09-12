import React, { useEffect, useMemo, useState } from 'react';
import type { StudioApi } from '../preload/studio';
import type { ExportProgressEvent, PetdexImportCandidate, PetRuntimeConfig, PreviewPayload, ProjectMeta, StudioState } from '../shared/types';
import { resolveDistribution, distributionNote } from '../shared/manifest';
import { removeConfirmMessage } from '../shared/messages';
import { validatePetConfig, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../shared/config';
import { Sprite, type PetState } from './pet/Sprite';
import { GlyphField } from './components/GlyphField';
import { AnimationInspector } from './components/AnimationInspector';

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
  climbing: '攀爬',
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
const STATE_ORDER = ['idle', 'walking', 'running', 'climbing', 'talking', 'jumping', 'dragging', 'waiting', 'review', 'failed', 'extra1', 'extra2'];

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
  const [petdexCandidate, setPetdexCandidate] = useState<PetdexImportCandidate | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PetRuntimeConfig>>({});

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
    setImportErrors([]);
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
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(null);
    }
  }

  async function preparePetdexImport(command: string) {
    setBusy('petdex-downloading');
    setNotice(null);
    setImportErrors([]);
    setPetdexCandidate(null);
    try {
      const res = await window.studio.preparePetdexImport(command);
      if (res.ok) setPetdexCandidate(res.candidate);
      else setImportErrors(res.errors);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(null);
    }
  }

  async function confirmPetdexImport(candidate: PetdexImportCandidate) {
    setBusy('petdex-confirming');
    setImportErrors([]);
    try {
      const res = await window.studio.confirmPetdexImport(candidate.token);
      setPetdexCandidate(null);
      if (res.ok) {
        await refresh();
        setStep('check');
        setNotice(`已导入「${res.project.displayName}」（${res.project.petdexVersion}）`);
      } else if (!res.cancelled) {
        setImportErrors(res.errors);
      }
    } catch (err) {
      setPetdexCandidate(null);
      setImportErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(null);
    }
  }

  async function cancelPetdexImport(candidate: PetdexImportCandidate) {
    setPetdexCandidate(null);
    try {
      await window.studio.cancelPetdexImport(candidate.token);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : String(err)]);
    }
  }

  /** 删除最近项目：先确认（说明影响范围），失败时刷新真实状态并报错。 */
  async function requestRemove(p: ProjectMeta) {
    if (!window.confirm(removeConfirmMessage(p.displayName))) return; // 取消：不做任何修改
    setBusy('removing');
    try {
      const next = await window.studio.removeProject(p.id);
      setState(next);
      setDrafts((previous) => { const next = { ...previous }; delete next[p.id]; return next; });
      setNotice(`已删除「${p.displayName}」（仅删除制作台工作区副本，原始宠物包与已导出的 ZIP 不受影响）`);
      // 没有项目了：回到导入页，其余步骤因 current 为空自动禁用
      if (next.index.projects.length === 0) setStep('import');
    } catch (err) {
      // 删除失败：以磁盘真实状态为准刷新，避免 UI 与磁盘不一致
      await refresh();
      setNotice(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  const [importErrors, setImportErrors] = useState<string[]>([]);

  if (loadErr) {
    return (
      <>
        <div className="window-drag-region" aria-hidden="true" />
        <div className="fatal">
          <h1>制作台启动失败</h1>
          <p>{loadErr}</p>
          <button className="btn" onClick={() => void refresh()}>重试</button>
        </div>
      </>
    );
  }
  if (!state) {
    return (
      <>
        <div className="window-drag-region" aria-hidden="true" />
        <div className="fatal"><p>加载中…</p></div>
      </>
    );
  }

  return (
    <div className="layout">
      <div className="window-drag-region" aria-hidden="true" />
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
              <ellipse cx="12" cy="15.5" rx="4.6" ry="4" fill="#ffffff" />
              <ellipse cx="6.4" cy="10.4" rx="1.9" ry="2.4" fill="#ffffff" transform="rotate(-18 6.4 10.4)" />
              <ellipse cx="17.6" cy="10.4" rx="1.9" ry="2.4" fill="#ffffff" transform="rotate(18 17.6 10.4)" />
              <ellipse cx="9.6" cy="7.6" rx="1.8" ry="2.3" fill="#ffffff" transform="rotate(-6 9.6 7.6)" />
              <ellipse cx="14.4" cy="7.6" rx="1.8" ry="2.3" fill="#ffffff" transform="rotate(6 14.4 7.6)" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Pet Studio Lite</div>
            <div className="brand-sub">桌宠制作台 · 本地工作区</div>
          </div>
        </div>
        <nav className="steps">
          {STEPS.map((s, i) => {
            const locked = s.id !== 'import' && !current;
            // 「已完成」是纯 UI 态：步骤 index 小于当前步骤 index 即视为已完成
            const currentIndex = STEPS.findIndex((x) => x.id === step);
            const done = i < currentIndex;
            return (
              <div
                key={s.id}
                className={`step ${step === s.id ? 'step--on' : ''} ${done ? 'step--done' : ''}`}
              >
                <button
                  type="button"
                  className="step-btn"
                  disabled={locked || busy !== null}
                  aria-current={step === s.id ? 'step' : undefined}
                  onClick={() => setStep(s.id)}
                >
                  <span className="step-no">{done ? '✓' : i + 1}</span>
                  <span className="step-text">
                    <span className="step-label">{s.label}</span>
                    <span className="step-hint">{s.hint}</span>
                  </span>
                </button>
              </div>
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
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('selecting');
                  setNotice(null);
                  try {
                    setState(await window.studio.selectProject(p.id));
                  } catch (err) {
                    setNotice(`切换失败：${err instanceof Error ? err.message : String(err)}`);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <span className="rail-project-name">{p.displayName}</span>
                <span className="rail-project-meta">{drafts[p.id] ? '未保存' : p.petdexVersion}</span>
              </button>
              <button
                type="button"
                className="rail-project-del"
                aria-label={`删除项目 ${p.displayName}`}
                title="删除项目（仅删除工作区副本）"
                disabled={busy !== null}
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
            busy={busy}
            errors={importErrors}
            projects={state.index.projects}
            petdexCandidate={petdexCandidate}
            onImport={doImport}
            onPreparePetdex={preparePetdexImport}
            onConfirmPetdex={confirmPetdexImport}
            onCancelPetdex={cancelPetdexImport}
            onClearErrors={() => setImportErrors([])}
          />
        )}
        {step === 'check' && current && <CheckStep key={current.id} project={current} />}
        {step === 'preview' && current && <PreviewStep key={current.id} project={current} onBusyChange={(value) => setBusy(value ? 'preview' : null)} />}
        {step === 'config' && current && (
          <ConfigStep
            key={current.id}
            project={current}
            draft={drafts[current.id] ?? current.config}
            onChange={(draft) => setDrafts((previous) => {
              const next = { ...previous };
              if (draft.petName === current.config.petName && draft.zoom === current.config.zoom && draft.wanderEnabled === current.config.wanderEnabled) delete next[current.id];
              else next[current.id] = draft;
              return next;
            })}
            onBusyChange={(value) => setBusy(value ? 'saving' : null)}
            onSaved={(meta) => {
              setDrafts((previous) => { const next = { ...previous }; delete next[meta.id]; return next; });
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
        {current && (
          <div hidden={step !== 'export'}>
            <ExportStep key={current.id} project={current} visible={step === 'export'} hasDraft={!!drafts[current.id]}
              onEditConfig={() => setStep('config')}
              onBusyChange={(value) => setBusy(value ? 'exporting' : null)} />
          </div>
        )}
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
 * `petdex install <名字>` 会把宠物包放到 ~/.petdex/pets/<名字>/。制作台
 * 现在可代为执行严格白名单化的下载，并在用户确认后导入工作区副本。
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
            <li>在 Petdex 宠物页面复制完整安装命令。</li>
            <li>
              把命令粘贴到本页「从 Petdex 下载」输入框，例如：
              <CommandLine cmd="npx petdex@latest install boba" />
            </li>
            <li>
              下载完成后核对名称、版本、授权与预览，再点「确认导入」。原包仍保留在
              <code>~/.petdex/pets/</code>。
            </li>
          </ol>
          <p className="muted">
            高频用户可全局安装一次，之后直接用 <code>petdex</code> 命令：
          </p>
          <CommandLine cmd="npm install -g petdex" />
          <p className="muted">
            如果已经有本地宠物包，也可以继续使用上方的目录或 ZIP 导入。
          </p>
        </div>
      )}
    </div>
  );
}

function ImportStep(props: {
  busy: string | null;
  errors: string[];
  projects: ProjectMeta[];
  petdexCandidate: PetdexImportCandidate | null;
  onImport: (kind: 'dir' | 'zip') => void;
  onPreparePetdex: (command: string) => void;
  onConfirmPetdex: (candidate: PetdexImportCandidate) => void;
  onCancelPetdex: (candidate: PetdexImportCandidate) => void;
  onClearErrors: () => void;
}) {
  const [command, setCommand] = useState('');
  const downloading = props.busy === 'petdex-downloading';
  const confirming = props.busy === 'petdex-confirming';
  const unavailable = props.busy !== null;
  return (
    <section>
      <div className="eyebrow page-eyebrow">STEP · 01 — IMPORT · PETDEX PACK</div>
      <h1>导入宠物包</h1>
      <p className="lead">
        选择 Petdex 宠物包，或带 actions.xml、behaviors.xml 和 PNG 帧的经典 Shimeji 角色目录 / ZIP。导入会转换并复制到制作台自己的工作区，
        不会修改你的原始文件。
      </p>
      <div className="import-actions">
        <button className="btn" disabled={unavailable} onClick={() => props.onImport('dir')}>
          {props.busy === 'importing' ? '导入中…' : '选择宠物 / Shimeji 目录'}
        </button>
        <button className="btn" disabled={unavailable} onClick={() => props.onImport('zip')}>
          选择 ZIP 压缩包
        </button>
      </div>

      <div className="petdex-import-card">
        <div className="petdex-import-head">
          <div>
            <div className="eyebrow">PETDEX · DIRECT IMPORT</div>
            <h2>从 Petdex 下载</h2>
          </div>
          <span className="petdex-location">保存至 ~/.petdex/pets</span>
        </div>
        <form className="petdex-command-form" onSubmit={(event) => {
          event.preventDefault();
          props.onPreparePetdex(command);
        }}>
          <label className="field-label" htmlFor="petdex-command">粘贴完整安装命令</label>
          <div className="petdex-command-row">
            <input
              id="petdex-command"
              className="field-input petdex-command-input"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="npx petdex@latest install capvolt"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={unavailable}
              aria-describedby="petdex-command-hint"
            />
            <button className="btn btn-primary" type="submit" disabled={unavailable || command.trim() === ''}>
              {downloading ? '正在下载…' : '下载并读取信息'}
            </button>
          </div>
          <div id="petdex-command-hint" className="field-hint">
            仅支持 Petdex 官方安装命令。制作台不会执行其中的其他代码。
          </div>
        </form>

        {downloading && (
          <div className="petdex-loading" role="status" aria-live="polite">
            <span className="check-dot check-dot--pending" aria-hidden="true" />
            正在连接 Petdex 并校验宠物包，通常需要几十秒…
          </div>
        )}

        {props.petdexCandidate && (
          <div className="petdex-candidate" aria-live="polite">
            <div className="petdex-candidate-preview" aria-label={`${props.petdexCandidate.displayName} 待导入预览`}>
              <Sprite
                config={props.petdexCandidate.sprite}
                spritesheetUrl={props.petdexCandidate.spritesheetDataUrl}
                state="idle"
                zoom={1.2}
              />
            </div>
            <div className="petdex-candidate-info">
              <div className="eyebrow">READY · 等待确认</div>
              <h2>{props.petdexCandidate.displayName}</h2>
              <dl className="petdex-meta">
                <div><dt>ID</dt><dd>{props.petdexCandidate.petId}</dd></div>
                <div><dt>版本</dt><dd>{props.petdexCandidate.petdexVersion}</dd></div>
                <div><dt>授权</dt><dd>{LICENSE_LABEL[props.petdexCandidate.license]}</dd></div>
                <div><dt>目录</dt><dd>{props.petdexCandidate.slug}</dd></div>
              </dl>
              <p className="field-hint">确认后才会复制到制作台项目；Petdex 原包不会移动或删除。</p>
              <div className="petdex-candidate-actions">
                <button className="btn" type="button" disabled={confirming} onClick={() => props.onCancelPetdex(props.petdexCandidate!)}>
                  暂不导入
                </button>
                <button className="btn btn-primary" type="button" disabled={confirming} onClick={() => props.onConfirmPetdex(props.petdexCandidate!)}>
                  {confirming ? '正在导入…' : '确认导入'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <PetdexHelp />
      {props.errors.length > 0 && (
        <div className="error-panel" style={{ marginTop: 20, maxWidth: 560 }}>
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
    setResult(null);
    try {
      setResult(await window.studio.recheck(project.id));
    } catch (err) {
      setResult({ ok: false, errors: [err instanceof Error ? err.message : String(err)] });
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
      <div className="eyebrow page-eyebrow">STEP · 02 — CHECK · VALIDATION</div>
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

function PreviewStep({ project, onBusyChange }: { project: ProjectMeta; onBusyChange: (value: boolean) => void }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stateName, setStateName] = useState<PetState>('idle');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setPayload(null);
    setError(null);
    window.studio.getPreviewPayload(project.id)
      .then((value) => { if (active) setPayload(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [project.id, reload]);

  useEffect(() => () => { void window.studio.stopPetPreview().catch(() => {}); }, []);

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
      <div className="eyebrow page-eyebrow">STEP · 03 — PREVIEW · SPRITE &amp; LIVE</div>
      <h1>预览「{project.displayName}」</h1>
      {error && (
        <div className="error-panel">
          <div className="error-panel-title">预览加载失败</div>
          <div className="error-line">{error}</div>
          <div className="error-hint">可以回到「检查」查看详细原因，或回「导入」重新选择包。</div>
          {!payload && <button className="btn" onClick={() => setReload((value) => value + 1)}>重新加载预览</button>}
        </div>
      )}
      {!payload && !error && <p role="status" className="muted">正在读取动作与图集…</p>}
      {payload && (
        <>
          <div className="preview-stage">
            <AnimationInspector payload={payload} state={stateName} />
            <div className="preview-controls">
              {stateButtons.map((s) => (
                <button
                  key={s}
                  className={`chip ${stateName === s ? 'chip--on' : ''}`}
                  aria-pressed={stateName === s}
                  onClick={() => setStateName(s as PetState)}
                >
                  {STATE_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>
          <div className="card card--navy">
            <div className="eyebrow" style={{ marginBottom: 6 }}>LIVE · TRANSPARENT WINDOW</div>
            <h2>真实桌宠预览</h2>
            <p className="muted" style={{ lineHeight: 1.7, margin: '0 0 12px' }}>
              打开一个透明、无边框、置顶的真实桌宠窗口（与导出的 Windows 桌宠同一套代码）。
              可以拖动、单击、右键打开尺寸滑杆；预览窗口不写任何持久化状态。
            </p>
            <button
              className="btn btn-primary"
              disabled={opening}
              onClick={async () => {
                setOpening(true);
                onBusyChange(true);
                setError(null);
                try {
                  if (previewOpen) {
                    await window.studio.stopPetPreview();
                    setPreviewOpen(false);
                  } else {
                    const res = await window.studio.startPetPreview(project.id);
                    if (res.ok) setPreviewOpen(true);
                    else setError(res.error ?? '预览启动失败');
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setOpening(false);
                  onBusyChange(false);
                }
              }}
            >
              {opening ? '处理中…' : previewOpen ? '关闭桌宠预览' : '打开桌宠预览'}
            </button>
          </div>
          <p className="field-hint">
            {payload.sourceFormat === 'classic-shimeji'
              ? '经典 Shimeji：这里展示转换后的动作，自动行为由 Pet Studio 调度，并非原包完整行为复现。'
              : 'Petdex：拖动复用行走帧，攀爬复用思考行；附加动作仅供手动预览。'}
          </p>
        </>
      )}
    </section>
  );
}

// --- 步骤 4：配置 -----------------------------------------------------------

function ConfigStep({ project, draft, onChange, onSaved, onBusyChange }: {
  project: ProjectMeta;
  draft: PetRuntimeConfig;
  onChange: (draft: PetRuntimeConfig) => void;
  onSaved: (m: ProjectMeta) => void;
  onBusyChange: (value: boolean) => void;
}) {
  const { petName: name, zoom, wanderEnabled: wander } = draft;
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const check = validatePetConfig({ petName: name, zoom, wanderEnabled: wander });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setSaving(true);
    onBusyChange(true);
    setErrors([]);
    try {
      const meta = await window.studio.updateConfig(project.id, check.config);
      onSaved(meta);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  const dirty =
    name !== project.config.petName ||
    zoom !== project.config.zoom ||
    wander !== project.config.wanderEnabled;
  const zoomPercent = Math.round(zoom * 100);
  const sliderProgress = ((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100;

  return (
    <section>
      <div className="eyebrow page-eyebrow">STEP · 04 — CONFIG · NAME / ZOOM / BEHAVIOR</div>
      <h1>配置「{project.displayName}」</h1>
      <p className="lead">保存后的配置会随导出进入独立桌宠。未保存的修改会在本次会话中保留，关闭制作台前请保存。</p>
      <div className="card" style={{ maxWidth: 520 }}>
        <label className="field">
          <span className="field-label">宠物显示名称</span>
          <input
            className="field-input"
            value={name}
            maxLength={24}
            disabled={saving}
            onChange={(e) => onChange({ ...draft, petName: e.target.value })}
          />
          <span className="field-hint">1–24 个字符，显示在气泡和关于窗口里。</span>
        </label>
        <div className="field size-control">
          <div className="size-control-head">
            <label className="field-label" htmlFor="pet-size">宠物尺寸</label>
            <output className="size-value" htmlFor="pet-size" aria-live="polite">{zoomPercent}%</output>
          </div>
          <span className="field-hint" id="pet-size-hint">
            调整桌宠首次启动时的大小；保存后会同步到真实预览和导出产物。
          </span>
          <input
            id="pet-size"
            className="size-slider"
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={zoom}
            aria-describedby="pet-size-hint"
            style={{ '--size-progress': `${sliderProgress}%` } as React.CSSProperties}
            disabled={saving}
            onChange={(e) => onChange({ ...draft, zoom: Number(e.target.value) })}
          />
          <div className="size-scale" aria-hidden="true">
            <span>小 · 100%</span>
            <span>中 · 200%</span>
            <span>大 · 300%</span>
          </div>
        </div>
        <div className="field field--row">
          <label className="switch">
            <input type="checkbox" aria-label="允许闲置时自动游走" disabled={saving} checked={wander} onChange={(e) => onChange({ ...draft, wanderEnabled: e.target.checked })} />
            <span className="switch-track" />
          </label>
          <span>允许闲置时自动游走</span>
        </div>
        <p className="field-hint" style={{ margin: '0 0 16px' }}>等待和思考会在闲置后自动触发；点击或拖动会重新计时。</p>
        {errors.length > 0 && (
          <div className="error-panel">
            {errors.map((e, i) => <div className="error-line" key={i}>{e}</div>)}
          </div>
        )}
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存配置'}
        </button>
        {dirty && <button className="btn" disabled={saving} onClick={() => { onChange(project.config); setErrors([]); }}>撤销修改</button>}
      </div>
    </section>
  );
}

// --- 步骤 5：导出 -----------------------------------------------------------

/** 一次导出预计发出的进度事件总数，用于点阵玩具估算进度（见 src/main/export-win.ts：
 *  prepare（首次导出 2 条）+ build-runtime + assemble + verify + done ≈ 6 条）。
 *  只是视觉估算，不准也不影响真实导出流程；完成时强制按 100% 聚形。 */
const EXPECTED_EXPORT_EVENTS = 6;

function ExportStep({ project, visible, hasDraft, onEditConfig, onBusyChange }: {
  project: ProjectMeta;
  visible: boolean;
  hasDraft: boolean;
  onEditConfig: () => void;
  onBusyChange: (value: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgressEvent[]>([]);
  const [result, setResult] = useState<{ zipPath: string; sha256: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportRunId, setExportRunId] = useState(0);

  useEffect(() => {
    if (!running) return;
    return window.studio.onExportProgress((e) => {
      setProgress((p) => [...p, e]);
    });
  }, [running]);

  const distribution = resolveDistribution(project.license, project.usageMode);
  const note = distributionNote(project.license, project.usageMode);

  async function run() {
    setExportRunId((id) => id + 1);
    setRunning(true);
    onBusyChange(true);
    setProgress([]);
    setResult(null);
    setError(null);
    try {
      const res = await window.studio.exportProject(project.id);
      if (res.ok) setResult({ zipPath: res.zipPath, sha256: res.sha256 });
      else if (!res.cancelled) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      onBusyChange(false);
    }
  }

  return (
    <section>
      <div className="eyebrow page-eyebrow">STEP · 05 — EXPORT · WINDOWS X64</div>
      <h1>导出 Windows 便携包</h1>
      <p className="lead">
        导出一个不依赖任何开发环境的 Windows x64 便携 ZIP：解压后双击 EXE 即可运行桌宠。
        每次导出生成新文件，不会覆盖之前的产物。
      </p>

      <div className="card" style={{ maxWidth: 600 }}>
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

      {hasDraft && <div className="info-panel" role="status">
        <p>「{project.displayName}」有未保存的配置。请先保存或撤销修改，再导出。</p>
        <button className="btn" onClick={onEditConfig}>返回配置</button>
      </div>}
      <button className="btn btn-primary" disabled={running || hasDraft} onClick={() => void run()}>
        {running ? '导出中，请稍候…' : '选择导出位置并导出'}
      </button>

      {/* 导出等待玩具：符号流点阵。出现在原进度日志卡片位置（导出按钮下方），
          running 时挂载，导出完成后保留展示聚形终态；进度只来自已有的
          ExportProgressEvent 数组条数估算，不新增 IPC。 */}
      {visible && (running || result) && (
        <div style={{ maxWidth: 600, marginTop: 16 }}>
          <GlyphField
            key={exportRunId}
            progress={result ? 1 : Math.min(1, progress.length / EXPECTED_EXPORT_EVENTS)}
            done={result !== null}
          />
        </div>
      )}

      {result && (
        <div className="success-panel" style={{ maxWidth: 600 }}>
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
