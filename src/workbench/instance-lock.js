const fs = require('node:fs');
const path = require('node:path');

function processAlive(pid, signal = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { signal(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function acquireInstanceLock({ directory, pid = process.pid, signal = process.kill }) {
  fs.mkdirSync(directory, { recursive: true });
  const lockPath = path.join(directory, '.studio-instance-lock.json');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({ pid, createdAt: new Date().toISOString() })}\n`);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        fs.closeSync(descriptor);
        try {
          const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          if (record.pid === pid) fs.unlinkSync(lockPath);
        } catch {
          // A replaced or already removed lock is not ours to clean.
        }
      };
    } catch (error) {
      if (error.code === 'EPERM') {
        // Windows returns EPERM instead of EEXIST for 'wx' on some existing
        // lock objects. Only a lock path proven unsafe (symlink, non-regular
        // file, oversize) may be converted; anything else rethrows the
        // original EPERM.
        let stats;
        try {
          stats = fs.lstatSync(lockPath);
        } catch {
          throw error;
        }
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024) throw new Error('工作台实例锁不安全。');
        throw error;
      }
      if (error.code !== 'EEXIST') throw error;
      const stats = fs.lstatSync(lockPath);
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024) throw new Error('工作台实例锁不安全。');
      let owner;
      try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid; } catch { owner = null; }
      if (processAlive(owner, signal)) return null;
      fs.unlinkSync(lockPath);
    }
  }
  return null;
}

module.exports = { acquireInstanceLock, processAlive };
