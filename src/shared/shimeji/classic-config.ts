import { SaxesParser, type SaxesTagPlain } from 'saxes';

const MAX_XML_BYTES = 1024 * 1024;
const MAX_ELEMENTS = 5_000;
const MAX_ACTIONS = 256;
const MAX_BEHAVIORS = 512;
const MAX_REFERENCES = 4_096;
const MAX_POSES = 4_096;
const MAX_DEPTH = 64;
const MAX_NAME_LENGTH = 128;
const MAX_RUNTIME_BEHAVIORS = 128;
const REQUIRED_NAMES = ['ChaseMouse', 'Fall', 'Dragged', 'Thrown'] as const;

export type ClassicActionKind = 'stand' | 'walk' | 'fall' | 'dragged' | 'thrown' | 'chase-mouse' | 'jump' | 'climb' | 'unknown';

export interface ClassicPose {
  /** 经典包内图片文件名；只允许单层 PNG basename。 */
  image: string;
  /** 非对称角色可显式提供朝右帧。 */
  imageRight: string | null;
  durationMs: number | null;
}

export interface ClassicAction {
  name: string;
  kind: ClassicActionKind;
  type: string;
  border: 'floor' | 'wall' | 'ceiling' | null;
  durationMs: number | null;
  references: string[];
  poses: ClassicPose[];
}

export interface ClassicBehaviorReference {
  name: string;
  frequency: number;
}

export interface ClassicBehavior {
  name: string;
  actionName: string;
  frequency: number;
  next: ClassicBehaviorReference[];
}

export interface ClassicShimejiProfile {
  actions: ClassicAction[];
  behaviors: ClassicBehavior[];
}

export type ClassicRuntimeBehaviorKind = 'waiting' | 'wander' | 'review';

export interface ClassicRuntimeBehavior {
  name: string;
  kind: ClassicRuntimeBehaviorKind;
  weight: number;
  durationMs: number;
}

export function parseClassicRuntimePlan(raw: unknown): ClassicRuntimeBehavior[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_RUNTIME_BEHAVIORS) {
    throw new Error(`classicBehaviorPlan 必须是 1–${MAX_RUNTIME_BEHAVIORS} 项数组`);
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`classicBehaviorPlan 第 ${index + 1} 项格式错误`);
    }
    const value = entry as Record<string, unknown>;
    const name = safeName(typeof value['name'] === 'string' ? value['name'] : undefined, '经典运行行为');
    const kind = value['kind'];
    if (kind !== 'waiting' && kind !== 'wander' && kind !== 'review') {
      throw new Error(`经典运行行为 ${name} 类型不支持`);
    }
    const weight = value['weight'];
    const durationMs = value['durationMs'];
    if (typeof weight !== 'number' || !Number.isInteger(weight) || weight <= 0 || weight > 1_000_000) {
      throw new Error(`经典运行行为 ${name} 权重无效`);
    }
    if (typeof durationMs !== 'number' || !Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 10_000) {
      throw new Error(`经典运行行为 ${name} 时长无效`);
    }
    return { name, kind, weight, durationMs };
  });
}

export type ClassicCompileResult =
  | { ok: true; profile: ClassicShimejiProfile; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

interface ParsedDocument {
  actions: ClassicAction[];
  behaviors: ClassicBehavior[];
  warnings: string[];
}

function localName(name: string): string {
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
}

function attr(tag: SaxesTagPlain, name: string): string | undefined {
  const direct = tag.attributes[name];
  if (direct !== undefined) return direct;
  const wanted = name.toLowerCase();
  const found = Object.entries(tag.attributes).find(([key]) => key.toLowerCase() === wanted);
  return found?.[1];
}

function safeName(raw: string | undefined, label: string): string {
  const value = raw?.trim() ?? '';
  if (!value || value.length > MAX_NAME_LENGTH || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label}名称无效`);
  }
  return value;
}

function safeImageName(raw: string | undefined, label: string): string {
  const value = raw?.trim().replace(/^\/+/, '') ?? '';
  if (!value || value.length > 255 || !/^[^/\\\u0000-\u001f]+\.png$/i.test(value)) {
    throw new Error(`${label}必须是单层 PNG 文件名`);
  }
  return value;
}

function literalNumber(raw: string | undefined, label: string, max: number): number | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`${label}包含不支持的动态表达式`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw new Error(`${label}超出安全范围`);
  return number;
}

function parseFrequency(raw: string | undefined, label: string): number {
  const value = literalNumber(raw, label, 1_000_000);
  if (value === null || !Number.isInteger(value)) throw new Error(`${label}必须是非负整数`);
  return value;
}

function borderKind(raw: string | undefined): ClassicAction['border'] {
  const value = raw?.toLowerCase();
  if (value === 'floor' || value === 'wall' || value === 'ceiling') return value;
  return null;
}

function inferActionKind(name: string, type: string, className: string | undefined, border: ClassicAction['border']): ClassicActionKind {
  const hint = `${name} ${className ?? ''}`.toLowerCase();
  if (hint.includes('dragged')) return 'dragged';
  if (hint.includes('thrown')) return 'thrown';
  if (hint.includes('chasemouse') || hint.includes('chase mouse')) return 'chase-mouse';
  if (hint.includes('fall')) return 'fall';
  if (hint.includes('climb')) return 'climb';
  if (hint.includes('jump')) return 'jump';
  if (hint.includes('walk') || (type.toLowerCase() === 'move' && border === 'floor')) return 'walk';
  if (hint.includes('stand') || type.toLowerCase() === 'pause' || type.toLowerCase() === 'fixed') return 'stand';
  return 'unknown';
}

function assertDocumentSafe(xml: string, label: string): void {
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) throw new Error(`${label}超过 1 MB 上限`);
  if (/<!DOCTYPE\b/i.test(xml)) throw new Error(`${label}禁止使用 DOCTYPE`);
  if (/<!ENTITY\b/i.test(xml)) throw new Error(`${label}禁止声明实体`);
}

function parseClassicDocument(xml: string, label: string): ParsedDocument {
  assertDocumentSafe(xml, label);
  const actions: ClassicAction[] = [];
  const behaviors: ClassicBehavior[] = [];
  const warnings: string[] = [];
  const stack: string[] = [];
  let elements = 0;
  let references = 0;
  let poses = 0;
  let currentAction: ClassicAction | null = null;
  let currentBehavior: ClassicBehavior | null = null;

  const parser = new SaxesParser({ xmlns: false, fileName: label });
  parser.on('doctype', () => { throw new Error(`${label}禁止使用 DOCTYPE`); });
  parser.on('opentag', (tag) => {
    elements += 1;
    if (elements > MAX_ELEMENTS) throw new Error(`${label}元素数量超过 ${MAX_ELEMENTS}`);
    const name = localName(tag.name);
    const parent = stack.at(-1);
    stack.push(name);
    if (stack.length > MAX_DEPTH) throw new Error(`${label}嵌套层级超过 ${MAX_DEPTH}`);

    if (name === 'Action' && parent === 'ActionList') {
      if (actions.length >= MAX_ACTIONS) throw new Error(`${label}动作数量超过 ${MAX_ACTIONS}`);
      const actionName = safeName(attr(tag, 'Name'), '动作');
      try {
        const type = safeName(attr(tag, 'Type'), `动作 ${actionName} 类型`);
        const border = borderKind(attr(tag, 'BorderType'));
        const duration = literalNumber(attr(tag, 'Duration'), `动作 ${actionName} Duration`, 86_400_000);
        currentAction = {
          name: actionName,
          kind: inferActionKind(actionName, type, attr(tag, 'Class'), border),
          type,
          border,
          durationMs: duration,
          references: [],
          poses: [],
        };
        actions.push(currentAction);
      } catch (error) {
        currentAction = null;
        warnings.push(`${actionName}：${error instanceof Error ? error.message : String(error)}，已跳过`);
      }
      return;
    }

    if (name === 'ActionReference' && currentAction) {
      references += 1;
      if (references > MAX_REFERENCES) throw new Error(`${label}引用数量超过 ${MAX_REFERENCES}`);
      currentAction.references.push(safeName(attr(tag, 'Name'), `动作 ${currentAction.name} 引用`));
      return;
    }

    if (name === 'Pose' && currentAction) {
      poses += 1;
      if (poses > MAX_POSES) throw new Error(`${label}姿势数量超过 ${MAX_POSES}`);
      try {
        const imageRightRaw = attr(tag, 'ImageRight');
        currentAction.poses.push({
          image: safeImageName(attr(tag, 'Image'), `动作 ${currentAction.name} Pose Image`),
          imageRight: imageRightRaw === undefined
            ? null
            : safeImageName(imageRightRaw, `动作 ${currentAction.name} Pose ImageRight`),
          durationMs: literalNumber(attr(tag, 'Duration'), `动作 ${currentAction.name} Pose Duration`, 86_400_000),
        });
      } catch (error) {
        warnings.push(`${currentAction.name} Pose：${error instanceof Error ? error.message : String(error)}，已跳过`);
      }
      return;
    }

    if (name === 'Behavior' && parent === 'BehaviorList') {
      if (behaviors.length >= MAX_BEHAVIORS) throw new Error(`${label}行为数量超过 ${MAX_BEHAVIORS}`);
      const behaviorName = safeName(attr(tag, 'Name'), '行为');
      try {
        const condition = attr(tag, 'Condition');
        if (condition !== undefined && !/^(?:true|false)$/i.test(condition.trim())) {
          throw new Error('Condition 包含不支持的动态表达式');
        }
        currentBehavior = {
          name: behaviorName,
          actionName: safeName(attr(tag, 'Action') ?? behaviorName, `行为 ${behaviorName} Action`),
          frequency: parseFrequency(attr(tag, 'Frequency'), `行为 ${behaviorName} Frequency`),
          next: [],
        };
        behaviors.push(currentBehavior);
      } catch (error) {
        currentBehavior = null;
        warnings.push(`${behaviorName}：${error instanceof Error ? error.message : String(error)}，已跳过`);
      }
      return;
    }

    if (name === 'BehaviorReference' && currentBehavior) {
      references += 1;
      if (references > MAX_REFERENCES) throw new Error(`${label}引用数量超过 ${MAX_REFERENCES}`);
      const referenceName = safeName(attr(tag, 'Name'), `行为 ${currentBehavior.name} 引用`);
      try {
        currentBehavior.next.push({
          name: referenceName,
          frequency: parseFrequency(attr(tag, 'Frequency'), `行为引用 ${referenceName} Frequency`),
        });
      } catch (error) {
        warnings.push(`${referenceName}：${error instanceof Error ? error.message : String(error)}，已跳过`);
      }
    }
  });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 'Action' && stack.at(-2) === 'ActionList') currentAction = null;
    if (name === 'Behavior' && stack.at(-2) === 'BehaviorList') currentBehavior = null;
    stack.pop();
  });
  parser.write(xml).close();
  return { actions, behaviors, warnings };
}

export function compileClassicShimeji(actionsXml: string, behaviorsXml: string): ClassicCompileResult {
  const warnings: string[] = [];
  try {
    const actionDocument = parseClassicDocument(actionsXml, 'actions.xml');
    const behaviorDocument = parseClassicDocument(behaviorsXml, 'behaviors.xml');
    warnings.push(...actionDocument.warnings, ...behaviorDocument.warnings);
    const actions = actionDocument.actions;
    const behaviors = behaviorDocument.behaviors;
    const actionNames = new Set(actions.map((action) => action.name));
    const behaviorNames = new Set(behaviors.map((behavior) => behavior.name));
    const errors: string[] = [];

    if (actionNames.size !== actions.length) errors.push('动作名称不能重复');
    if (behaviorNames.size !== behaviors.length) errors.push('行为名称不能重复');

    for (const required of REQUIRED_NAMES) {
      if (!actionNames.has(required)) errors.push(`缺少必备动作 ${required}`);
      if (!behaviorNames.has(required)) errors.push(`缺少必备行为 ${required}`);
    }
    for (const behavior of behaviors) {
      if (!actionNames.has(behavior.actionName)) errors.push(`行为 ${behavior.name} 引用了不存在的动作 ${behavior.actionName}`);
      behavior.next = behavior.next.filter((reference) => {
        if (behaviorNames.has(reference.name)) return true;
        warnings.push(`行为 ${behavior.name} 的后继 ${reference.name} 不存在，已忽略`);
        return false;
      });
    }
    for (const action of actions) {
      action.references = action.references.filter((reference) => {
        if (actionNames.has(reference)) return true;
        warnings.push(`动作 ${action.name} 的引用 ${reference} 不存在，已忽略`);
        return false;
      });
    }
    if (errors.length > 0) return { ok: false, errors, warnings };
    return { ok: true, profile: { actions, behaviors }, warnings };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], warnings };
  }
}

/**
 * Reduce the broad classic action model to automatic behaviors this runtime can
 * execute safely. Physical Fall/Dragged/Thrown/Jump/Climb actions are excluded:
 * terrain physics and direct pointer interaction own those transitions.
 */
export function compileClassicRuntimePlan(profile: ClassicShimejiProfile): ClassicRuntimeBehavior[] {
  const actions = new Map(profile.actions.map((action) => [action.name, action]));
  const resolvedKinds = new Map<string, ClassicActionKind>();
  const resolveKind = (action: ClassicAction, visiting = new Set<string>()): ClassicActionKind => {
    const cached = resolvedKinds.get(action.name);
    if (cached) return cached;
    if (visiting.has(action.name)) return 'unknown';
    if (action.kind !== 'unknown') {
      resolvedKinds.set(action.name, action.kind);
      return action.kind;
    }
    const nextVisiting = new Set(visiting).add(action.name);
    for (const reference of action.references) {
      const next = actions.get(reference);
      if (!next) continue;
      const kind = resolveKind(next, nextVisiting);
      if (kind !== 'unknown') {
        resolvedKinds.set(action.name, kind);
        return kind;
      }
    }
    resolvedKinds.set(action.name, 'unknown');
    return 'unknown';
  };
  const resolvedDurations = new Map<string, number>();
  const durationOf = (action: ClassicAction, visiting = new Set<string>()): number => {
    const cached = resolvedDurations.get(action.name);
    if (cached !== undefined) return cached;
    if (visiting.has(action.name)) return 0;
    const nextVisiting = new Set(visiting).add(action.name);
    let duration = action.poses.reduce((sum, pose) => Math.min(10_000, sum + (pose.durationMs ?? 0)), 0)
      || action.durationMs
      || 0;
    for (const reference of action.references) {
      const next = actions.get(reference);
      if (next) duration = Math.min(10_000, duration + durationOf(next, nextVisiting));
      if (duration >= 10_000) break;
    }
    resolvedDurations.set(action.name, duration);
    return duration;
  };
  const kindMap: Partial<Record<ClassicActionKind, ClassicRuntimeBehaviorKind>> = {
    stand: 'waiting',
    walk: 'wander',
    'chase-mouse': 'wander',
    unknown: 'review',
  };
  const plan: ClassicRuntimeBehavior[] = [];
  for (const behavior of profile.behaviors) {
    if (plan.length >= MAX_RUNTIME_BEHAVIORS) break;
    if (behavior.frequency <= 0) continue;
    const action = actions.get(behavior.actionName);
    if (!action) continue;
    const kind = kindMap[resolveKind(action)];
    if (!kind) continue;
    const rawDuration = durationOf(action);
    plan.push({
      name: behavior.name,
      kind,
      weight: behavior.frequency,
      durationMs: Math.max(kind === 'wander' ? 3_000 : 1_000, Math.min(10_000, rawDuration || (kind === 'review' ? 6_000 : 4_000))),
    });
  }
  return plan;
}

/** Select from the current behavior's successors, or from the root weighted list. */
export function selectClassicBehavior(
  profile: ClassicShimejiProfile,
  random: number,
  currentBehavior?: string,
): ClassicBehavior | null {
  const current = currentBehavior
    ? profile.behaviors.find((behavior) => behavior.name === currentBehavior)
    : undefined;
  const candidates = current?.next.length
    ? current.next.map((reference) => ({ behavior: profile.behaviors.find((item) => item.name === reference.name), weight: reference.frequency }))
    : profile.behaviors.map((behavior) => ({ behavior, weight: behavior.frequency }));
  const valid = candidates.filter((candidate): candidate is { behavior: ClassicBehavior; weight: number } => (
    candidate.behavior !== undefined && candidate.weight > 0
  ));
  const total = valid.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return null;
  let cursor = Math.min(0.999999999, Math.max(0, Number.isFinite(random) ? random : 0)) * total;
  for (const candidate of valid) {
    cursor -= candidate.weight;
    if (cursor < 0) return candidate.behavior;
  }
  return valid.at(-1)?.behavior ?? null;
}
