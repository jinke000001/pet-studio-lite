import { app, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { validatePetPack, petPackToSpriteConfig, readSpritesheetDataUrl } from '../shared/petpack';
import { validatePetConfig, DEFAULT_PET_CONFIG } from '../shared/config';
import type { PetWindowPayload } from '../shared/types';
import { PetWindowHost } from './host';

/**
 * 导出的独立桌宠运行时（Windows/macOS 同一份代码）。
 *
 * - 完全离线：不发起任何网络请求。
 * - 宠物包与配置随包封装在 resources/petpack/，首次启动不下载任何东西。
 * - 自己的 userData 命名空间（pet-lite-pet），只存窗口位置与缩放。
 * - 右键菜单：缩放（bottom-center 锚点 + workArea 夹紧）、关于、真正退出。
 */

interface PetState {
  windowPosition: { x: number; y: number; displayId?: number } | null;
  zoom: number | null;
}

const stateFile = () => path.join(app.getPath('userData'), 'pet-state.json');

async function loadState(): Promise<PetState> {
  try {
    const raw = JSON.parse(await fs.readFile(stateFile(), 'utf8'));
    return {
      windowPosition: raw?.windowPosition ?? null,
      zoom: typeof raw?.zoom === 'number' && Number.isFinite(raw.zoom) ? raw.zoom : null,
    };
  } catch {
    return { windowPosition: null, zoom: null };
  }
}

async function saveState(patch: Partial<PetState>): Promise<void> {
  const cur = await loadState();
  const next = { ...cur, ...patch };
  try {
    await fs.mkdir(path.dirname(stateFile()), { recursive: true });
    await fs.writeFile(stateFile(), JSON.stringify(next, null, 2), 'utf8');
  } catch { /* 状态写失败不影响运行 */ }
}

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

  const persisted = await loadState();
  if (persisted.zoom != null) config.zoom = persisted.zoom;

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

  const host = new PetWindowHost({
    getPayload: async () => ({
      ...payload,
      config: { ...payload.config, zoom: (await loadState()).zoom ?? payload.config.zoom },
    }),
    preloadFile: path.join(__dirname, '../preload/petwin.js'),
    rendererUrl: `file://${path.join(__dirname, '../renderer/pet.html')}`,
    initialPosition: persisted.windowPosition,
    onPositionChange: (pos) => { void saveState({ windowPosition: pos }); },
    onZoomChange: (zoom) => { void saveState({ zoom }); },
    closeLabel: '👋  退出',
    onInfo: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: '关于这只宠物',
        message: config.petName,
        detail: [
          `包 id：${pack.id}`,
          `Petdex 版本：${pack.version}`,
          `授权状态：${pack.license}`,
          '由 Pet Studio Lite 导出 · 完全离线运行',
        ].join('\n'),
      });
    },
    onClosed: () => app.quit(),
  });

  await host.open();

  // 关掉窗口 = 真正退出进程（不驻留托盘）。
  app.on('window-all-closed', () => app.quit());
}
