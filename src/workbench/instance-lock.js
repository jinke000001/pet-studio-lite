const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LOCK_NAME = '.studio-instance-lock.json';
const MAX_LOCK_BYTES = 1024;
const MAX_ATTEMPTS = 3;
// O_NOFOLLOW keeps POSIX opens from following a swapped-in symlink (ELOOP);
// O_NONBLOCK keeps a swapped-in FIFO from blocking the open forever. Both are
// ignored when a platform does not define them (Windows keeps the lstat
// pre-check, documented in the repair plan).
const READ_ONLY_NOFOLLOW = [fs.constants.O_RDONLY, fs.constants.O_NOFOLLOW, fs.constants.O_NONBLOCK]
  .reduce((flags, flag) => flags | (flag || 0), 0);

// Fail-closed: only ESRCH proves death. EPERM and any unknown error are
// treated as alive, because guessing wrong in the other direction would let a
// second instance replace a live holder's lock.
function processAlive(pid, signal = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { signal(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function unsafeLockError() {
  return new Error('工作台实例锁不安全。');
}

// Read and fully validate a lock record. The lstat pre-check rejects symlinks,
// junctions, directories and oversize objects; the descriptor read (no-follow,
// non-blocking, inode-compared) then pins the exact object that was checked.
// Anything that cannot be proven to be a small regular file with a valid
// record fails closed and is never deleted.
function readLockRecord(lockPath) {
  const before = fs.lstatSync(lockPath);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_LOCK_BYTES) throw unsafeLockError();
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, READ_ONLY_NOFOLLOW);
  } catch (error) {
    if (error.code === 'ELOOP') throw unsafeLockError();
    throw error;
  }
  let text;
  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.size > MAX_LOCK_BYTES) throw unsafeLockError();
    if (Number.isFinite(stats.ino) && Number.isFinite(before.ino) && stats.ino !== 0 && stats.ino !== before.ino) throw unsafeLockError();
    text = fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  let record;
  try { record = JSON.parse(text); } catch { throw unsafeLockError(); }
  if (!record || typeof record !== 'object' || !Number.isSafeInteger(record.pid) || record.pid <= 0) throw unsafeLockError();
  return record;
}

// Acquire the workbench instance lock. Returns a release function, or null
// when a live instance already holds the lock. The lock is published with
// linkSync(2)/CreateHardLinkW: an atomic create that never follows a symlink,
// junction or reparse point at the lock path (the destination must not exist
// in any form), so a dangling symlink can never redirect writes outside the
// lock directory. The full record is written and flushed to a random sibling
// temp file before publication, so no half-initialized record is ever visible
// at the lock path. The lock directory itself must be a real directory: it is
// verified before any creation (a dangling directory symlink is rejected
// before mkdir could follow it) and re-verified on every retry, because it
// could be swapped between rounds. Its ancestors are the
// application-controlled userData path and are trusted by the threat model.
function assertRealLockDirectory(directory) {
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw unsafeLockError();
  return true;
}

function acquireInstanceLock({ directory, pid = process.pid, signal = process.kill, token = crypto.randomBytes(16).toString('hex') }) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError('实例锁 pid 必须为正整数。');
  // Strip trailing separators: POSIX lstat would otherwise resolve a symlink
  // followed by a separator to its target, bypassing the symlink check.
  const lockDirectory = String(directory).replace(/[/\\]+$/, '') || path.sep;
  if (!assertRealLockDirectory(lockDirectory)) {
    fs.mkdirSync(lockDirectory, { recursive: true });
    assertRealLockDirectory(lockDirectory);
  }
  const lockPath = path.join(lockDirectory, LOCK_NAME);
  let lastAttemptError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    lastAttemptError = null;
    assertRealLockDirectory(lockDirectory);
    const tempPath = path.join(lockDirectory, `${LOCK_NAME}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    let descriptor;
    try {
      descriptor = fs.openSync(tempPath, 'wx', 0o600);
    } catch (error) {
      throw error; // Temp creation failure is a real error, never a lock conflict.
    }
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify({ pid, token, createdAt: new Date().toISOString() })}\n`);
      fs.fsyncSync(descriptor);
    } catch (error) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
      try { fs.unlinkSync(tempPath); } catch { /* best effort: only our own temp */ }
      throw error;
    }
    fs.closeSync(descriptor);
    try {
      fs.linkSync(tempPath, lockPath);
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch { /* best effort: only our own temp */ }
      // Windows may report EEXIST, EPERM or EACCES when the destination
      // exists in any form (file, symlink, junction, directory). Only an
      // object proven at the lock path may redirect us into the
      // existing-lock flow; if the path is empty the original error is the
      // real one (permissions, unsupported filesystem) and must propagate.
      if (error.code !== 'EEXIST' && error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
      let stats;
      try {
        stats = fs.lstatSync(lockPath);
      } catch (lstatError) {
        // The lock vanished between publish and evidence gathering: someone
        // else recovered it. Retry; if the path stays empty the original
        // publish error keeps its semantics at exhaustion.
        if (lstatError.code === 'ENOENT') { lastAttemptError = error; continue; }
        throw error;
      }
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_LOCK_BYTES) throw unsafeLockError();
      let record;
      try {
        record = readLockRecord(lockPath);
      } catch (readError) {
        if (readError.code === 'ENOENT') { lastAttemptError = error; continue; }
        throw readError;
      }
      if (processAlive(record.pid, signal)) return null;
      // Proven dead holder with a valid record: safe to recover. Unknown or
      // corrupt locks were already rejected above and are never deleted.
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
          // Transient Windows holds (AV, indexer) get the remaining retries;
          // the final attempt rethrows the real error unchanged.
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(unlinkError.code)) throw unlinkError;
          lastAttemptError = unlinkError;
        }
      }
      continue;
    }
    try { fs.unlinkSync(tempPath); } catch { /* best effort: only our own temp */ }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      let record;
      try {
        record = readLockRecord(lockPath);
      } catch {
        return; // A replaced, foreign or already removed lock is not ours to clean.
      }
      // Only the exact holder (pid + random ownership token) may release.
      if (record.pid === pid && record.token === token) {
        try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
      }
    };
  }
  // Every attempt was contested. The last attempt's real error (publish or
  // recovery) keeps its semantics; a purely contested exhaustion is an
  // unprovable state and fails closed instead of pretending a live instance
  // exists.
  if (lastAttemptError) throw lastAttemptError;
  throw unsafeLockError();
}

module.exports = { acquireInstanceLock, processAlive };
