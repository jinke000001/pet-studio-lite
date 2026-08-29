const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('pet launcher rejects an unsafe selector before starting Electron', () => {
  const blockerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-electron-blocker-'));
  const blockerPath = path.join(blockerRoot, 'block-electron.js');
  fs.writeFileSync(blockerPath, `
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function blockedElectron(request, parent, isMain) {
  if (request === 'electron') throw new Error('Electron loaded before selector validation');
  return originalLoad.call(this, request, parent, isMain);
};
`);
  const result = spawnSync(process.execPath, ['scripts/start-pet.js', '../dai'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--require=${blockerPath}` },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /product selector/);
});
