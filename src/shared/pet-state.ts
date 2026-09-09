import type { PetRuntimeConfig } from './config';

/**
 * 桌宠运行时的持久化状态（userData/pet-state.json）解析与合并
 * （纯函数，Node 可测，不依赖 Electron）。
 *
 * 状态文件属于"可能含任意内容的用户数据"：逐字段验证，坏字段丢弃为 null
 * （= 回落到随包配置），坏数据永远不进入运行时。
 */

export interface PersistedPetState {
  /** 上次退出时的窗口位置；null = 用屏幕右下角默认位。 */
  windowPosition: { x: number; y: number; displayId?: number } | null;
  /** 用户通过右键菜单调整的缩放；null = 用随包配置。 */
  zoom: number | null;
  /** 用户通过右键菜单调整的"自动游走"开关；null = 用随包配置。 */
  wanderEnabled: boolean | null;
}

export function parsePersistedPetState(raw: unknown): PersistedPetState {
  const o = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    windowPosition: parsePosition(o['windowPosition']),
    zoom: typeof o['zoom'] === 'number' && Number.isFinite(o['zoom']) ? o['zoom'] : null,
    wanderEnabled: typeof o['wanderEnabled'] === 'boolean' ? o['wanderEnabled'] : null,
  };
}

function parsePosition(raw: unknown): PersistedPetState['windowPosition'] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['x'] !== 'number' || !Number.isFinite(o['x'])) return null;
  if (typeof o['y'] !== 'number' || !Number.isFinite(o['y'])) return null;
  const pos: { x: number; y: number; displayId?: number } = { x: o['x'], y: o['y'] };
  if (typeof o['displayId'] === 'number' && Number.isFinite(o['displayId'])) pos.displayId = o['displayId'];
  return pos;
}

/**
 * 合并顺序：随包配置（导出时写入）< 用户持久化调整。
 * 只覆盖用户实际改过的字段（null = 没改过，保留随包值）。
 */
export function applyPersistedPetState(config: PetRuntimeConfig, persisted: PersistedPetState): PetRuntimeConfig {
  return {
    ...config,
    zoom: persisted.zoom ?? config.zoom,
    wanderEnabled: persisted.wanderEnabled ?? config.wanderEnabled,
  };
}
