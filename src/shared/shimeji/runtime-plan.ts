const MAX_NAME_LENGTH = 128;
export const MAX_RUNTIME_BEHAVIORS = 128;

export type ClassicRuntimeBehaviorKind = 'waiting' | 'wander' | 'review';

export interface ClassicRuntimeBehavior {
  name: string;
  kind: ClassicRuntimeBehaviorKind;
  weight: number;
  durationMs: number;
}

function safeRuntimeName(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value.length > MAX_NAME_LENGTH || /[\u0000-\u001f]/.test(value)) {
    throw new Error('经典运行行为名称无效');
  }
  return value;
}

/**
 * Validate the compact JSON behavior plan embedded in an exported pet pack.
 * This module deliberately has no XML parser dependency: the standalone pet
 * runtime only consumes the compiled plan and never reads classic Shimeji XML.
 */
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
    const name = safeRuntimeName(typeof value['name'] === 'string' ? value['name'] : undefined);
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
