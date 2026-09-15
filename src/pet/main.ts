import { app, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { validatePetPack, petPackToSpriteConfig, readSpritesheetDataUrl } from '../shared/petpack';
import { validatePetConfig, DEFAULT_PET_CONFIG } from '../shared/config';
import { PetStateStore, applyPersistedPetState } from '../shared/pet-state';
import type { PetWindowPayload } from '../shared/types';
import { PetWindowHost } from './host';

export const MAX_PET_COUNT = 8;
const PET_CASCADE_X = 48;
const PET_CASCADE_Y = -32;

/**
 * 导出的独立桌宠运行时（Windows/macOS 同一份代码）。
 *
 * - 完全离线：不发起任何网络请求。
 * - 宠物包与配置随包封装在 resources/petpack/，首次启动不下载任何东西。
 * - 自己的 userData 命名空间（pet-lite-pet），只存窗口位置、缩放与"自动游走"开关。
 * - 右键菜单：自动游走、召唤分身（最多 8 只）、连续尺寸滑杆、复位、
 *   关闭单只与退出全部；第二次启动同一程序也会召唤分身。
 * - 状态写盘：单一内存状态 + 串行原子写（PetStateStore），退出前先 flush。
 */

const stateFile = () => path.join(app.getPath('userData'), 'pet-state.json');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
} else {
  void main();
}

async function main() {
  // 独立 userData 命名空间（不沿用任何其他产品）。
  app.setName('pet-lite-pet');
  await app.whenReady();
  if (process.platform === 'darwin') app.dock?.hide();

  // 生产：读随包封装的 resources/petpack；PET_PACK_DIR 供 macOS 实测/开发覆盖。
  const packDir = process.env['PET_PACK_DIR']?.trim() || path.join(process.resourcesPath, 'petpack');
  const result = await validatePetPack(packDir);
  if (!result.ok) {
    dialog.showErrorBox('桌宠包损坏', result.errors.join('\n'));
    app.exit(1);
    return;
  }
  const pack = result.pack;

  let config = { ...DEFAULT_PET_CONFIG };
  try {
    const rawConfig = JSON.parse(await fs.readFile(path.join(packDir, 'config.json'), 'utf8'));
    const checked = validatePetConfig(rawConfig);
    if (checked.ok) config = checked.config;
  } catch { /* 没有随包配置时用默认值 */ }

  const stateStore = await PetStateStore.load(stateFile());
  const persisted = stateStore.current;
  // 合并顺序：随包配置 < 用户持久化调整（只覆盖用户实际改过的字段）。
  config = applyPersistedPetState(config, persisted);

  // 退出前把防抖待写的位置/开关落盘完成后再真正退出（onClosed 与
  // window-all-closed 都会走到这里，幂等）。
  let quitting = false;
  const quitAfterFlush = (): void => {
    if (quitting) return;
    quitting = true;
    void stateStore.flush().finally(() => app.quit());
  };

  const spritesheetDataUrl = await readSpritesheetDataUrl(pack);
  const sprite = petPackToSpriteConfig(pack);
  const payload: PetWindowPayload = {
    sprite,
    spritesheetDataUrl,
    config,
    preview: false,
    petdexVersion: pack.version,
    license: pack.license,
  };

  const hosts = new Set<PetWindowHost>();

  const spawnPet = async (source: PetWindowHost | null = null): Promise<void> => {
    if (quitting || hosts.size >= MAX_PET_COUNT) return;
    const sourceBounds = source?.window && !source.window.isDestroyed()
      ? source.window.getBounds()
      : null;
    const isPrimary = hosts.size === 0;
    const initialPosition = sourceBounds
      ? { x: sourceBounds.x + PET_CASCADE_X, y: sourceBounds.y + PET_CASCADE_Y }
      : isPrimary ? persisted.windowPosition : null;

    let host!: PetWindowHost;
    host = new PetWindowHost({
      getPayload: async () => ({
        ...payload,
        config: applyPersistedPetState(payload.config, stateStore.current),
      }),
      preloadFile: path.join(__dirname, '../preload/petwin.js'),
      rendererUrl: `file://${path.join(__dirname, '../renderer/pet.html')}`,
      sizeControlPreloadFile: path.join(__dirname, '../preload/sizeControl.js'),
      sizeControlRendererUrl: `file://${path.join(__dirname, '../renderer/size-control.html')}`,
      initialPosition,
      // 只让首只宠物维护下次启动位置，临时召唤的分身不会覆盖主位置。
      onPositionChange: isPrimary ? (pos) => { void stateStore.update({ windowPosition: pos }); } : undefined,
      onZoomChange: (zoom) => { void stateStore.update({ zoom }); },
      onWanderChange: (enabled) => { void stateStore.update({ wanderEnabled: enabled }); },
      closeLabel: '✕  关闭这只宠物',
      canSpawn: () => hosts.size < MAX_PET_COUNT,
      onSpawn: () => {
        void spawnPet(host).catch((error) => console.error('[pet] spawn failed:', error));
      },
      onQuit: () => quitAfterFlush(),
      onInfo: () => {
        void dialog.showMessageBox({
          type: 'info',
          title: '关于这只宠物',
          message: config.petName,
          detail: [
            `包 id：${pack.id}`,
            `Petdex 版本：${pack.version}`,
            `授权状态：${pack.license}`,
            `当前数量：${hosts.size} / ${MAX_PET_COUNT}`,
            '由 Pet Studio Lite 导出 · 完全离线运行',
          ].join('\n'),
        });
      },
      onClosed: () => {
        hosts.delete(host);
        if (hosts.size === 0) quitAfterFlush();
      },
    });
    hosts.add(host);
    try {
      await host.open();
    } catch (error) {
      hosts.delete(host);
      host.close();
      throw error;
    }
  };

  app.on('second-instance', () => {
    const source = [...hosts].at(-1) ?? null;
    void spawnPet(source).catch((error) => console.error('[pet] second-instance spawn failed:', error));
  });

  await spawnPet();

  // 关掉窗口 = 真正退出进程（不驻留托盘）；退出前先 flush 状态写盘。
  app.on('window-all-closed', () => quitAfterFlush());
}
