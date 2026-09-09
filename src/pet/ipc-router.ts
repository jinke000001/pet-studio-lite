/**
 * pet:* 全局 IPC 路由（无 Electron 依赖，Node 可直接单测）。
 *
 * pet:* 通道是进程级全局的：整个进程只注册一次，handler 通过 getActive()
 * 委托给"当前活动桌宠宿主"。这样反复 打开→关闭→再打开 预览、或切换项目
 * 后再打开，都不会重复注册 handler（Electron 对重复 ipcMain.handle 会直接
 * 抛错 —— 上一版预览只能开一次、第二次必崩，根因就在这里）。
 */

/** 生产环境 = ipcMain；测试注入假实现。 */
export interface PetIpcLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (event: any, ...args: any[]) => void): void;
}

/** 桌宠宿主暴露给 IPC 路由的最小接口。 */
export interface PetIpcTarget {
  getPayload(): Promise<unknown>;
  dragBegin(p: { x: number; y: number } | null): void;
  dragMove(p: { x: number; y: number } | null): void;
  dragEnd(): void;
  getBoundsInfo(): unknown;
  moveTo(x: number, y: number): void;
}

/** 每个 IPC 对象只注册一次（WeakSet：测试里每个假 ipc 互不影响）。 */
const registeredIpc = new WeakSet<PetIpcLike>();

/** pet:* 通道清单（测试用来断言"恰好注册这些通道、不多不少"）。 */
export const PET_IPC_HANDLE_CHANNELS = ['pet:payload', 'pet:window:bounds'] as const;
export const PET_IPC_ON_CHANNELS = ['pet:drag:begin', 'pet:drag:move', 'pet:drag:end', 'pet:window:moveTo'] as const;

function parsePoint(raw: unknown): { x: number; y: number } | null {
  const { x, y } = (raw ?? {}) as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x, y };
}

/** 注册 pet:* 全局通道（幂等）；handler 全部委托给 getActive() 的当前宿主。 */
export function registerPetIpc(ipc: PetIpcLike, getActive: () => PetIpcTarget | null): void {
  if (registeredIpc.has(ipc)) return;
  registeredIpc.add(ipc);

  ipc.handle('pet:payload', () => {
    const host = getActive();
    if (!host) throw new Error('桌宠窗口未打开');
    return host.getPayload();
  });

  ipc.on('pet:drag:begin', (_event: unknown, raw: unknown) => getActive()?.dragBegin(parsePoint(raw)));
  ipc.on('pet:drag:move', (_event: unknown, raw: unknown) => getActive()?.dragMove(parsePoint(raw)));
  ipc.on('pet:drag:end', () => getActive()?.dragEnd());

  ipc.handle('pet:window:bounds', () => getActive()?.getBoundsInfo() ?? null);
  ipc.on('pet:window:moveTo', (_event: unknown, raw: unknown) => {
    const p = parsePoint(raw);
    if (p) getActive()?.moveTo(p.x, p.y);
  });
}
