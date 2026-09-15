// Exercises the real packaged app through standard Electron debugging ports.
// Only native file dialogs are controlled. Production IPC, sharp, storage,
// React, previews and offline export run with an empty PATH and isolated data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2];
if (!executable) throw new Error('Usage: node scripts/smoke-packaged-studio.mjs <packaged executable> [evidence-directory]');
let work = process.argv[3] ? path.resolve(process.argv[3]) : await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-packaged-'));
await fs.mkdir(work, { recursive: true });
work = await fs.realpath(work);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function connect(port, type) {
  let target;
  for (let n = 0; n < 150; n++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(item => item.type === type);
      if (target) break;
    } catch {}
    await delay(200);
  }
  if (!target) throw new Error(`Debug endpoint unavailable: ${type}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    clearTimeout(handler.timer);
    if (message.error) handler.reject(new Error(JSON.stringify(message.error))); else handler.resolve(message.result);
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 180000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  return { socket, send, evaluate };
}
let mainPort = await freePort();
let pagePort = await freePort();
const env = { ...process.env, PATH: '' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'NODE_OPTIONS', 'npm_node_execpath', 'npm_execpath']) delete env[key];
let child = spawn(path.resolve(executable), [`--inspect=127.0.0.1:${mainPort}`, `--remote-debugging-port=${pagePort}`, `--user-data-dir=${path.join(work, '用户数据')}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', bytes => { log += bytes; });
child.stderr.on('data', bytes => { log += bytes; });
child.on('error', error => { log += error.stack; });
const checks = [];
let main, page;
let exported;
function check(name, value) { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); }
try {
  main = await connect(mainPort, 'node');
  page = await connect(pagePort, 'page');
  for (let n = 0; n < 100; n++) {
    if (await page.evaluate('!!window.studio && !!document.querySelector(".import-actions")')) break;
    await delay(100);
  }
  console.log('Packaged environment:', await main.evaluate(`({packaged:process.mainModule.require('electron').app.isPackaged, userData:process.mainModule.require('electron').app.getPath('userData'), path:process.env.PATH})`));
  check('packaged app, isolated user data and empty PATH', await main.evaluate(`process.mainModule.require('electron').app.isPackaged && process.env.PATH === '' && process.mainModule.require('electron').app.getPath('userData') === ${JSON.stringify(path.join(work, '用户数据'))}`));
  const pick = async dir => main.evaluate(`process.mainModule.require('electron').dialog.showOpenDialog = async () => ({canceled:false,filePaths:[${JSON.stringify(dir)}]}); true`);
  const fixture = path.join(work, '中文素材 #1');
  await fs.cp(path.join(root, 'assets/fixtures/pack-v2-webp'), fixture, { recursive: true });
  await pick(fixture);
  const imported = await page.evaluate(`window.studio.importPack('dir')`);
  check('packaged WebP import without external Node', imported.ok);
  const id = imported.project.id;
  const config = await page.evaluate(`window.studio.updateConfig(${JSON.stringify(id)}, {petName:'双平台测试',zoom:1.5,wanderEnabled:false})`);
  check('configuration saved', config.config.petName === '双平台测试');
  const preview = await page.evaluate(`window.studio.startPetPreview(${JSON.stringify(id)})`);
  check('real desktop preview opens', preview.ok);
  await delay(800);
  check('preview renderer loaded through encoded file URL', await main.evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('pet.html')).every(w => !w.webContents.isLoading() && !w.isDestroyed()) && process.mainModule.require('electron').BrowserWindow.getAllWindows().length > 1`));
  check('preview sprite has a decoded image', await main.evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html')).webContents.executeJavaScript("(async()=>{const el=document.querySelector('.sprite');if(!el || el.getBoundingClientRect().width<=0)return false; const image=new Image();image.src=getComputedStyle(el).backgroundImage.slice(5,-2);await image.decode();return image.naturalWidth>0 && image.naturalHeight>0;})()")`));
  await page.send('Page.reload');
  await delay(1200);
  check('saved project survives renderer reload', (await page.evaluate('window.studio.getState()')).index.projects.some(p => p.id === id && p.config.petName === '双平台测试'));
  const shot = await main.evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')).webContents.capturePage().then(image=>image.toPNG().toString('base64'))`);
  await fs.writeFile(path.join(work, 'workbench.png'), Buffer.from(shot, 'base64'));
  await page.evaluate('window.studio.stopPetPreview()');
  await pick(work);
  exported = await page.evaluate(`window.studio.exportProject(${JSON.stringify(id)})`);
  check('offline Windows export from packaged app', exported.ok);
  await fs.access(exported.zipPath);
  // Real official download also tests installed-app fetch, with no external tools.
  if (process.env.PETDEX_REMOTE_TEST === '1') {
    const candidate = await page.evaluate(`window.studio.preparePetdexImport('npx petdex@latest install boba')`);
    check('official online import preview', candidate.ok);
    const confirmed = await page.evaluate(`window.studio.confirmPetdexImport(${JSON.stringify(candidate.candidate.token)})`);
    check('online candidate confirmation creates project', confirmed.ok);
    const replay = await page.evaluate(`window.studio.confirmPetdexImport(${JSON.stringify(candidate.candidate.token)})`);
    check('candidate token cannot be reused', !replay.ok);
  }
  const duplicate = spawn(path.resolve(executable), [`--user-data-dir=${path.join(work, '用户数据')}`], { env, stdio:'ignore' });
  const duplicateExit = await Promise.race([new Promise(resolve=>duplicate.once('exit', resolve)), delay(10000).then(()=>{duplicate.kill();return 'timeout';})]);
  check('second launch exits instead of opening a second store', duplicateExit === 0);
  const normalExit = new Promise(resolve => child.once('exit', (code, signal) => resolve({code,signal})));
  await main.evaluate(`setTimeout(()=>process.mainModule.require('electron').app.quit(),100);true`);
  main.socket.close(); page.socket.close();
  const exit = await Promise.race([normalExit, delay(10000).then(()=>({code:'timeout'}))]);
  check('packaged application quits normally', exit.code === 0);
  mainPort = await freePort(); pagePort = await freePort();
  child = spawn(path.resolve(executable), [`--inspect=127.0.0.1:${mainPort}`, `--remote-debugging-port=${pagePort}`, `--user-data-dir=${path.join(work, '用户数据')}`], {env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', bytes=>{log+=bytes;});child.stderr.on('data', bytes=>{log+=bytes;});
  main = await connect(mainPort,'node');page = await connect(pagePort,'page');
  for(let n=0;n<100;n++){if(await page.evaluate('!!window.studio'))break;await delay(100);}
  check('project and configuration survive a full app restart', (await page.evaluate('window.studio.getState()')).index.projects.some(p=>p.id===id && p.config.petName==='双平台测试' && p.config.zoom===1.5));
  await fs.writeFile(path.join(work, 'result.json'), JSON.stringify({ status:'pass', platform:process.platform, checks, exported, windowsNativeAcceptance:'pending' }, null, 2));
  console.log(`PACKAGED_STUDIO_PASS ${work}`);
} catch (error) {
  await fs.writeFile(path.join(work, 'result.json'), JSON.stringify({ status:'fail', checks, error:String(error), exported }, null, 2));
  throw error;
} finally {
  // Disconnect first so Electron can exit normally instead of waiting on debugger.
  main?.socket.close();
  page?.socket.close();
  child.kill();
  await fs.writeFile(path.join(work, 'process.log'), log);
}
