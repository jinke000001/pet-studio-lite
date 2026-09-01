const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acquireInstanceLock } = require('../src/workbench/instance-lock');

test('allows one workbench instance and releases its lock', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lock-'));
  const release = acquireInstanceLock({ directory, pid: 100, signal: (pid) => { if (pid === 100) return; throw Object.assign(new Error(), { code: 'ESRCH' }); } });
  assert.equal(typeof release, 'function');
  assert.equal(acquireInstanceLock({ directory, pid: 200, signal: () => {} }), null);
  release();
  assert.equal(fs.existsSync(path.join(directory, '.studio-instance-lock.json')), false);
});

test('recovers a dead owner and rejects a symbolic-link lock', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lock-'));
  const lockPath = path.join(directory, '.studio-instance-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 99 }));
  const release = acquireInstanceLock({ directory, pid: 200, signal: () => { throw Object.assign(new Error(), { code: 'ESRCH' }); } });
  assert.equal(typeof release, 'function'); release();
  fs.symlinkSync('/tmp', lockPath);
  assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
});
