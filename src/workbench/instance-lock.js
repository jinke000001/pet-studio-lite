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
  return { record, ino: Number.isFinite(before.ino) ? before.ino : null };
}

// Read a captured (already isolated) lock object for identity verification.
// Returns null when the object cannot be proven to be a valid lock record.
function readCapturedRecord(capturePath) {
  try {
    return readLockRecord(capturePath);
  } catch {
    return null;
  }
}

// Synchronous sleep for the startup path. Atomics.wait is available on the
// Electron main process (Node context, not a browser main thread).
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// A vacancy at the lock path is only safe to publish into when the directory
// has been unchanged for longer than a capture-restore window. Capture and
// restore are a handful of local filesystem operations (microseconds), so a
// directory untouched for VACANCY_QUARANTINE_MS proves no capture is in
// flight and no restore is pending.
const VACANCY_QUARANTINE_MS = 100;

function vacancyIsCalm(lockDirectory) {
  try {
    return Date.now() - fs.statSync(lockDirectory).mtimeMs > VACANCY_QUARANTINE_MS;
  } catch {
    return false;
  }
}

function hasRecoveryCapture(lockDirectory) {
  try {
    return fs.readdirSync(lockDirectory).some((entry) => entry.startsWith(`${LOCK_NAME}.recovering-`));
  } catch {
    return true;
  }
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

function acquireInstanceLock({ directory, pid = process.pid, signal = process.kill, token = crypto.randomBytes(16).toString('hex'), recoverDead = true }) {
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
    let existing;
    try {
      existing = fs.lstatSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      existing = null;
    }
    if (existing === null) {
      if (!recoverDead && hasRecoveryCapture(lockDirectory)) return null;
      // Vacancy quarantine: only publish into a vacancy that has stayed calm
      // longer than a capture-restore window. Capture and restore are a few
      // local filesystem calls (microseconds), so a calm vacancy proves no
      // recoverer is mid-capture and no restore is pending — a recoverer's
      // restore therefore never competes with a compliant publisher.
      if (!vacancyIsCalm(lockDirectory)) {
        sleepSync(VACANCY_QUARANTINE_MS);
        try {
          existing = fs.lstatSync(lockPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          existing = null;
        }
        if (existing !== null) continue;
      }
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
        // exists in any form (file, symlink, junction, directory). Something
        // appeared at the lock path: loop back and examine it properly. If
        // the path stays empty across retries the original publish error
        // keeps its semantics at exhaustion (permissions, unsupported
        // filesystem).
        if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        lastAttemptError = error;
        continue;
      }
      try { fs.unlinkSync(tempPath); } catch { /* best effort: only our own temp */ }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        let current;
        try {
          current = readLockRecord(lockPath);
        } catch {
          return; // A replaced, foreign or already removed lock is not ours to clean.
        }
        // Only the exact holder (pid + random ownership token) may release.
        if (current.record.pid === pid && current.record.token === token) {
          try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
        }
      };
    }
    // Something exists at the lock path.
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size > MAX_LOCK_BYTES) throw unsafeLockError();
    let examined;
    try {
      examined = readLockRecord(lockPath);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // Vanished before reading: retry fresh.
      throw error;
    }
    // Diagnostic-only strict mode: an existing path is never removed, even
    // when its recorded owner is dead. The workbench uses Electron's native
    // single-instance authority; this mode is used to prove that a file
    // record cannot create a second holder during arbitrary pauses.
    if (!recoverDead) return null;
    if (processAlive(examined.record.pid, signal)) return null;
    // Dead holder: capture-based recovery. renameSync atomically moves the
    // object itself (never its path, never following links) into an isolated
    // capture name. Only the captured object whose identity matches the
    // examined one (same inode, same pid/token) and whose owner is still
    // provably dead may be deleted — the lock path is never unlinked based
    // on a stale read, so a concurrent recoverer can never delete a fresh
    // lock published after its read.
    const capturePath = path.join(lockDirectory, `${LOCK_NAME}.recovering-${process.pid}.${crypto.randomBytes(8).toString('hex')}`);
    try {
      fs.renameSync(lockPath, capturePath);
    } catch (captureError) {
      if (captureError.code === 'ENOENT') continue; // Another recoverer captured it first.
      // Transient Windows holds (AV, indexer) get the remaining retries; the
      // final attempt rethrows the real error unchanged.
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(captureError.code)) throw captureError;
      lastAttemptError = captureError;
      continue;
    }
    const captured = readCapturedRecord(capturePath);
    const sameObject = captured
      && (examined.ino === null || captured.ino === null || captured.ino === examined.ino)
      && captured.record.pid === examined.record.pid
      && captured.record.token === examined.record.token;
    if (sameObject && !processAlive(examined.record.pid, signal)) {
      fs.unlinkSync(capturePath); // The only deletion: identity-verified, still dead.
      continue;
    }
    if (captured) {
      if (processAlive(captured.record.pid, signal)) {
        // We captured a live holder's lock (the object changed between our
        // read and the rename). Put it back exactly and stand down. The
        // vacancy quarantine keeps compliant publishers out of the capture
        // window, so the restore cannot race a fresh publication; on any
        // restore failure the captured file is preserved and we fail closed
        // instead of deleting it.
        try {
          fs.linkSync(capturePath, lockPath);
          fs.unlinkSync(capturePath);
        } catch {
          throw unsafeLockError();
        }
        return null;
      }
      // A different but equally proven-dead valid record: deleting an object
      // whose owner is dead cannot affect any live process.
      fs.unlinkSync(capturePath);
      continue;
    }
    // Captured object cannot be proven to be the examined record. Preserve it
    // at the capture path for forensics and fail closed; it is never deleted.
    throw unsafeLockError();
  }
  // Every attempt was contested. The last attempt's real error (publish or
  // recovery) keeps its semantics; a purely contested exhaustion is an
  // unprovable state and fails closed instead of pretending a live instance
  // exists.
  if (lastAttemptError) throw lastAttemptError;
  throw unsafeLockError();
}

module.exports = { acquireInstanceLock, processAlive };
