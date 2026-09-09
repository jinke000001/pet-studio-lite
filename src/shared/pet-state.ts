import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeZoom, type PetRuntimeConfig } from './config';

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
  /** 用户通过右键菜单调整的缩放；null = 用随包配置。旧档 50%/75%/100% 读取时迁移为 125%。 */
  zoom: number | null;
  /** 用户通过右键菜单调整的"自动游走"开关；null = 用随包配置。 */
  wanderEnabled: boolean | null;
}

export function parsePersistedPetState(raw: unknown): PersistedPetState {
  const o = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    windowPosition: parsePosition(o['windowPosition']),
    zoom: normalizeZoom(o['zoom']),
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

/** 读取并解析状态文件；文件缺失/损坏/含坏字段时回落全 null（坏数据容错）。 */
export async function loadPetState(file: string): Promise<PersistedPetState> {
  try {
    return parsePersistedPetState(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return parsePersistedPetState(undefined);
  }
}

/**
 * 运行时状态存储：单一内存状态 + 串行原子写盘。
 *
 * 修复"读取旧状态后覆盖写入"的并发丢失（zoom / wanderEnabled /
 * windowPosition 三路回调并发时旧实现会 read-modify-write 同一个文件）：
 * - 更新先落在内存（后写即所见，永远不会丢失字段）；
 * - 落盘请求排成 Promise 链串行执行，每次写"临时文件 + rename"保证原子性
 *   （读者不会看到写了一半的文件）；
 * - 写失败只吞掉不抛出 —— 状态写失败不影响运行，内存状态仍是准的。
 */
export class PetStateStore {
  private state: PersistedPetState;
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly file: string,
    initial: PersistedPetState,
  ) {
    this.state = initial;
  }

  static async load(file: string): Promise<PetStateStore> {
    return new PetStateStore(file, await loadPetState(file));
  }

  /** 当前状态（内存为唯一事实来源）。 */
  get current(): PersistedPetState {
    return this.state;
  }

  /** 合并补丁并排队落盘；返回本次落盘完成的 Promise。 */
  update(patch: Partial<PersistedPetState>): Promise<void> {
    this.state = { ...this.state, ...patch };
    const snapshot = this.state;
    this.queue = this.queue.then(() => writeFileAtomic(this.file, snapshot));
    return this.queue;
  }

  /** 关闭/退出前调用：等待所有已排队的写入完成（始终会 resolve）。 */
  flush(): Promise<void> {
    return this.queue;
  }
}

/** 原子写：先写同目录临时文件再 rename（同卷 rename 原子），失败静默。 */
async function writeFileAtomic(file: string, state: PersistedPetState): Promise<void> {
  const tmp = `${file}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, file);
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
