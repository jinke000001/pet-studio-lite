const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('pet launcher rejects an unsafe selector before starting Electron', () => {
  const result = spawnSync(process.execPath, ['scripts/start-pet.js', '../dai'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /product selector/);
});
