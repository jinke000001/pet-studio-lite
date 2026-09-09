/**
 * main process 的 IPC 入参运行时校验器（纯函数，Node 可测）。
 * TypeScript 类型只在编译期存在；renderer 传来的任何东西都必须在这里
 * 重新验证 —— 路径、枚举、字符串长度、boolean、有限数字、对象形状。
 */

export class IpcValidationError extends Error {}

export function fail(message: string): never {
  throw new IpcValidationError(message);
}

export function requireObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(`${what}必须是对象`);
  }
  return raw as Record<string, unknown>;
}

export function requireString(raw: unknown, what: string, maxLen = 4096): string {
  if (typeof raw !== 'string') fail(`${what}必须是字符串`);
  if (raw.length === 0) fail(`${what}不能为空`);
  if (raw.length > maxLen) fail(`${what}过长（>${maxLen} 字符）`);
  return raw;
}

export function requireBoolean(raw: unknown, what: string): boolean {
  if (typeof raw !== 'boolean') fail(`${what}必须是布尔值`);
  return raw;
}

export function requireFiniteNumber(raw: unknown, what: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`${what}必须是有限数字`);
  if (raw < min || raw > max) fail(`${what}超出范围（${min}–${max}）`);
  return raw;
}

export function requireEnum<T extends string>(raw: unknown, what: string, allowed: readonly T[]): T {
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    fail(`${what}必须是 ${allowed.join(' / ')} 之一`);
  }
  return raw as T;
}

/**
 * 校验项目 id：只允许我们生成的形态（小写字母数字与连字符），
 * 防止路径拼接逃逸。
 */
export function requireProjectId(raw: unknown): string {
  const s = requireString(raw, '项目 id', 128);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) fail('项目 id 格式非法');
  return s;
}
