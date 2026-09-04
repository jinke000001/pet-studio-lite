const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAIN_PATH = path.join(PROJECT_ROOT, 'src', 'workbench', 'main.js');

test('workbench initializes storage, controllers, IPC and windows only after the native lock is held', () => {
  const main = fs.readFileSync(MAIN_PATH, 'utf8');
  assert.match(main, /requestSingleInstanceLock\(\)/, 'native Electron lock is the authority');
  assert.match(main, /function bootstrapWorkbench\(/, 'explicit bootstrap boundary required');

  const bootstrapIndex = main.indexOf('function bootstrapWorkbench(');
  for (const protectedCall of ['createProjectStore(', 'recoverInterruptedJobs()', 'registerIpc()', 'createWindow()']) {
    assert.ok(main.indexOf(protectedCall) > bootstrapIndex, `${protectedCall} must stay inside bootstrapWorkbench`);
  }
  assert.match(main, /single-instance-lock-acquired/);
  assert.match(main, /single-instance-lock-denied/);
});

test('a denied native instance initializes no storage, controller, IPC handler or window', () => {
  const childSource = `
    const Module = require('node:module');
    const path = require('node:path');
    const calls = { store: 0, recover: 0, controller: 0, ipc: 0, window: 0, quit: 0 };
    const app = {
      isPackaged: false, requestSingleInstanceLock: () => false,
      quit: () => { calls.quit += 1; }, releaseSingleInstanceLock: () => {},
      setName: () => {}, setPath: () => {}, setAppUserModelId: () => {},
      getPath: () => process.cwd(), whenReady: () => Promise.resolve(), on: () => {},
    };
    const electron = { app, BrowserWindow: function BrowserWindow() { calls.window += 1; }, dialog: {}, ipcMain: { handle: () => { calls.ipc += 1; } }, shell: {} };
    const fake = (name) => {
      if (name.includes('project-store')) return { createProjectStore: () => { calls.store += 1; return { recoverInterruptedJobs: () => { calls.recover += 1; } }; } };
      if (name.includes('controller')) return new Proxy({}, { get: () => () => { calls.controller += 1; } });
      if (name.includes('contracts')) return { validateProjectId: (value) => value };
      if (name.includes('job-controller')) return { createJobController: () => { calls.controller += 1; return {}; } };
      return {};
    };
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => {
      const inWorkbench = parent && parent.filename.split(path.sep).slice(-3, -1).join('/') === 'src/workbench';
      return request === 'electron' ? electron : (request.startsWith('./') && inWorkbench) ? fake(request) : originalLoad(request, parent, isMain);
    };
    require(process.argv[1]);
    setImmediate(() => console.log(JSON.stringify(calls)));
  `;
  const result = childProcess.spawnSync(process.execPath, ['-e', childSource, MAIN_PATH], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').pop()), {
    store: 0,
    recover: 0,
    controller: 0,
    ipc: 0,
    window: 0,
    quit: 1,
  });
});
