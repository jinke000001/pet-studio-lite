const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { acquireInstanceLock } = require('../src/workbench/instance-lock');

const LOCK_NAME = '.studio-instance-lock.json';
const MODULE_PATH = path.join(__dirname, '..', 'src', 'workbench', 'instance-lock.js');

const deadSignal = () => { throw Object.assign(new Error(), { code: 'ESRCH' }); };
const liveSignal = () => {};

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lock-'));
}

function cleanup(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function lockPathOf(directory) {
  return path.join(directory, LOCK_NAME);
}

function readRecord(directory) {
  return JSON.parse(fs.readFileSync(lockPathOf(directory), 'utf8'));
}

// 1. 第一个实例获取并释放。
test('allows one workbench instance and releases its lock', () => {
  const directory = makeTempDir();
  try {
    const release = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    assert.equal(typeof release, 'function');
    assert.equal(fs.existsSync(lockPathOf(directory)), true);
    release();
    assert.equal(fs.existsSync(lockPathOf(directory)), false);
    assert.deepEqual(fs.readdirSync(directory), [], 'no temp files or leftovers may remain');
  } finally {
    cleanup(directory);
  }
});

// 2 + 4. 第二个实例被拒绝；活跃持有者的锁不被误删。
test('rejects a second instance and never touches the live holder lock', () => {
  const directory = makeTempDir();
  try {
    const release = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    const before = fs.readFileSync(lockPathOf(directory), 'utf8');
    assert.equal(acquireInstanceLock({ directory, pid: 200, signal: liveSignal }), null);
    assert.equal(fs.readFileSync(lockPathOf(directory), 'utf8'), before, 'live holder lock must be untouched');
    release();
    assert.equal(fs.existsSync(lockPathOf(directory)), false);
  } finally {
    cleanup(directory);
  }
});

// 3. 死亡持有者恢复（含无 token 的旧格式锁）。
test('recovers a dead owner lock, including the legacy pid-only format', () => {
  const directory = makeTempDir();
  try {
    fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999 }));
    const release = acquireInstanceLock({ directory, pid: 200, signal: deadSignal });
    assert.equal(typeof release, 'function');
    const record = readRecord(directory);
    assert.equal(record.pid, 200);
    assert.equal(typeof record.token, 'string');
    assert.ok(record.token.length >= 16, 'ownership token must be recorded');
    release();
    assert.equal(fs.existsSync(lockPathOf(directory)), false);
  } finally {
    cleanup(directory);
  }
});

test('recovers a dead owner written in the current token format', () => {
  const directory = makeTempDir();
  try {
    fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'dead-token', createdAt: new Date().toISOString() }));
    const release = acquireInstanceLock({ directory, pid: 200, signal: deadSignal });
    assert.equal(typeof release, 'function');
    assert.notEqual(readRecord(directory).token, 'dead-token');
    release();
  } finally {
    cleanup(directory);
  }
});

// 5. 悬空符号链接被拒绝，链接目标不产生（真实文件系统，无固定 POSIX 字面量）。
test('rejects a dangling symbolic-link lock without ever creating its target (real filesystem)', () => {
  const directory = makeTempDir();
  const lockPath = lockPathOf(directory);
  const target = path.join(directory, `dangling-target-${process.pid}-${Date.now()}`);
  assert.equal(fs.existsSync(target), false);
  try {
    fs.symlinkSync(target, lockPath);
    assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
    assert.equal(fs.existsSync(target), false, 'lock acquisition must not create the symlink target');
    assert.equal(fs.lstatSync(lockPath).isSymbolicLink(), true, 'the symlink itself must be left untouched');
  } finally {
    cleanup(directory);
  }
});

// 5（Windows 语义仿真）：平台跟随悬空链接时仍不得创建目标。
// 5（协议层面保证）：实现从不对锁路径调用 openSync，发布只经过 linkSync，
// 因此 Windows“CREATE_NEW 跟随悬空链接并创建目标”的整类风险在协议上不存在
// （旧 openSync-stub 仿真测试的 RED 证据见 logs/phase-6-instance-lock-deep-RED.txt；
// 替代的永久回归为文末 “never opens the lock path with openSync” 用例）。

// 6. 链接指向现有文件时，目标内容与哈希不变。
test('rejects a symlink to an existing file without touching its content or hash', () => {
  const directory = makeTempDir();
  const lockPath = lockPathOf(directory);
  const target = path.join(directory, 'existing-target');
  const content = 'do-not-touch\n';
  try {
    fs.writeFileSync(target, content);
    const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    fs.symlinkSync(target, lockPath);
    assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
    assert.equal(fs.readFileSync(target, 'utf8'), content);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), beforeHash);
    assert.equal(fs.lstatSync(lockPath).isSymbolicLink(), true);
  } finally {
    cleanup(directory);
  }
});

// 7. 锁路径为目录、指向目录的链接（junction/reparse point 类比）时拒绝。
test('rejects a directory at the lock path', () => {
  const directory = makeTempDir();
  try {
    fs.mkdirSync(lockPathOf(directory));
    assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
    assert.equal(fs.lstatSync(lockPathOf(directory)).isDirectory(), true, 'the foreign directory must remain');
  } finally {
    cleanup(directory);
  }
});

test('rejects a symlink-to-directory (junction analogue) without writing inside the target', () => {
  const directory = makeTempDir();
  const targetDir = makeTempDir();
  try {
    fs.symlinkSync(targetDir, lockPathOf(directory), 'dir');
    assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
    assert.deepEqual(fs.readdirSync(targetDir), [], 'nothing may be created inside the linked directory');
  } finally {
    cleanup(directory);
    cleanup(targetDir);
  }
});

// 8. 损坏 JSON、空记录、超限记录 fail-closed 且不被删除。
test('fails closed on corrupt, empty and oversize lock records without deleting them', () => {
  const cases = [
    ['corrupt', 'not json at all'],
    ['empty', ''],
    ['oversize', `${JSON.stringify({ pid: 999999, token: 'x' })}${' '.repeat(2048)}`],
    ['wrong-shape', JSON.stringify({ pid: 'not-a-number' })],
  ];
  for (const [name, content] of cases) {
    const directory = makeTempDir();
    try {
      fs.writeFileSync(lockPathOf(directory), content);
      assert.throws(() => acquireInstanceLock({ directory, pid: 200, signal: deadSignal }), /实例锁不安全/, name);
      assert.equal(fs.readFileSync(lockPathOf(directory), 'utf8'), content, `${name}: unsafe lock must not be deleted`);
    } finally {
      cleanup(directory);
    }
  }
});

// 9. 无法证明与不安全对象相关的 EPERM/EACCES 原样抛出。
test('rethrows EPERM from publish when nothing exists at the lock path', () => {
  const directory = makeTempDir();
  const originalLinkSync = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
  try {
    assert.throws(
      () => acquireInstanceLock({ directory, pid: 200 }),
      (error) => error && error.code === 'EPERM' && !/实例锁不安全/.test(error.message),
    );
  } finally {
    fs.linkSync = originalLinkSync;
    cleanup(directory);
  }
});

test('rethrows EACCES from publish unchanged', () => {
  const directory = makeTempDir();
  const originalLinkSync = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
  try {
    assert.throws(
      () => acquireInstanceLock({ directory, pid: 200 }),
      (error) => error && error.code === 'EACCES',
    );
  } finally {
    fs.linkSync = originalLinkSync;
    cleanup(directory);
  }
});

test('rethrows EACCES from temp-file creation unchanged', () => {
  const directory = makeTempDir();
  const originalOpenSync = fs.openSync;
  fs.openSync = () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
  try {
    assert.throws(
      () => acquireInstanceLock({ directory, pid: 200 }),
      (error) => error && error.code === 'EACCES',
    );
  } finally {
    fs.openSync = originalOpenSync;
    cleanup(directory);
  }
});

test('converts publish EPERM into an unsafe-lock error only when a symlink is proven at the lock path', () => {
  const directory = makeTempDir();
  const lockPath = lockPathOf(directory);
  const target = path.join(directory, 'eprem-symlink-target');
  try {
    fs.symlinkSync(target, lockPath);
    const originalLinkSync = fs.linkSync;
    fs.linkSync = () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
    try {
      assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
      assert.equal(fs.existsSync(target), false);
    } finally {
      fs.linkSync = originalLinkSync;
    }
  } finally {
    cleanup(directory);
  }
});

test('converts publish EPERM into an unsafe-lock error only when an oversize regular lock is proven', () => {
  const directory = makeTempDir();
  try {
    fs.writeFileSync(lockPathOf(directory), Buffer.alloc(2048));
    const originalLinkSync = fs.linkSync;
    fs.linkSync = () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
    try {
      assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
      assert.equal(fs.lstatSync(lockPathOf(directory)).size, 2048, 'oversize lock must not be deleted');
    } finally {
      fs.linkSync = originalLinkSync;
    }
  } finally {
    cleanup(directory);
  }
});

// 10. 获取后锁路径被替换，release 不删除替换对象。
test('release does not delete a lock object that replaced ours after acquisition', () => {
  const directory = makeTempDir();
  try {
    const release = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    const foreign = JSON.stringify({ pid: 100, token: 'foreign-token', createdAt: new Date().toISOString() });
    fs.unlinkSync(lockPathOf(directory));
    fs.writeFileSync(lockPathOf(directory), foreign);
    release();
    assert.equal(fs.readFileSync(lockPathOf(directory), 'utf8'), foreign, 'foreign replacement must survive release');
  } finally {
    cleanup(directory);
  }
});

// 11. 错误 token 或相同 PID、不同 token 不能释放。
test('release requires both pid and token; same pid with a different token cannot release', () => {
  const directory = makeTempDir();
  try {
    const release = acquireInstanceLock({ directory, pid: 100, token: 'token-a', signal: liveSignal });
    const tampered = JSON.stringify({ pid: 100, token: 'token-b', createdAt: new Date().toISOString() });
    fs.writeFileSync(lockPathOf(directory), tampered);
    release();
    assert.equal(fs.readFileSync(lockPathOf(directory), 'utf8'), tampered, 'mismatched token must block release');
  } finally {
    cleanup(directory);
  }
});

test('release is idempotent and a stale release handle cannot delete a new holder lock', () => {
  const directory = makeTempDir();
  try {
    const release = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    release();
    release();
    assert.equal(fs.existsSync(lockPathOf(directory)), false);
    const second = acquireInstanceLock({ directory, pid: 300, signal: liveSignal });
    release(); // stale release handle must not delete the new holder's lock
    assert.equal(fs.existsSync(lockPathOf(directory)), true);
    second();
    assert.equal(fs.existsSync(lockPathOf(directory)), false);
  } finally {
    cleanup(directory);
  }
});

// 6/8 补充：崩溃残留的临时文件不视为锁，也不被误删。
test('ignores and preserves leftover temp files from a crashed attempt', () => {
  const directory = makeTempDir();
  const leftover = path.join(directory, `${LOCK_NAME}.12345.deadbeef.tmp`);
  try {
    fs.writeFileSync(leftover, 'partial');
    const release = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    assert.equal(typeof release, 'function');
    release();
    assert.equal(fs.readFileSync(leftover, 'utf8'), 'partial', 'foreign leftover temp must not be deleted');
  } finally {
    cleanup(directory);
  }
});

// 12. 两个及以上真实子进程并发，只允许一个持有者。
// 双屏障：子进程等 start.flag 同时抢锁；持有者等父进程收齐全部结果后
// 放下 release.flag 才释放，消除“迟到子进程在持有者退出后才抢锁”的调度窗口。
test('only one of six real concurrent child processes holds the lock', { timeout: 60000 }, async () => {
  const directory = makeTempDir();
  const startFlag = path.join(directory, 'start.flag');
  const releaseFlag = path.join(directory, 'release.flag');
  const childSource = `
    const fs = require('node:fs');
    const path = require('node:path');
    const { acquireInstanceLock } = require(process.argv[1]);
    const directory = process.argv[2];
    const deadline = Date.now() + 45000;
    const waitFor = (name) => {
      const target = path.join(directory, name);
      while (!fs.existsSync(target) && Date.now() < deadline) {
        const waitUntil = Date.now() + 10;
        while (Date.now() < waitUntil) {} // spin briefly between checks
      }
      return fs.existsSync(target);
    };
    if (!waitFor('start.flag')) { console.log('barrier-timeout'); process.exit(2); }
    const release = acquireInstanceLock({ directory });
    console.log(release ? 'acquired' : 'denied');
    if (release) {
      if (!waitFor('release.flag')) { release(); process.exit(3); }
      release();
      process.exit(0);
    }
  `;
  try {
    let reportedCount = 0;
    const children = Array.from({ length: 6 }, () => new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, ['-e', childSource, MODULE_PATH, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      child.stdout.on('data', (chunk) => {
        const text = String(chunk);
        stdout += text;
        // 按完整行计数（chunk 边界可能拆行）；收齐 6 行后放下释放屏障。
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop();
        reportedCount += lines.filter((line) => line === 'acquired' || line === 'denied').length;
        if (reportedCount >= 6 && !fs.existsSync(releaseFlag)) fs.writeFileSync(releaseFlag, 'go');
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', rejectPromise);
      child.on('close', (code) => resolvePromise({ code, stdout: stdout.trim(), stderr }));
    }));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    fs.writeFileSync(startFlag, 'go');
    const outcomes = await Promise.all(children);
    const acquired = outcomes.filter((outcome) => outcome.stdout === 'acquired');
    const denied = outcomes.filter((outcome) => outcome.stdout === 'denied');
    assert.equal(acquired.length, 1, `exactly one holder expected: ${JSON.stringify(outcomes.map((o) => o.stdout))}`);
    assert.equal(denied.length, 5);
    for (const outcome of outcomes) assert.equal(outcome.code, 0, outcome.stderr);
    assert.equal(fs.existsSync(lockPathOf(directory)), false, 'holder must have released on exit');
  } finally {
    cleanup(directory);
  }
});

// 13. 连续启动/退出 20 轮，无残留锁。
test('twenty sequential acquire/release rounds leave no lock or temp residue', () => {
  const directory = makeTempDir();
  try {
    for (let round = 0; round < 20; round += 1) {
      const release = acquireInstanceLock({ directory, pid: 100 + round, signal: liveSignal });
      assert.equal(typeof release, 'function', `round ${round}`);
      release();
    }
    assert.deepEqual(fs.readdirSync(directory), [], 'no residue after 20 rounds');
  } finally {
    cleanup(directory);
  }
});

// ---- 对抗审查第二轮回归 ----
const { processAlive } = require('../src/workbench/instance-lock');

// 审查发现 1：只有 ESRCH 证明死亡；未知错误必须 fail-closed 视为存活。
test('processAlive treats only ESRCH as dead and everything else as alive (fail-closed)', () => {
  assert.equal(processAlive(123, () => { throw Object.assign(new Error(), { code: 'ESRCH' }); }), false);
  assert.equal(processAlive(123, () => { throw Object.assign(new Error(), { code: 'EPERM' }); }), true);
  assert.equal(processAlive(123, () => { throw Object.assign(new Error('unknown'), { code: 'EWHAT' }); }), true);
  assert.equal(processAlive(123, () => { throw new Error('no code at all'); }), true);
  assert.equal(processAlive(123, () => {}), true);
  assert.equal(processAlive(-1, deadSignal), true, 'unprovable pid must be treated as alive');
});

// 审查发现 4：Windows 对目录/junction 目标 link 可能返回 EACCES；对象已被证实在锁路径上时必须转为受控错误。
test('converts publish EACCES into an unsafe-lock error when an object is proven at the lock path', () => {
  const directory = makeTempDir();
  const targetDir = makeTempDir();
  try {
    fs.symlinkSync(targetDir, lockPathOf(directory), 'dir');
    const originalLinkSync = fs.linkSync;
    fs.linkSync = () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
    try {
      assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
      assert.deepEqual(fs.readdirSync(targetDir), []);
    } finally {
      fs.linkSync = originalLinkSync;
    }
  } finally {
    cleanup(directory);
    cleanup(targetDir);
  }
});

// EACCES 且锁路径为空时保留真实错误语义。
test('rethrows EACCES from publish when the lock path is provably empty', () => {
  const directory = makeTempDir();
  const originalLinkSync = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
  try {
    assert.throws(
      () => acquireInstanceLock({ directory, pid: 200 }),
      (error) => error && error.code === 'EACCES' && !/实例锁不安全/.test(error.message),
    );
  } finally {
    fs.linkSync = originalLinkSync;
    cleanup(directory);
  }
});

// 审查发现 2：持续对抗性占用导致恢复重试耗尽时必须报错，不得谎报为“已有活跃实例”。
// 捕获协议下对抗表现为：每次捕获（rename）成功后锁路径立即被回填死锁。
test('throws instead of returning null when dead-lock recovery is persistently contested', () => {
  const directory = makeTempDir();
  try {
    const plant = () => fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'contested' }));
    plant();
    const originalRenameSync = fs.renameSync;
    fs.renameSync = (from, to) => {
      originalRenameSync(from, to);
      if (from === lockPathOf(directory)) plant(); // 对抗者立即回填
    };
    try {
      assert.throws(() => acquireInstanceLock({ directory, pid: 200, signal: deadSignal }), /实例锁不安全/);
    } finally {
      fs.renameSync = originalRenameSync;
    }
  } finally {
    cleanup(directory);
  }
});

// 审查发现 9：死亡锁捕获遇到瞬时 EBUSY/EPERM 时在有限重试内恢复，最终仍失败则原样抛出。
test('retries transient EBUSY when capturing a dead lock and rethrows if persistent', () => {
  const directory = makeTempDir();
  try {
    fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'stuck' }));
    const originalRenameSync = fs.renameSync;
    fs.renameSync = (from, ...rest) => {
      if (from === lockPathOf(directory)) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      return originalRenameSync(from, ...rest);
    };
    try {
      assert.throws(
        () => acquireInstanceLock({ directory, pid: 200, signal: deadSignal }),
        (error) => error && error.code === 'EBUSY' && !/实例锁不安全/.test(error.message),
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }
  } finally {
    cleanup(directory);
  }
});

// 审查发现 3：锁目录本身是符号链接时必须拒绝，不得在锁目录外建立锁。
test('refuses to lock when the lock directory itself is a symbolic link', () => {
  const realDirectory = makeTempDir();
  const parent = makeTempDir();
  const linkDirectory = path.join(parent, 'linked-lock-dir');
  try {
    fs.symlinkSync(realDirectory, linkDirectory, 'dir');
    assert.throws(() => acquireInstanceLock({ directory: linkDirectory, pid: 200 }), /实例锁不安全/);
    assert.deepEqual(fs.readdirSync(realDirectory), [], 'nothing may be created through the link');
  } finally {
    cleanup(parent);
    cleanup(realDirectory);
  }
});

// 审查发现 11：非法 pid 直接拒绝，不得写出永远无法证明安全的锁。
test('rejects invalid pid input before touching the filesystem', () => {
  const directory = makeTempDir();
  try {
    for (const badPid of [-1, 0, Number.NaN, 1.5, '123']) {
      assert.throws(() => acquireInstanceLock({ directory, pid: badPid }), TypeError, `pid=${badPid}`);
    }
    assert.deepEqual(fs.readdirSync(directory), [], 'no lock or temp file may be created');
  } finally {
    cleanup(directory);
  }
});

// 审查第二轮发现 5：发布路径绝不对锁路径调用 openSync（发布只经 linkSync）；
// 读取路径必须显式 openSync 且在支持平台上带 O_NOFOLLOW。
test('publication never opens the lock path; record reads use an explicit no-follow descriptor', () => {
  const directory = makeTempDir();
  const lockPath = lockPathOf(directory);
  const target = path.join(directory, `dangling-target-${process.pid}-noopen`);
  const originalOpenSync = fs.openSync;
  const originalLinkSync = fs.linkSync;
  const openCalls = [];
  const linkCalls = [];
  fs.openSync = (targetPath, ...rest) => {
    openCalls.push({ target: String(targetPath), flags: rest[0] });
    return originalOpenSync(targetPath, ...rest);
  };
  fs.linkSync = (source, dest) => {
    linkCalls.push({ source: String(source), dest: String(dest) });
    return originalLinkSync(source, dest);
  };
  try {
    // (a) 悬空链接：在顶部 lstat 即被拒，发布根本不会发生；
    // 对锁路径的 openSync 一次都不允许，目标不得产生。
    fs.symlinkSync(target, lockPath);
    assert.throws(() => acquireInstanceLock({ directory, pid: 200 }), /实例锁不安全/);
    assert.equal(fs.existsSync(target), false);
    assert.equal(openCalls.some((call) => call.target === lockPath), false,
      'publication must never openSync the lock path');
    fs.unlinkSync(lockPath);
    openCalls.length = 0;
    linkCalls.length = 0;
    // (b) 干净空位：发布必须经 linkSync 落到锁路径（原子、不跟随叶节点），
    // 且全程不对锁路径 openSync。
    const first = acquireInstanceLock({ directory, pid: 100, signal: liveSignal });
    assert.equal(typeof first, 'function');
    assert.equal(linkCalls.some((call) => call.dest === lockPath), true,
      'publication must go through linkSync onto the lock path');
    assert.equal(openCalls.some((call) => call.target === lockPath), false,
      'publication must never openSync the lock path');
    openCalls.length = 0;
    linkCalls.length = 0;
    // (c) 合法活锁：读取记录必须显式打开锁路径，且在支持平台上带 O_NOFOLLOW。
    assert.equal(acquireInstanceLock({ directory, pid: 200, signal: liveSignal }), null);
    const lockReads = openCalls.filter((call) => call.target === lockPath);
    assert.ok(lockReads.length >= 1, 'record reads must open the lock path explicitly');
    if (fs.constants.O_NOFOLLOW) {
      for (const call of lockReads) {
        assert.notEqual(call.flags & fs.constants.O_NOFOLLOW, 0, 'record reads must use O_NOFOLLOW');
      }
    }
    first();
  } finally {
    fs.openSync = originalOpenSync;
    fs.linkSync = originalLinkSync;
    cleanup(directory);
  }
});

// 审查第二轮发现 1：并发恢复窗口——锁在发布失败后被他人恢复（消失），必须重试而非裸崩。
test('retries and eventually acquires when a dead lock vanishes mid-read (concurrent recovery)', () => {
  const directory = makeTempDir();
  try {
    fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'dead' }));
    const originalOpenSync = fs.openSync;
    let vanishOnce = true;
    fs.openSync = (targetPath, ...rest) => {
      if (vanishOnce && targetPath === lockPathOf(directory)) {
        vanishOnce = false;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return originalOpenSync(targetPath, ...rest);
    };
    try {
      const release = acquireInstanceLock({ directory, pid: 200, signal: deadSignal });
      assert.equal(typeof release, 'function');
      release();
    } finally {
      fs.openSync = originalOpenSync;
    }
  } finally {
    cleanup(directory);
  }
});

// 锁在取证前持续消失（对抗性占用）：耗尽后保留原始发布错误语义，不误报不安全。
test('preserves the original publish error when the lock path stays empty across retries', () => {
  const directory = makeTempDir();
  const originalLinkSync = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' }); };
  try {
    assert.throws(
      () => acquireInstanceLock({ directory, pid: 200 }),
      (error) => error && error.code === 'EEXIST' && !/实例锁不安全/.test(error.message),
    );
  } finally {
    fs.linkSync = originalLinkSync;
    cleanup(directory);
  }
});

// 审查第二轮发现 2：耗尽时不得抛出跨轮滞留的陈旧瞬时错误。
// 捕获协议版本：第 1 轮捕获（rename）瞬时 EPERM，之后每轮捕获成功但锁被回填。
test('exhaustion after contested recovery reports unsafe, not a stale transient error', () => {
  const directory = makeTempDir();
  try {
    const plant = () => fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'contested' }));
    plant();
    const originalRenameSync = fs.renameSync;
    let first = true;
    fs.renameSync = (from, to) => {
      if (from === lockPathOf(directory)) {
        if (first) {
          first = false;
          throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
        }
        originalRenameSync(from, to);
        plant(); // 对抗者立即回填死锁
        return;
      }
      return originalRenameSync(from, to);
    };
    try {
      assert.throws(
        () => acquireInstanceLock({ directory, pid: 200, signal: deadSignal }),
        (error) => /实例锁不安全/.test(error.message) && error.code !== 'EPERM',
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }
  } finally {
    cleanup(directory);
  }
});

// 审查第二轮发现 3：锁目录为悬空目录符号链接时必须先拒绝，不得穿透创建目标目录。
test('refuses a dangling directory symlink without creating its target', () => {
  const parent = makeTempDir();
  const target = path.join(parent, 'missing-target-dir');
  const linkDirectory = path.join(parent, 'linked-lock-dir');
  try {
    fs.symlinkSync(target, linkDirectory, 'dir');
    assert.throws(() => acquireInstanceLock({ directory: linkDirectory, pid: 200 }), /实例锁不安全/);
    assert.equal(fs.existsSync(target), false, 'mkdir must never follow the dangling directory link');
  } finally {
    cleanup(parent);
  }
});

// 审查第三轮低级别项：尾随分隔符不得绕过锁目录符号链接检查。
test('rejects a lock directory symlink even when the path has a trailing separator', () => {
  const realDirectory = makeTempDir();
  const parent = makeTempDir();
  const linkDirectory = path.join(parent, 'linked-lock-dir');
  try {
    fs.symlinkSync(realDirectory, linkDirectory, 'dir');
    assert.throws(() => acquireInstanceLock({ directory: `${linkDirectory}${path.sep}`, pid: 200 }), /实例锁不安全/);
    assert.deepEqual(fs.readdirSync(realDirectory), []);
  } finally {
    cleanup(parent);
    cleanup(realDirectory);
  }
});

// ---- Codex 复查阻塞项回归（A1/A2/A3） ----

// A1/A2：两个恢复者并发处理同一死亡旧锁。确定性协调：两个子进程在
// processAlive 检查处通过屏障同时通过，恢复者 B 的删除/捕获操作被推迟到
// A 发布新锁之后。旧协议下 B 会删掉 A 的新锁并双双持有（RED）；新协议下
// B 必须捕获到 A 的活锁、原样放回并被拒绝，A 的锁记录保持原样（GREEN）。
test('two concurrent recoverers of the same dead lock can never both hold it', { timeout: 60000 }, async () => {
  const directory = makeTempDir();
  const barrierDir = makeTempDir();
  const lockPath = lockPathOf(directory);
  const childSource = `
    const fs = require('node:fs');
    const path = require('node:path');
    const [modulePath, directory, name, barrierDir] = process.argv.slice(1);
    const { acquireInstanceLock } = require(modulePath);
    const lockPath = path.join(directory, '.studio-instance-lock.json');
    const flag = (n) => path.join(barrierDir, n);
    const spinUntil = (cond, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (!cond()) { if (Date.now() > deadline) { console.error(name + ' barrier timeout'); process.exit(4); } }
    };
    // 屏障 1：两个恢复者都必须先读到同一条死亡记录并通过存活检查。
    // 只有死亡旧锁的 pid 走屏障 + ESRCH；其余 pid 用真实存活检查，
    // 这样恢复者对捕获到的活锁做复核时能看到真实存活状态。
    const signal = (pid) => {
      if (pid !== 999999) return process.kill(pid, 0);
      fs.writeFileSync(flag('alive-check-' + name), '');
      spinUntil(() => fs.existsSync(flag('alive-check-a')) && fs.existsSync(flag('alive-check-b')));
      throw Object.assign(new Error(), { code: 'ESRCH' });
    };
    if (name === 'b') {
      // B 的任何锁路径删除/捕获都被推迟到 A 发布之后，制造最坏交错。
      const waitForA = () => spinUntil(() => fs.existsSync(flag('a-published')));
      const origUnlink = fs.unlinkSync;
      const origRename = fs.renameSync;
      fs.unlinkSync = (t, ...r) => { if (String(t) === lockPath) waitForA(); return origUnlink(t, ...r); };
      fs.renameSync = (a, b2) => { if (String(a) === lockPath) waitForA(); return origRename(a, b2); };
    }
    const release = acquireInstanceLock({ directory, pid: process.pid, signal });
    if (!release) { console.log(JSON.stringify({ name, acquired: false })); process.exit(0); }
    fs.writeFileSync(flag(name + '-published'), '');
    spinUntil(() => fs.existsSync(flag('release-ok')));
    const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    console.log(JSON.stringify({ name, acquired: true, token: record.token, recordPid: record.pid }));
    release();
    process.exit(0);
  `;
  try {
    // 放置一条两个恢复者都会看到的死亡旧锁。
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, token: 'old-dead-lock', createdAt: new Date().toISOString() }));
    const runChild = (name) => new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, ['-e', childSource, MODULE_PATH, directory, name, barrierDir], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', rejectPromise);
      child.on('close', (code) => resolvePromise({ code, stdout: stdout.trim(), stderr }));
    });
    const aDone = runChild('a');
    const bDone = runChild('b');
    // 等 B 出结果（拒绝或非法持有），期间读取锁记录核验 A 的锁未被替换。
    let bOutcome = null;
    const deadline = Date.now() + 45000;
    let tokenBeforeRelease = null;
    while (Date.now() < deadline) {
      if (fs.existsSync(path.join(barrierDir, 'b-published'))) break;
      const settled = await Promise.race([bDone.then((o) => o), new Promise((r) => setTimeout(() => r(null), 100))]);
      if (settled) { bOutcome = settled; break; }
    }
    if (fs.existsSync(lockPath)) tokenBeforeRelease = readRecord(directory).token;
    fs.writeFileSync(path.join(barrierDir, 'release-ok'), '');
    const outcomes = await Promise.all([aDone, bDone]);
    for (const outcome of outcomes) assert.equal(outcome.code, 0, outcome.stderr);
    const parsed = outcomes.map((outcome) => JSON.parse(outcome.stdout.split('\n').pop()));
    const holders = parsed.filter((outcome) => outcome.acquired);
    assert.equal(holders.length, 1, `exactly one recoverer may hold the lock: ${JSON.stringify(parsed)}`);
    assert.equal(holders[0].name, 'a');
    if (tokenBeforeRelease) assert.equal(holders[0].token, tokenBeforeRelease, 'recoverer B must not replace holder A lock');
    assert.equal(fs.existsSync(lockPath), false, 'holder released cleanly');
  } finally {
    cleanup(directory);
    cleanup(barrierDir);
  }
});

// Critical regression: a recoverer may pause after capturing a live holder.
test('three-process capture pause never permits A and C to hold simultaneously', { timeout: 60000 }, async () => {
  const directory = makeTempDir();
  const barrierDir = makeTempDir();
  const childSource = `
    const fs = require('node:fs');
    const path = require('node:path');
    const { acquireInstanceLock } = require(process.argv[1]);
    const directory = process.argv[2];
    const role = process.argv[3];
    const barrier = process.argv[4];
    const lockPath = path.join(directory, '${LOCK_NAME}');
    const flag = (name) => path.join(barrier, name);
    const waitFor = (name, timeout = 30000) => {
      const deadline = Date.now() + timeout;
      while (!fs.existsSync(flag(name))) {
        if (Date.now() > deadline) { console.error(role + ' timeout waiting for ' + name); process.exit(5); }
      }
    };
    const deadSignal = () => { throw Object.assign(new Error(), { code: 'ESRCH' }); };
    if (role === 'b') {
      const originalRename = fs.renameSync;
      fs.renameSync = (from, to) => {
        if (String(from) === lockPath) {
          waitFor('a-acquired');
          const result = originalRename(from, to);
          fs.writeFileSync(flag('b-captured'), '');
          waitFor('c-attempted');
          waitFor('c-done');
          return result;
        }
        return originalRename(from, to);
      };
      const signal = (pid) => {
        if (pid === 201) return;
        return deadSignal(pid);
      };
      const release = acquireInstanceLock({ directory, pid: 200, signal });
      console.log(JSON.stringify({ role, acquired: Boolean(release) }));
      process.exit(0);
    }
    if (role === 'a') {
      const release = acquireInstanceLock({ directory, pid: 201, signal: deadSignal });
      if (!release) { console.log(JSON.stringify({ role, acquired: false })); process.exit(0); }
      fs.writeFileSync(flag('a-acquired'), '');
      waitFor('c-done');
      console.log(JSON.stringify({ role, acquired: true }));
      release();
      process.exit(0);
    }
    waitFor('b-captured');
    fs.writeFileSync(flag('c-attempted'), '');
    const release = acquireInstanceLock({ directory, pid: 202, signal: deadSignal, recoverDead: false });
    fs.writeFileSync(flag('c-done'), '');
    if (release) fs.writeFileSync(flag('c-acquired'), '');
    console.log(JSON.stringify({ role, acquired: Boolean(release) }));
    if (release) release();
    process.exit(0);
  `;
  try {
    fs.writeFileSync(lockPathOf(directory), JSON.stringify({ pid: 999999, token: 'old-dead-lock', createdAt: new Date().toISOString() }));
    const run = (role) => new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, ['-e', childSource, MODULE_PATH, directory, role, barrierDir], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', rejectPromise);
      child.on('close', (code) => resolvePromise({ role, code, stdout, stderr }));
    });
    const bDone = run('b');
    // B has already read the old dead record once it reaches rename; A then
    // publishes a live lock, which B captures before C starts.
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    const aDone = run('a');
    const cDone = new Promise((resolvePromise) => {
      const poll = () => fs.existsSync(path.join(barrierDir, 'b-captured'))
        ? resolvePromise(run('c'))
        : setTimeout(poll, 10);
      poll();
    });
    const outcomes = await Promise.all([aDone, bDone, cDone]);
    outcomes.forEach((outcome) => assert.equal(outcome.code, 0, `${outcome.role}: ${outcome.stderr}`));
    const parsed = outcomes.map((outcome) => JSON.parse(outcome.stdout.trim().split('\n').pop()));
    const holders = parsed.filter((outcome) => outcome.acquired);
    assert.equal(holders.length, 1, `at most one process may report acquired: ${JSON.stringify(parsed)}`);
  } finally {
    cleanup(directory);
    cleanup(barrierDir);
  }
});

// A3：被拒绝的第二实例不得触碰项目存储、控制器、IPC 或窗口。
// 结构性约束：main.js 必须把这些全部收进显式的持锁 bootstrap 分支。
test('workbench main gates all store/controller/IPC/window bootstrap behind the held lock', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'workbench', 'main.js'), 'utf8');
  assert.match(main, /requestSingleInstanceLock\(\)/, 'native Electron lock is the authority');
  assert.match(main, /function bootstrapWorkbench\(/, 'explicit bootstrap function required');
  const bootstrapIndex = main.indexOf('function bootstrapWorkbench(');
  for (const forbidden of ['createProjectStore(', 'recoverInterruptedJobs()', 'registerIpc()', 'createWindow()']) {
    const callIndex = main.indexOf(forbidden);
    assert.ok(callIndex > bootstrapIndex, `${forbidden} must only run inside the lock-held bootstrap branch`);
  }
  // 锁被拒时唯一允许的动作：记录 denied 并退出。
  const deniedIndex = main.indexOf('single-instance-lock-denied');
  const bootstrapCallIndex = main.indexOf('bootstrapWorkbench(');
  assert.ok(deniedIndex > 0 && bootstrapCallIndex > 0 && deniedIndex !== bootstrapCallIndex);
  assert.match(main, /single-instance-lock-acquired/);
});

test('main denied path performs no state or controller initialization', () => {
  const mainPath = path.join(__dirname, '..', 'src', 'workbench', 'main.js');
  const childSource = `
    const Module = require('node:module');
    const calls = { store: 0, recover: 0, controller: 0, ipc: 0, window: 0, quit: 0, denied: 0 };
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
      if (name.includes('instance-lock')) return { acquireInstanceLock: () => null };
      return {};
    };
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === 'electron' ? electron : (request.startsWith('./') && parent && parent.filename.includes('/src/workbench/')) ? fake(request) : originalLoad(request, parent, isMain);
    require(process.argv[1]);
    setImmediate(() => { console.log(JSON.stringify(calls)); });
  `;
  const result = require('node:child_process').spawnSync(process.execPath, ['-e', childSource, mainPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const calls = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.deepEqual(calls, { store: 0, recover: 0, controller: 0, ipc: 0, window: 0, quit: 1, denied: 0 });
});
