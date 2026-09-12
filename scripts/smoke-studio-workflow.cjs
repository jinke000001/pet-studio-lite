// Real Electron workbench regression. Only file dialogs and explicit IPC faults
// are controlled; imports, storage, preload, React and previews are production.
// Build first, then: node scripts/run-studio-smoke.mjs
const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
let picked = null;
const faults = new Map();
const checks = [];
const rendererErrors = [];
setTimeout(() => { console.error('Workbench regression exceeded time budget'); app.exit(2); }, process.env.STUDIO_SMOKE_EXPORT ? 600000 : 90000).unref();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, (...args) => {
  const fault = faults.get(channel);
  return fault ? fault(...args) : handler(...args);
});
dialog.showOpenDialog = async () => picked
  ? { canceled: false, filePaths: [picked] }
  : { canceled: true, filePaths: [] };
const js = code => Promise.race([
  win.webContents.executeJavaScript(code, true),
  pause(15000).then(() => { throw new Error(`Renderer did not respond: ${code}`); }),
]);
async function waitFor(code, timeout = 10000) {
  const start = Date.now();
  while (!(await js(code))) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${code}`);
    await pause(40);
  }
}
async function check(name, condition) {
  const ok = !!(await condition);
  const detail = !ok && win ? await js("[...document.querySelectorAll('.error-panel')].map(e => e.textContent).join(' | ')") : '';
  checks.push({ name, ok, ...(detail ? { detail } : {}) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (detail) console.error(detail);
}
async function click(text, selector = 'button') {
  await js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('Missing button: ' + ${JSON.stringify(text)}); b.click(); })()`);
  await pause(120);
}
async function step(index) {
  await js(`document.querySelectorAll('.step-btn')[${index}].click()`);
  await pause(150);
}
async function input(selector, value) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await pause(80);
}

async function main() {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-workflow-'));
  app.setPath('userData', path.join(work, 'userData'));
  app.on('web-contents-created', (_, contents) => {
    contents.on('console-message', (_, level, message) => {
      if (level >= 3) rendererErrors.push(message);
    });
  });
  require(path.join(root, 'out/main/index.js'));
  await app.whenReady();
  await check('App identity uses the product version', app.getVersion() === require(path.join(root, 'package.json')).version);
  while (!BrowserWindow.getAllWindows().length) await pause(20);
  win = BrowserWindow.getAllWindows()[0];
  await waitFor("!!document.querySelector('.import-actions')");
  const samples = process.env.STUDIO_SMOKE_SAMPLES
    ? JSON.parse(process.env.STUDIO_SMOKE_SAMPLES)
    : ['pack-v1-webp', 'pack-v2-webp', 'classic-shimeji-test'].map(name => path.join(root, 'assets/fixtures', name));
  picked = path.join(root, 'assets/fixtures/pack-bad-size');
  await js("document.querySelector('.import-actions button').click()");
  await waitFor("!!document.querySelector('.error-panel')");
  await check('Invalid import leaves no partial project', (await js('window.studio.getState()')).index.projects.length === 0);
  picked = null;
  await js("document.querySelector('.import-actions button').click()");
  await pause(150);
  await check('Cancelling file selection clears stale errors', js("!document.querySelector('.error-panel')"));
  const imported = [];
  for (const sample of samples) {
    await step(0);
    picked = sample;
    await js(`document.querySelectorAll('.import-actions button')[${sample.endsWith('.zip') ? 1 : 0}].click()`);
    await waitFor("document.querySelector('h1')?.textContent.startsWith('检查')");
    await waitFor("![...document.querySelectorAll('.check-state')].some(e => e.textContent.includes('检查中'))");
    const state = await js('window.studio.getState()');
    const project = state.index.projects.find(p => p.id === state.index.currentProjectId);
    imported.push(project);
    await check(`${path.basename(sample)} imported and validated`, js("!document.querySelector('.error-panel')"));
    await step(2);
    await waitFor("!!document.querySelector('.preview-stage .sprite')");
    await click('暂停');
    const beforeStep = await js("document.querySelector('[aria-label=\"当前帧\"]').textContent.match(/[0-9]+/g).map(Number)");
    await js("document.querySelector('[aria-label=\"下一帧\"]').click()");
    await pause(100);
    await check(`${path.basename(sample)} next frame advances exactly once`, js(`parseInt(document.querySelector('[aria-label=\"当前帧\"]').textContent) === ${(beforeStep[0] % beforeStep[1]) + 1}`));
    const frameBefore = await js("document.querySelector('.preview-stage .sprite').style.backgroundPosition");
    await pause(250);
    await check(`${path.basename(sample)} manual frame stays paused`, js(`document.querySelector('.preview-stage .sprite').style.backgroundPosition === ${JSON.stringify(frameBefore)}`));
    await click('行走', '.chip');
    await js("document.querySelector('[aria-label=\"预览朝向\"]').value = 'left'; document.querySelector('[aria-label=\"预览朝向\"]').dispatchEvent(new Event('change', { bubbles: true }))");
    await pause(100);
    await check(`${path.basename(sample)} left walking uses its own atlas row`, js("document.querySelector('.preview-stage .sprite').style.backgroundPosition.endsWith('-332.8px')"));
    const actions = await js("[...document.querySelectorAll('.chip')].map(b => b.textContent)");
    for (const action of actions) {
      await click(action, '.chip');
      await check(`${path.basename(sample)} action ${action} selects a finite atlas position`, js("!document.querySelector('.preview-stage .sprite').style.backgroundPosition.includes('NaN')"));
    }
    await click('待机', '.chip');
    await fs.writeFile(path.join(work, `sample-${imported.length}.png`), (await win.webContents.capturePage(undefined, { stayAwake: true })).toPNG());
    await click('打开桌宠预览');
    await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === '关闭桌宠预览')");
    const pet = BrowserWindow.getAllWindows().find(w => w.id !== win.id);
    await check(`${path.basename(sample)} real transparent window renders`, pet && await pet.webContents.executeJavaScript("!!document.querySelector('.sprite')"));
    if (pet) {
      // DOM readiness precedes atlas decode/compositor paint. Inspect actual pixels.
      await pet.webContents.executeJavaScript(`(async () => {
        const sprite = document.querySelector('.sprite');
        const image = new Image();
        image.src = sprite.style.backgroundImage.slice(5, -2);
        await image.decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      let capture;
      let visible = false;
      for (let attempt = 0; attempt < 20 && !visible; attempt++) {
        capture = await pet.webContents.capturePage(undefined, { stayAwake: true });
        const pixels = capture.toBitmap();
        for (let offset = 3; offset < pixels.length; offset += 4) {
          if (pixels[offset] > 0) { visible = true; break; }
        }
        if (!visible) await pause(100);
      }
      await check(`${path.basename(sample)} real window has painted visible pixels`, visible);
      await fs.writeFile(path.join(work, `pet-${imported.length}.png`), capture.toPNG());
    }
    await click('关闭桌宠预览');
    await check(`${path.basename(sample)} preview closes without extra windows`, BrowserWindow.getAllWindows().length === 1);
    if (process.env.STUDIO_SMOKE_EXPORT) {
      await step(4);
      picked = work;
      console.log(`Exporting ${project.displayName}`);
      await click('选择导出位置并导出');
      await waitFor("!!document.querySelector('.success-panel') || !!document.querySelector('.error-panel')", 180000);
      await check(`${path.basename(sample)} real Windows ZIP export`, js("!!document.querySelector('.success-panel')"));
      const success = await js("document.querySelector('.success-panel')?.textContent ?? ''");
      await step(2);
      await step(4);
      await check(`${path.basename(sample)} export result survives step navigation`, js(`document.querySelector('.success-panel')?.textContent === ${JSON.stringify(success)}`));
    }
  }
  await check('Classic import keeps a meaningful source name', imported[2].displayName !== 'converted');
  await step(2);
  await waitFor("!!document.querySelector('.preview-stage .sprite')");
  await check('Climbing animation is available for inspection', js("[...document.querySelectorAll('.chip')].some(e => e.textContent === '攀爬')"));
  await check('Frame inspection controls are present', js("!!document.querySelector('[aria-label=\"下一帧\"]')"));

  await step(3);
  await input('.field-input', '保留的草稿');
  await step(4);
  await check('Unsaved config cannot accidentally export old values', js("[...document.querySelectorAll('button')].some(b => b.textContent === '选择导出位置并导出' && b.disabled)"));
  await step(2);
  await step(3);
  await check('Configuration draft survives step navigation', js("document.querySelector('.field-input').value === '保留的草稿'"));
  await js(`document.querySelector('[title="${imported[0].id}"]').click()`);
  await pause(200);
  await check('Other projects do not inherit the draft', js("document.querySelector('.field-input').value !== '保留的草稿'"));
  await js(`document.querySelector('[title="${imported[2].id}"]').click()`);
  await pause(200);
  await check('Returning to a project restores its own draft', js("document.querySelector('.field-input').value === '保留的草稿'"));
  faults.set('studio:config:set', () => { throw new Error('测试保存连接中断'); });
  await click('保存配置');
  await check('Failed save retains editable draft', js("document.querySelector('.field-input').value === '保留的草稿' && !document.querySelector('.field-input').disabled && document.querySelector('.error-panel').textContent.includes('测试保存连接中断')"));
  faults.delete('studio:config:set');
  await input('.field-input', '已保存的配置');
  await click('保存配置');
  await waitFor("document.querySelector('.notice')?.textContent.includes('配置已保存')");
  const saved = await js('window.studio.getState()');
  await check('Saved config reaches disk', saved.index.projects.find(p => p.id === imported[2].id).config.petName === '已保存的配置');

  // Deterministic pending export: no download/build is needed for a navigation race.
  let finishExport;
  faults.set('studio:export', () => new Promise(resolve => { finishExport = resolve; }));
  await step(4);
  await click('选择导出位置并导出');
  await check('Navigation is locked while export is pending', js("[...document.querySelectorAll('.step-btn,.rail-project-select,.rail-project-del')].every(b => b.disabled)"));
  finishExport({ ok: false, cancelled: true });
  await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === '选择导出位置并导出' && !b.disabled)");
  faults.set('studio:export', () => { throw new Error('测试导出连接中断'); });
  await click('选择导出位置并导出');
  await check('Rejected export displays a recoverable error', js("document.querySelector('.error-panel')?.textContent.includes('测试导出连接中断')"));
  faults.delete('studio:export');
  faults.set('studio:recheck', () => { throw new Error('测试检查连接中断'); });
  await step(1);
  await check('Rejected check displays a recoverable error', js("document.querySelector('.content > section .error-panel')?.textContent.includes('测试检查连接中断')"));
  faults.delete('studio:recheck');
  console.log('Retrying check');
  await click('重新检查');
  await waitFor("!document.querySelector('.content > section .error-panel')");

  await step(2);
  await waitFor("!!document.querySelector('.preview-stage .sprite')");
  for (const theme of ['light', 'dark']) {
    console.log(`Capturing ${theme}`);
    nativeTheme.themeSource = theme;
    await pause(180);
    await fs.writeFile(path.join(work, `preview-${theme}.png`), (await win.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true })).toPNG());
  }
  win.setSize(820, 560);
  await pause(180);
  await check('Minimum workbench size has no horizontal content overflow', js("document.querySelector('.content').scrollWidth <= document.querySelector('.content').clientWidth"));
  await fs.writeFile(path.join(work, 'preview-compact.png'), (await win.webContents.capturePage(undefined, { stayAwake: true })).toPNG());
  await new Promise(resolve => { win.once('closed', resolve); win.close(); });
  console.log('Reopening workbench');
  app.emit('activate');
  win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html')) || BrowserWindow.getAllWindows()[0];
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  await waitFor("!!document.querySelector('.import-actions')");
  await step(3);
  await check('Reopening the workbench preserves saved config', js("document.querySelector('.field-input').value === '已保存的配置'"));
  await check('No unexpected renderer errors', rendererErrors.filter(e => !e.includes('测试')).length === 0);
  await fs.writeFile(path.join(work, 'summary.json'), JSON.stringify({ checks, samples, rendererErrors }, null, 2));
  console.log(`Evidence: ${work}`);
  app.exit(checks.some(c => !c.ok) ? 1 : 0);
}
main().catch(error => { console.error(error); app.exit(2); });
