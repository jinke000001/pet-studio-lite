/**
 * pet:* 全局 IPC 路由（无 Electron 依赖，Node 可直接单测）。
 *
 * pet:* 通道是进程级全局的：整个进程只注册一次，handler 通过发送方的
 * webContents id 找到所属宿主。这样既不会重复注册 handler，也能让多个
 * 桌宠并存而不把 payload、拖拽或尺寸控制命令串到“最后打开”的宠物。
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
  getSizeControlState(): { zoom: number; min: number; max: number; step: number; persistent: boolean };
  ownsSizeControlSender(senderId: number): boolean;
  setZoom(zoom: number): void;
  closeSizeControl(): void;
}

export type PetIpcSenderKind = 'pet' | 'size-control';
export type ResolvePetIpcTarget = (senderId: number, kind: PetIpcSenderKind) => PetIpcTarget | null;

/** 每个 IPC 对象只注册一次（WeakSet：测试里每个假 ipc 互不影响）。 */
const registeredIpc = new WeakSet<PetIpcLike>();

/** pet:* 通道清单（测试用来断言"恰好注册这些通道、不多不少"）。 */
export const PET_IPC_HANDLE_CHANNELS = [
  'pet:payload',
  'pet:window:bounds',
  'pet:size-control:state',
] as const;
export const PET_IPC_ON_CHANNELS = [
  'pet:drag:begin',
  'pet:drag:move',
  'pet:drag:end',
  'pet:window:moveTo',
  'pet:size-control:set-zoom',
  'pet:size-control:close',
] as const;

function parsePoint(raw: unknown): { x: number; y: number } | null {
  const { x, y } = (raw ?? {}) as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x, y };
}

function senderIdOf(event: unknown): number | null {
  const id = (event as { sender?: { id?: unknown } } | null)?.sender?.id;
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 ? id : null;
}

function targetFor(event: unknown, kind: PetIpcSenderKind, resolveTarget: ResolvePetIpcTarget): PetIpcTarget | null {
  const senderId = senderIdOf(event);
  return senderId === null ? null : resolveTarget(senderId, kind);
}

/** 注册 pet:* 全局通道（幂等）；handler 全部按发送窗口委托给所属宿主。 */
export function registerPetIpc(ipc: PetIpcLike, resolveTarget: ResolvePetIpcTarget): void {
  if (registeredIpc.has(ipc)) return;
  registeredIpc.add(ipc);

  ipc.handle('pet:payload', (event: unknown) => {
    const host = targetFor(event, 'pet', resolveTarget);
    if (!host) throw new Error('桌宠窗口未打开');
    return host.getPayload();
  });

  ipc.on('pet:drag:begin', (event: unknown, raw: unknown) => targetFor(event, 'pet', resolveTarget)?.dragBegin(parsePoint(raw)));
  ipc.on('pet:drag:move', (event: unknown, raw: unknown) => targetFor(event, 'pet', resolveTarget)?.dragMove(parsePoint(raw)));
  ipc.on('pet:drag:end', (event: unknown) => targetFor(event, 'pet', resolveTarget)?.dragEnd());

  ipc.handle('pet:window:bounds', (event: unknown) => targetFor(event, 'pet', resolveTarget)?.getBoundsInfo() ?? null);
  ipc.on('pet:window:moveTo', (event: unknown, raw: unknown) => {
    const p = parsePoint(raw);
    if (p) targetFor(event, 'pet', resolveTarget)?.moveTo(p.x, p.y);
  });

  ipc.handle('pet:size-control:state', (event: unknown) => {
    const senderId = senderIdOf(event);
    const host = targetFor(event, 'size-control', resolveTarget);
    if (!host || typeof senderId !== 'number' || !host.ownsSizeControlSender(senderId)) {
      throw new Error('无权访问宠物尺寸面板');
    }
    return host.getSizeControlState();
  });
  ipc.on('pet:size-control:set-zoom', (event: unknown, raw: unknown) => {
    const senderId = senderIdOf(event);
    const host = targetFor(event, 'size-control', resolveTarget);
    if (!host || typeof senderId !== 'number' || !host.ownsSizeControlSender(senderId)) return;
    if (typeof raw === 'number' && Number.isFinite(raw)) host.setZoom(raw);
  });
  ipc.on('pet:size-control:close', (event: unknown) => {
    const senderId = senderIdOf(event);
    const host = targetFor(event, 'size-control', resolveTarget);
    if (host && typeof senderId === 'number' && host.ownsSizeControlSender(senderId)) host.closeSizeControl();
  });
}
