// Phase 6 实例锁协议选型探针（Phase B 实验）。
// 对两种候选协议在真实文件系统上做小型、隔离、可撤销实验：
//   方案 1：同目录随机临时文件 -> 完整写入 -> linkSync 原子发布（不跟随目标叶节点）。
//   方案 2：mkdirSync 原子目录锁。
// 只用唯一临时目录，try/finally 清理；不触碰锁目录外的任何对象。
// 运行：node test/instance-lock-protocol-probe.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lock-probe-'));
const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
}

function publishViaLink(directory) {
  // 方案 1 核心：临时文件 + linkSync 发布。返回 'acquired' 或 error.code。
  const lockPath = path.join(directory, '.studio-instance-lock.json');
  const tempPath = path.join(directory, `.studio-instance-lock.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, token: 'probe', createdAt: new Date().toISOString() })}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.linkSync(tempPath, lockPath);
    return 'acquired';
  } catch (error) {
    return error.code || String(error);
  } finally {
    try { fs.unlinkSync(tempPath); } catch { /* already published or never created */ }
  }
}

try {
  // ---- 方案 1：linkSync 发布 ----
  {
    // P1-悬空链接：发布必须拒绝且不得创建目标。
    const dir = fs.mkdtempSync(path.join(root, 'p1-'));
    const target = path.join(dir, 'dangling-target');
    fs.symlinkSync(target, path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaLink(dir);
    record('P1-dangling-symlink', outcome === 'EEXIST' && !fs.existsSync(target), `outcome=${outcome} targetCreated=${fs.existsSync(target)}`);
  }
  {
    // P2-链接指向已有文件：目标内容与哈希不变。
    const dir = fs.mkdtempSync(path.join(root, 'p2-'));
    const target = path.join(dir, 'existing-target');
    fs.writeFileSync(target, 'do-not-touch');
    fs.symlinkSync(target, path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaLink(dir);
    record('P2-symlink-to-file', outcome === 'EEXIST' && fs.readFileSync(target, 'utf8') === 'do-not-touch', `outcome=${outcome} content=${fs.readFileSync(target, 'utf8')}`);
  }
  {
    // P3-链接指向目录（junction 的 POSIX 类比）。
    const dir = fs.mkdtempSync(path.join(root, 'p3-'));
    const targetDir = fs.mkdtempSync(path.join(root, 'p3-target-'));
    fs.symlinkSync(targetDir, path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaLink(dir);
    record('P3-symlink-to-dir', outcome === 'EEXIST', `outcome=${outcome}`);
  }
  {
    // P4-锁路径已是真实目录。
    const dir = fs.mkdtempSync(path.join(root, 'p4-'));
    fs.mkdirSync(path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaLink(dir);
    record('P4-real-directory', outcome === 'EEXIST', `outcome=${outcome}`);
  }
  {
    // P5-锁路径已是普通文件。
    const dir = fs.mkdtempSync(path.join(root, 'p5-'));
    fs.writeFileSync(path.join(dir, '.studio-instance-lock.json'), '{}');
    const outcome = publishViaLink(dir);
    record('P5-regular-file', outcome === 'EEXIST', `outcome=${outcome}`);
  }
  {
    // P6-发布后记录完整且临时文件已清理。
    const dir = fs.mkdtempSync(path.join(root, 'p6-'));
    const outcome = publishViaLink(dir);
    const recordText = fs.readFileSync(path.join(dir, '.studio-instance-lock.json'), 'utf8');
    const parsed = JSON.parse(recordText);
    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    record('P6-publish-atomic', outcome === 'acquired' && typeof parsed.pid === 'number' && parsed.token === 'probe' && leftovers.length === 0, `outcome=${outcome} leftovers=${leftovers.length}`);
  }
  {
    // P7-并发发布：8 个真实子进程竞争同一路径，恰好 1 个成功。
    const dir = fs.mkdtempSync(path.join(root, 'p7-'));
    const worker = `const fs=require('node:fs'),path=require('node:path');const dir=process.argv[1];const lock=path.join(dir,'.studio-instance-lock.json');const tmp=path.join(dir,'tmp-'+process.pid);fs.writeFileSync(tmp,'x');try{fs.linkSync(tmp,lock);console.log('acquired')}catch(e){console.log(e.code||'ERR')}fs.unlinkSync(tmp);`;
    const runs = Array.from({ length: 8 }, () => spawnSync(process.execPath, ['-e', worker, dir], { encoding: 'utf8' }));
    const acquired = runs.filter((run) => run.stdout.trim() === 'acquired').length;
    const eexist = runs.filter((run) => run.stdout.trim() === 'EEXIST').length;
    record('P7-concurrent-publish', acquired === 1 && acquired + eexist === 8, `acquired=${acquired} eexist=${eexist}`);
  }

  // ---- 方案 2：mkdirSync 目录锁 ----
  const publishViaMkdir = (directory) => {
    try { fs.mkdirSync(path.join(directory, '.studio-instance-lock.json')); return 'acquired'; } catch (error) { return error.code || String(error); }
  };
  {
    const dir = fs.mkdtempSync(path.join(root, 'm1-'));
    const target = path.join(dir, 'dangling-target');
    fs.symlinkSync(target, path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaMkdir(dir);
    record('M1-dangling-symlink', outcome === 'EEXIST' && !fs.existsSync(target), `outcome=${outcome} targetCreated=${fs.existsSync(target)}`);
  }
  {
    const dir = fs.mkdtempSync(path.join(root, 'm2-'));
    const targetDir = fs.mkdtempSync(path.join(root, 'm2-target-'));
    fs.symlinkSync(targetDir, path.join(dir, '.studio-instance-lock.json'));
    const outcome = publishViaMkdir(dir);
    record('M2-symlink-to-dir', outcome === 'EEXIST', `outcome=${outcome}`);
  }
  {
    // M3-目录锁与旧版文件锁格式的互相 fail-closed：旧版 lstat 看到目录不是普通文件。
    const dir = fs.mkdtempSync(path.join(root, 'm3-'));
    const outcome = publishViaMkdir(dir);
    const stats = fs.lstatSync(path.join(dir, '.studio-instance-lock.json'));
    record('M3-dir-lock-legacy-view', outcome === 'acquired' && stats.isDirectory() && !stats.isFile(), `outcome=${outcome} legacySeesFile=${stats.isFile()}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`probe summary: ${results.length - failed.length}/${results.length} pass; probeDirRemoved=${!fs.existsSync(root)}`);
process.exitCode = failed.length ? 1 : 0;
