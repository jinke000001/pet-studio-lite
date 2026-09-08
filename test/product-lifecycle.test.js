const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const electronPath = require('electron');

const { connectCdp, discoverTarget } = require('../acceptance-tools/lib/cdp');
const { cleanElectronEnv } = require('../acceptance-tools/lib/lab');

// Behavior-level proof for the G7-02 lifecycle repair. The old suite only
// scanned official-uninstall.ps1 for the string "CloseMainWindow"; these tests
// drive the real Electron runtime instead. Test 1 shows why that string match
// never proved anything: a CloseMainWindow-equivalent window close destroys
// the window but the tray process keeps running, so it can never satisfy
// G7-02. The remaining tests pin the real exit entry (petApi.quit → pet:quit →
// app.quit()) and the rule that the official uninstaller must never start
// while exact product processes remain.

const REPO_ROOT = path.resolve(__dirname, '..');
const SAMPLE_PET = path.join(REPO_ROOT, 'local-pets', 'doraemon');
let bundleCounter = 0;

function makePreviewBundle(root) {
  bundleCounter += 1;
  const suffix = `t${bundleCounter}`;
  const bundle = path.join(root, `bundle-${suffix}`);
  fs.mkdirSync(path.join(bundle, 'config', 'products'), { recursive: true });
  fs.mkdirSync(path.join(bundle, 'local-pets', 'imported'), { recursive: true });
  fs.copyFileSync(path.join(SAMPLE_PET, 'pet.json'), path.join(bundle, 'local-pets', 'imported', 'pet.json'));
  fs.copyFileSync(path.join(SAMPLE_PET, 'spritesheet.webp'), path.join(bundle, 'local-pets', 'imported', 'spritesheet.webp'));
  fs.writeFileSync(path.join(bundle, 'config', 'products', 'preview.json'), `${JSON.stringify({
    productId: `lifecycle-probe-${suffix}`,
    productName: `Lifecycle Probe ${suffix}`,
    petPackagePath: 'local-pets/imported',
    version: '0.0.0-probe',
    build: {
      appId: `com.jinke.desktop-pet.lifecycle-probe.${suffix}`,
      executableName: `LifecycleProbe${suffix}`,
      artifactName: `lifecycle-probe-${suffix}`,
      iconStrategy: 'electron-default-test',
    },
    defaultScale: 0.75,
    messages: { singleClick: 'probe', doubleClick: 'probe' },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(bundle, '.desktop-pet-preview.json'), `${JSON.stringify({ schemaVersion: 1, projectId: suffix, importId: suffix }, null, 2)}\n`, 'utf8');
  return bundle;
}

function launchPet(root, port) {
  const env = cleanElectronEnv({ ...process.env });
  delete env.PET_PRODUCT;
  env.DESKTOP_PET_PREVIEW_ROOT = makePreviewBundle(root);
  env.DESKTOP_PET_PREVIEW_USER_DATA = path.join(root, 'user-data');
  fs.mkdirSync(env.DESKTOP_PET_PREVIEW_USER_DATA, { recursive: true });
  const child = childProcess.spawn(electronPath, [path.join(REPO_ROOT, 'src', 'main.js'), `--remote-debugging-port=${port}`], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stderrChunks = [];
  child.stderr.on('data', (chunk) => { stderrChunks.push(chunk); if (stderrChunks.length > 20) stderrChunks.shift(); });
  child.stderrText = () => Buffer.concat(stderrChunks).toString('utf8');
  return child;
}

function isAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

async function waitForPage(port, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    try {
      const target = await discoverTarget({ port, timeoutMs: 1000 });
      const page = await connectCdp({ target, timeoutMs: 2000 });
      const probe = await page.evaluate('(()=>({ petApi: typeof window.petApi, quit: window.petApi ? typeof window.petApi.quit : "missing" }))()');
      if (probe?.result?.value?.quit === 'function') return { target, page };
      page.close();
    } catch {
      // The debug endpoint and the renderer come up after the process does; keep polling.
    }
    if (Date.now() - started >= timeoutMs) throw new Error(`the real quit entry never became ready on port ${port}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function waitForExit(child, timeoutMs) {
  if (!isAlive(child)) return Promise.resolve({ code: child.exitCode, signal: child.signalCode, ms: 0 });
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, ms: Date.now() - started }); });
  });
}

async function killAndWait(child) {
  if (!isAlive(child)) return;
  child.kill('SIGKILL');
  await waitForExit(child, 10000);
}

test('closing the main window cannot quit the tray pet; a CloseMainWindow string match is not a behavior proof', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g702-window-close-'));
  const port = 19331;
  const child = launchPet(root, port);
  t.after(() => killAndWait(child));
  try {
    const { page } = await waitForPage(port);
    await page.evaluate('window.close()');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal(isAlive(child), true, `window close must not quit the tray-resident pet (stderr: ${child.stderrText()})`);
    await assert.rejects(
      () => discoverTarget({ port, timeoutMs: 1000 }),
      (error) => error.code === 'CDP_TARGET',
      'the page target must be gone after the window closed',
    );
    assert.equal(isAlive(child), true, 'the tray process is still alive after its only window was destroyed');
  } finally {
    await killAndWait(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the candidate exits through its real quit entry petApi.quit → pet:quit → app.quit()', async (t) => {
  const { requestProductQuit, QUIT_ENTRY_METHOD } = require('../acceptance-tools/lib/product-lifecycle');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g702-real-quit-'));
  const port = 19332;
  const child = launchPet(root, port);
  t.after(() => killAndWait(child));
  try {
    await waitForPage(port);
    const request = await requestProductQuit({ port, timeoutMs: 5000 });
    assert.equal(request.method, QUIT_ENTRY_METHOD);
    assert.match(request.method, /petApi\.quit/);
    assert.equal(typeof request.requestedAt, 'string');
    const exit = await waitForExit(child, 10000);
    assert.notEqual(exit.timeout, true, 'petApi.quit must terminate the product process');
    assert.equal(exit.code, 0, `the real quit entry must exit cleanly (stderr: ${child.stderrText()})`);
    assert.equal(exit.signal, null);
  } finally {
    await killAndWait(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the lifecycle runner drives a running product to zero exact processes through the real quit entry', async (t) => {
  const { runProductQuitLifecycle, requestProductQuit } = require('../acceptance-tools/lib/product-lifecycle');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g702-lifecycle-e2e-'));
  const port = 19333;
  const child = launchPet(root, port);
  t.after(() => killAndWait(child));
  try {
    await waitForPage(port);
    const enumerate = async () => (isAlive(child) ? [{ processId: child.pid, executablePath: 'installed/DesktopPetCandidate.exe' }] : []);
    const result = await runProductQuitLifecycle({
      enumerate,
      requestQuit: () => requestProductQuit({ port, timeoutMs: 5000 }),
      timeoutMs: 15000,
      intervalMs: 100,
    });
    assert.equal(result.status, 'exited');
    assert.equal(result.startUninstaller, true, 'only a zero exact product process count may allow the official uninstaller');
    assert.equal(result.requested, true);
    assert.deepEqual(result.preExitProductPids, [child.pid]);
    assert.match(result.quitRequest.method, /petApi\.quit/);
    assert.ok(result.observations.length >= 2, 'the exit must be observed by real polling, not assumed');
    assert.equal(result.observations.at(-1).productProcessCount, 0);
    const exit = await waitForExit(child, 10000);
    assert.equal(exit.code, 0);
  } finally {
    await killAndWait(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the official uninstaller is never started while exact product processes remain', async () => {
  const { runProductQuitLifecycle } = require('../acceptance-tools/lib/product-lifecycle');
  let quitRequests = 0;
  const result = await runProductQuitLifecycle({
    enumerate: async () => [{ processId: 4242, executablePath: 'C:/apps/DesktopPetCandidate.exe' }],
    requestQuit: async () => { quitRequests += 1; return { method: 'petApi.quit', requestedAt: new Date().toISOString() }; },
    timeoutMs: 300,
    intervalMs: 50,
    delay: async () => {},
    now: (() => { let tick = Date.now(); return () => new Date((tick += 40)); })(),
  });
  assert.equal(quitRequests, 1, 'the real quit entry is requested exactly once per lifecycle attempt');
  assert.equal(result.status, 'lifecycle-failed');
  assert.equal(result.startUninstaller, false, 'a surviving product process must forbid starting the official uninstaller');
  assert.deepEqual(result.preExitProductPids, [4242]);
  assert.ok(result.observations.every((entry) => entry.productProcessCount === 1));
  assert.match(result.reason, /never started|未/);
});

test('a missing real quit entry records lifecycle-failed instead of starting the uninstaller', async () => {
  const { QuitEntryError, requestProductQuit, runProductQuitLifecycle } = require('../acceptance-tools/lib/product-lifecycle');
  const fakePageWithoutEntry = {
    evaluate: async (expression) => (expression.includes('typeof window.petApi')
      ? { result: { value: { petApi: 'undefined', quit: 'missing' } } }
      : { result: { value: undefined } }),
    close() {},
  };
  await assert.rejects(
    () => requestProductQuit({
      port: 19999,
      discover: async () => ({ id: 'page-1', webSocketDebuggerUrl: 'ws://127.0.0.1/page-1' }),
      connect: async () => fakePageWithoutEntry,
      timeoutMs: 200,
      intervalMs: 10,
      delay: async () => {},
    }),
    (error) => error instanceof QuitEntryError && error.code === 'QUIT_ENTRY_MISSING',
  );
  const result = await runProductQuitLifecycle({
    enumerate: async () => [{ processId: 777, executablePath: 'C:/apps/DesktopPetCandidate.exe' }],
    requestQuit: () => requestProductQuit({
      port: 19999,
      discover: async () => ({ id: 'page-1', webSocketDebuggerUrl: 'ws://127.0.0.1/page-1' }),
      connect: async () => fakePageWithoutEntry,
      timeoutMs: 200,
      intervalMs: 10,
      delay: async () => {},
    }),
    timeoutMs: 5000,
    delay: async () => {},
  });
  assert.equal(result.status, 'lifecycle-failed');
  assert.equal(result.startUninstaller, false);
  assert.equal(result.requestError.code, 'QUIT_ENTRY_MISSING');
  assert.match(result.reason, /quit entry/i);
});

test('an already-stopped product needs no quit request before the official uninstaller', async () => {
  const { runProductQuitLifecycle } = require('../acceptance-tools/lib/product-lifecycle');
  let quitRequests = 0;
  const result = await runProductQuitLifecycle({
    enumerate: async () => [],
    requestQuit: async () => { quitRequests += 1; return {}; },
    delay: async () => {},
  });
  assert.equal(result.status, 'not-running');
  assert.equal(result.startUninstaller, true);
  assert.equal(result.requested, false);
  assert.equal(quitRequests, 0, 'no quit request may be sent when no exact product process exists');
});

test('the Windows enumerator matches only the exact installed product executable path', () => {
  const { exactProductProcesses } = require('../acceptance-tools/lib/product-lifecycle');
  const installDirectory = 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\DesktopPetCandidate';
  const processes = [
    { Name: 'DesktopPetCandidate.exe', ProcessId: 10, ExecutablePath: 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\DesktopPetCandidate\\DesktopPetCandidate.exe' },
    { Name: 'DesktopPetCandidate.exe', ProcessId: 11, ExecutablePath: 'c:\\users\\administrator\\appdata\\local\\programs\\desktoppetcandidate\\DesktopPetCandidate.exe' },
    { Name: 'DesktopPetCandidate.exe', ProcessId: 12, ExecutablePath: 'C:\\other\\DesktopPetCandidate.exe' },
    { Name: 'node.exe', ProcessId: 13, ExecutablePath: 'C:\\node\\node.exe', CommandLine: `node ${installDirectory}\\resources\\app.asar` },
    { Name: 'DesktopPetCandidate.exe', ProcessId: 14, ExecutablePath: null },
  ];
  const matches = exactProductProcesses(processes, { installDirectory, executableName: 'DesktopPetCandidate.exe' });
  assert.deepEqual(matches.map((entry) => entry.processId).sort(), [10, 11]);
});

test('the Windows official uninstall probe drives the real quit entry instead of CloseMainWindow', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'acceptance-tools', 'ps', 'official-uninstall.ps1'), 'utf8');
  assert.doesNotMatch(source, /CloseMainWindow/i, 'window close cannot quit the tray-resident pet; the probe must use the real quit entry');
  assert.match(source, /request-quit\.js/);
  assert.match(source, /petApi\.quit/);
  assert.match(source, /quitMethod/);
  assert.match(source, /lifecycle-failed/);
  assert.match(source, /remote-debugging-port/);
  assert.doesNotMatch(source, /Stop-Process|taskkill/i);
  assert.doesNotMatch(source, /Remove-Item|DeleteRegKey|DeleteSubKey/i);
  const lifecycleGuard = source.indexOf('lifecycle-failed');
  const uninstallerStart = source.search(/Start-Process[^\n]+-Wait/);
  assert.ok(lifecycleGuard > 0 && uninstallerStart > lifecycleGuard, 'the lifecycle-failed exit path must come before the official uninstaller is ever started');
  const driver = fs.readFileSync(path.join(REPO_ROOT, 'acceptance-tools', 'request-quit.js'), 'utf8');
  assert.match(driver, /runProductQuitLifecycle/);
  assert.match(driver, /startUninstaller/);
  const lifecycle = fs.readFileSync(path.join(REPO_ROOT, 'acceptance-tools', 'lib', 'product-lifecycle.js'), 'utf8');
  for (const field of ['quitMethod', 'preExitProductPids', 'quitRequest', 'requestError', 'observations', 'startUninstaller']) {
    assert.match(lifecycle, new RegExp(field), `the lifecycle evidence must record ${field}`);
  }
});
