import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import { ProjectsStore } from '../shared/projects';
import { validatePetPack, petPackToSpriteConfig, readSpritesheetDataUrl } from '../shared/petpack';
import { extractPetPackFromZip } from '../shared/zip';
import { requireObject, requireProjectId, requireEnum, IpcValidationError } from '../shared/ipc-validate';
import { validatePetConfig } from '../shared/config';
import { shouldQuitOnAllWindowsClosed } from '../shared/lifecycle';
import type { ImportResult, PreviewPayload, StudioState } from '../shared/types';
import { PetWindowHost } from '../pet/host';
import { exportWindowsZip } from './export-win';
import { sharpImageProbe } from './image-probe';

/**
 * Pet Studio Lite 制作台 main process。
 *
 * 完全离线、无账号、无遥测。不读 ~/.nom / ~/.codex / ~/.petdex 的任何
 * 状态；用户主动选择的宠物包只读导入副本，一切自有数据只写自己的
 * userData（app.setName('pet-studio-lite')）。
 */

app.setName('pet-studio-lite'); // 独立 userData 命名空间，须在读取 userData 之前
const store = new ProjectsStore(path.join(app.getPath('userData'), 'studio-data'));
let studioWindow: BrowserWindow | null = null;
let petPreview: PetWindowHost | null = null;
let exportInFlight = false;

/** 预览窗口被关闭（任何途径）时通知制作台，让按钮状态保持同步。 */
function notifyPreviewClosed(): void {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.webContents.send('studio:preview:closed');
  }
}

/**
 * 图集真实解码探针：PNG/WebP 全像素解码（sharp，见 image-probe.ts）。
 * Electron nativeImage 只支持 PNG/JPEG，会误杀合法 WebP，因此不再使用。
 */
const decodeProbe = sharpImageProbe;

function toStudioState(index: Awaited<ReturnType<ProjectsStore['load']>>): StudioState {
  return { index: index.index, recovered: index.recovered };
}

async function importFromPath(sourcePath: string): Promise<ImportResult> {
  // ZIP 先安全解压到临时目录再按目录校验；目录直接校验。
  // 校验失败或复制失败都不会留下半成品项目。
  let packDir = sourcePath;
  let tempDir: string | null = null;
  const isZip = sourcePath.toLowerCase().endsWith('.zip');
  try {
    let zipSha256: string | undefined;
    if (isZip) {
      // 记录原始 ZIP 的 SHA-256（来源追溯用），再做安全检查和解压
      zipSha256 = crypto.createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-import-'));
      await extractPetPackFromZip(sourcePath, tempDir);
      packDir = tempDir;
    }
    const result = await validatePetPack(packDir, { probe: decodeProbe });
    if (!result.ok) return { ok: false, errors: result.errors };
    const meta = await store.importValidatedPack(result.pack, {
      type: isZip ? 'zip' : 'dir',
      path: sourcePath,
      zipSha256,
    });
    return { ok: true, project: meta };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createWindow() {
  studioWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    title: 'Pet Studio Lite',
    backgroundColor: '#f6f7f9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/studio.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    studioWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    studioWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  studioWindow.on('closed', () => {
    studioWindow = null;
  });
}

function handleIpcError(err: unknown): never {
  if (err instanceof IpcValidationError) throw err;
  throw err instanceof Error ? err : new Error(String(err));
}

function registerIpc(): void {
  ipcMain.handle('studio:state', async () => toStudioState(await store.load()));

  ipcMain.handle('studio:import', async (_, rawKind: unknown): Promise<ImportResult> => {
    const kind = requireEnum(rawKind, '导入类型', ['dir', 'zip'] as const);
    const win = studioWindow;
    if (!win) return { ok: false, errors: ['窗口不可用'] };
    const picked = kind === 'dir'
      ? await dialog.showOpenDialog(win, { title: '选择宠物包目录', properties: ['openDirectory'] })
      : await dialog.showOpenDialog(win, {
          title: '选择宠物包 ZIP',
          properties: ['openFile'],
          filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
        });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, cancelled: true };
    return importFromPath(picked.filePaths[0]!);
  });

  ipcMain.handle('studio:select', async (_, rawId: unknown) => {
    const id = requireProjectId(rawId);
    await store.setCurrent(id);
    return toStudioState(await store.load());
  });

  ipcMain.handle('studio:remove', async (_, rawId: unknown) => {
    const id = requireProjectId(rawId);
    if (petPreview) {
      petPreview.close();
      petPreview = null;
    }
    await store.remove(id);
    return toStudioState(await store.load());
  });

  ipcMain.handle('studio:recheck', async (_, rawId: unknown) => {
    const id = requireProjectId(rawId);
    const meta = await store.get(id);
    if (!meta) return { ok: false, errors: ['项目不存在或已删除'] };
    const result = await validatePetPack(store.projectDir(id), { probe: decodeProbe });
    return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
  });

  ipcMain.handle('studio:preview-payload', async (_, rawId: unknown): Promise<PreviewPayload> => {
    const id = requireProjectId(rawId);
    const meta = await store.get(id);
    if (!meta) throw new Error('项目不存在或已删除');
    const result = await validatePetPack(store.projectDir(id), { probe: decodeProbe });
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return {
      sprite: petPackToSpriteConfig(result.pack),
      spritesheetDataUrl: await readSpritesheetDataUrl(result.pack),
      config: meta.config,
      license: result.pack.license,
      petdexVersion: result.pack.version,
    };
  });

  ipcMain.handle('studio:config:set', async (_, rawId: unknown, rawPatch: unknown) => {
    const id = requireProjectId(rawId);
    const patch = requireObject(rawPatch, '配置');
    // 先过共享校验器；非法值直接拒绝，不进存储、更进不了导出。
    const mergedPreview = validatePetConfig({ ...(await store.get(id))?.config, ...patch });
    if (!mergedPreview.ok) throw new IpcValidationError(mergedPreview.errors.join('；'));
    return store.updateConfig(id, patch);
  });

  ipcMain.handle('studio:preview:start', async (_, rawId: unknown) => {
    const id = requireProjectId(rawId);
    const meta = await store.get(id);
    if (!meta) return { ok: false, error: '项目不存在或已删除' };
    const result = await validatePetPack(store.projectDir(id), { probe: decodeProbe });
    if (!result.ok) return { ok: false, error: result.errors.join('\n') };
    const pack = result.pack;
    petPreview?.close();
    const host = new PetWindowHost({
      getPayload: async () => ({
        sprite: petPackToSpriteConfig(pack),
        spritesheetDataUrl: await readSpritesheetDataUrl(pack),
        config: meta.config,
        preview: true,
        petdexVersion: pack.version,
        license: pack.license,
      }),
      preloadFile: path.join(__dirname, '../preload/petwin.js'),
      rendererUrl: process.env['ELECTRON_RENDERER_URL']
        ? `${process.env['ELECTRON_RENDERER_URL']}/pet.html`
        : `file://${path.join(__dirname, '../renderer/pet.html')}`,
      closeLabel: '关闭预览',
      onInfo: () => {
        void dialog.showMessageBox({
          type: 'info',
          title: '关于这只宠物',
          message: meta.config.petName,
          detail: [
            `包 id：${pack.id}`,
            `Petdex 版本：${pack.version}`,
            `授权状态：${pack.license}`,
            '（这是工作室预览窗口）',
          ].join('\n'),
        });
      },
      onClosed: () => {
        // 任何关闭途径（制作台按钮 / 宠物右键菜单 / 系统关闭）都走到这里。
        // 用身份比较避免旧 host 的 closed 事件误清新 host。
        if (petPreview === host) petPreview = null;
        notifyPreviewClosed();
      },
    });
    petPreview = host;
    try {
      await host.open();
      return { ok: true };
    } catch (err) {
      if (petPreview === host) petPreview = null;
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('studio:preview:stop', () => {
    petPreview?.close();
    petPreview = null;
  });

  ipcMain.handle('studio:export', async (_, rawId: unknown) => {
    const id = requireProjectId(rawId);
    if (exportInFlight) return { ok: false as const, error: '已有导出任务进行中，请等待完成' };
    const meta = await store.get(id);
    if (!meta) return { ok: false as const, error: '项目不存在或已删除' };
    const win = studioWindow;
    if (!win) return { ok: false as const, error: '窗口不可用' };

    const picked = await dialog.showOpenDialog(win, {
      title: '选择导出位置（ZIP 将保存在该目录，不会覆盖已有文件）',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false as const, cancelled: true };

    exportInFlight = true;
    try {
      const outcome = await exportWindowsZip(meta, store.projectDir(id), picked.filePaths[0]!, {
        repoRoot: path.resolve(__dirname, '..', '..'),
        productVersion: app.getVersion(),
        onProgress: (phase, message) => {
          if (studioWindow && !studioWindow.isDestroyed()) {
            studioWindow.webContents.send('studio:export:progress', { phase, message });
          }
        },
      });
      return { ok: true as const, ...outcome };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    } finally {
      exportInFlight = false;
    }
  });

  ipcMain.handle('studio:export:reveal', async (_, rawPath: unknown) => {
    if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 4096) {
      throw new IpcValidationError('路径必须是字符串');
    }
    // 只放行真实存在且以 .zip 结尾的文件（受控目标，不开放任意路径）。
    if (!rawPath.endsWith('.zip')) throw new IpcValidationError('只允许打开导出产物 ZIP');
    await fs.stat(rawPath); // 不存在则抛错
    shell.showItemInFolder(rawPath);
  });
}

void app.whenReady().then(async () => {
  registerIpc();
  setupAppMenu();
  await createWindow();

  // macOS 习惯：关闭主窗口后应用保留在 Dock，点 Dock 图标（activate）
  // 重新创建并显示制作台窗口。userData 不被动，最近项目与配置自然保留。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    } else if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.show();
      studioWindow.focus();
    }
  });
});

// macOS：关窗口不退出（符合 Mac 应用习惯）；Windows/Linux：关最后窗口即退出。
app.on('window-all-closed', () => {
  if (shouldQuitOnAllWindowsClosed(process.platform)) app.quit();
});

/** 明确的应用菜单：包含"退出 Pet Studio Lite"。 */
function setupAppMenu(): void {
  if (process.platform !== 'darwin') return; // 其他平台用系统默认菜单/无菜单
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Pet Studio Lite',
      submenu: [
        { label: '关于 Pet Studio Lite', role: 'about' },
        { type: 'separator' },
        { label: '隐藏 Pet Studio Lite', role: 'hide' },
        { type: 'separator' },
        { label: '退出 Pet Studio Lite', role: 'quit', accelerator: 'Cmd+Q' },
      ],
    },
    { label: '编辑', role: 'editMenu' },
    { label: '窗口', role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

process.on('uncaughtException', (err) => {
  console.error('[pet-studio-lite] uncaught:', err);
});
