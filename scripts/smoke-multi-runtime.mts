// 导出运行时的真实 Electron 多宠物烟测（macOS 可执行，Windows 最终复验）。
// 运行：先 npm run build:pet，再把本文件 bundle 为 CJS 后交给 Electron。
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.resolve(__dirname, '..');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

async function waitForWindowCount(expected: number, timeoutMs = 8_000): Promise<BrowserWindow[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    if (windows.length === expected) return windows;
    await sleep(100);
  }
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
}

async function main(): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-multi-smoke-'));
  app.setPath('userData', path.join(tempRoot, 'user-data'));
  process.env['PET_PACK_DIR'] = path.join(REPO, 'assets/fixtures/pack-v1-webp');

  const require = createRequire(__filename);
  require(path.join(REPO, 'out-pet/main/main.js'));

  let windows = await waitForWindowCount(1);
  check('导出运行时启动一只宠物', windows.length === 1, `count=${windows.length}`);
  if (windows[0]) {
    const petId = await windows[0].webContents.executeJavaScript('window.pet.getPayload().then(p => p.sprite.id)');
    check('首只宠物 preload/IPC/payload 可用', petId === 'demo-bird', String(petId));
  }

  app.emit('second-instance', {} as never, [] as never, process.cwd(), {} as never);
  windows = await waitForWindowCount(2);
  check('第二次启动请求召唤另一只宠物', windows.length === 2, `count=${windows.length}`);
  const ids = await Promise.all(windows.map((window) => (
    window.webContents.executeJavaScript('window.pet.getPayload().then(p => p.sprite.id)')
  )));
  check('两只宠物各自的 IPC 路由都可用', ids.every((id) => id === 'demo-bird'), ids.join(','));

  windows[0]?.close();
  windows = await waitForWindowCount(1);
  check('关闭其中一只不会退出剩余宠物', windows.length === 1, `count=${windows.length}`);

  for (let i = 0; i < 12; i += 1) {
    app.emit('second-instance', {} as never, [] as never, process.cwd(), {} as never);
  }
  windows = await waitForWindowCount(8);
  check('并发召唤严格限制为最多八只', windows.length === 8, `count=${windows.length}`);
  const cappedIds = await Promise.all(windows.map((window) => (
    window.webContents.executeJavaScript('window.pet.getPayload().then(p => p.sprite.id)')
  )));
  check('八只宠物全部完成加载且 IPC 可用', cappedIds.every((id) => id === 'demo-bird'));
  await sleep(300);

  console.log(`\n多宠物冒烟结果：${passed} 通过，${failed} 失败`);
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  app.exit(failed > 0 ? 1 : 0);
}

process.on('uncaughtException', (error) => {
  console.error('多宠物冒烟未捕获异常：', error);
  app.exit(2);
});

void main();
