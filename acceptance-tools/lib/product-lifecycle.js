'use strict';

const path = require('node:path');
const { connectCdp, discoverTarget } = require('./cdp');
const { processSnapshot } = require('./lab');

// The candidate's real exit entry, exposed by its own preload:
// window.petApi.quit() → ipcRenderer.send('pet:quit') → ipcMain → app.quit().
// Closing the window can never quit the tray-resident pet because the runtime
// prevents window-all-closed, so a CloseMainWindow-style request is not an exit.
const QUIT_ENTRY_METHOD = 'petApi.quit → pet:quit → app.quit()';
const QUIT_ENTRY_PROBE = '(()=>({ petApi: typeof window.petApi, quit: window.petApi ? typeof window.petApi.quit : "missing" }))()';
const QUIT_ENTRY_EXPRESSION = 'window.petApi.quit()';

class QuitEntryError extends Error {
  constructor(message, code = 'QUIT_ENTRY_ERROR') { super(message); this.name = 'QuitEntryError'; this.code = code; }
}

function normalizeWinPath(value) {
  return path.win32.normalize(String(value)).replace(/[\\/]+$/, '').toLowerCase();
}

function exactProductProcesses(processes, { installDirectory, executableName }) {
  if (!installDirectory || !executableName) throw new QuitEntryError('installDirectory and executableName are required', 'CONFIG');
  const expected = normalizeWinPath(path.win32.join(installDirectory, executableName));
  return (Array.isArray(processes) ? processes : [])
    .filter((entry) => entry && entry.ExecutablePath && normalizeWinPath(entry.ExecutablePath) === expected)
    .map((entry) => ({ processId: entry.ProcessId, name: entry.Name, executablePath: entry.ExecutablePath }));
}

function createWindowsProductProcessEnumerator({ installDirectory, executableName, snapshot = processSnapshot } = {}) {
  return async () => {
    const result = snapshot();
    if (result?.status !== 'ok') throw new QuitEntryError(`process snapshot failed: ${result?.status || 'unknown'}`, 'PROCESS_SNAPSHOT');
    return exactProductProcesses(result.processes, { installDirectory, executableName });
  };
}

async function waitForQuitEntry({ host, port, timeoutMs = 30000, intervalMs = 250, discover = discoverTarget, connect = connectCdp, now = () => Date.now(), delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!Number.isInteger(port) || port <= 0) throw new QuitEntryError('a valid CDP port is required', 'CDP_CONFIG');
  const startedAt = now();
  let lastError = null;
  while (now() - startedAt <= timeoutMs) {
    let page = null;
    try {
      const target = await discover({ host, port, timeoutMs: Math.min(timeoutMs, 5000) });
      page = await connect({ target, timeoutMs: Math.min(timeoutMs, 5000) });
      const probe = await page.evaluate(QUIT_ENTRY_PROBE);
      const shape = probe?.result?.value ?? {};
      if (shape.petApi === 'object' && shape.quit === 'function') return { page, target, probe: shape };
      lastError = new QuitEntryError('the candidate page does not expose petApi.quit; the real quit entry is unavailable', 'QUIT_ENTRY_MISSING');
    } catch (error) {
      lastError = error;
    }
    if (page) { try { page.close(); } catch { /* the channel dies together with the renderer */ } }
    if (now() - startedAt >= timeoutMs) break;
    await delay(intervalMs);
  }
  if (lastError instanceof QuitEntryError) throw lastError;
  throw new QuitEntryError(`the real quit entry never became reachable on CDP port ${port}: ${lastError?.message || 'no page target'}`, 'QUIT_ENTRY_UNAVAILABLE');
}

async function requestProductQuit({ host, port, timeoutMs = 30000, intervalMs, discover, connect, now, delay, nowDate = () => new Date() } = {}) {
  const { page, target, probe } = await waitForQuitEntry({ host, port, timeoutMs, intervalMs, discover, connect, now, delay });
  // Fire-and-forget on purpose: app.quit() tears the renderer down before any
  // CDP reply can come back, so the response must never be awaited as proof.
  const delivery = page.evaluate(QUIT_ENTRY_EXPRESSION, false).catch(() => null);
  await Promise.race([delivery, (delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(500)]);
  try { page.close(); } catch { /* already gone with the renderer */ }
  return { method: QUIT_ENTRY_METHOD, requestedAt: nowDate().toISOString(), targetId: target.id || null, probe };
}

async function runProductQuitLifecycle({
  enumerate,
  requestQuit,
  timeoutMs = 60000,
  intervalMs = 1000,
  now = () => new Date(),
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof enumerate !== 'function') throw new QuitEntryError('enumerate is required', 'CONFIG');
  const startedAt = now();
  const initial = await enumerate();
  const observations = [{ observedAt: startedAt.toISOString(), productProcessCount: initial.length }];
  const base = { quitMethod: QUIT_ENTRY_METHOD, observations };
  if (initial.length === 0) {
    return { ...base, status: 'not-running', startUninstaller: true, requested: false, preExitProductPids: [], quitRequest: null, requestError: null, endedAt: now().toISOString() };
  }
  if (typeof requestQuit !== 'function') throw new QuitEntryError('requestQuit is required while product processes are running', 'CONFIG');
  const preExitProductPids = initial.map((entry) => entry.processId);
  let quitRequest = null;
  let requestError = null;
  try {
    quitRequest = await requestQuit();
  } catch (error) {
    requestError = { message: error.message, code: error.code || 'QUIT_REQUEST_FAILED' };
  }
  if (requestError) {
    return {
      ...base,
      status: 'lifecycle-failed',
      startUninstaller: false,
      requested: false,
      preExitProductPids,
      quitRequest,
      requestError,
      reason: `the real quit entry could not be driven (${requestError.code}: ${requestError.message}); the official uninstaller was never started`,
      endedAt: now().toISOString(),
    };
  }
  const deadline = startedAt.getTime() + timeoutMs;
  while (now().getTime() <= deadline) {
    await delay(intervalMs);
    const latest = await enumerate();
    observations.push({ observedAt: now().toISOString(), productProcessCount: latest.length });
    if (latest.length === 0) {
      return { ...base, status: 'exited', startUninstaller: true, requested: true, preExitProductPids, quitRequest, requestError: null, endedAt: now().toISOString() };
    }
  }
  return {
    ...base,
    status: 'lifecycle-failed',
    startUninstaller: false,
    requested: true,
    preExitProductPids,
    quitRequest,
    requestError: null,
    reason: 'the product did not exit through its real quit entry before the deadline; the official uninstaller was never started',
    endedAt: now().toISOString(),
  };
}

module.exports = {
  QUIT_ENTRY_EXPRESSION,
  QUIT_ENTRY_METHOD,
  QUIT_ENTRY_PROBE,
  QuitEntryError,
  createWindowsProductProcessEnumerator,
  exactProductProcesses,
  requestProductQuit,
  runProductQuitLifecycle,
  waitForQuitEntry,
};
