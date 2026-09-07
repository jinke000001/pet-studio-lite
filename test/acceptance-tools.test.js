const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CdpError, discoverTarget } = require('../acceptance-tools/lib/cdp');
const { captureScreenshot, cleanElectronEnv, classifyDialogResult, platformResult, validateEvidencePath } = require('../acceptance-tools/lib/lab');
const { classifyWindowExit, selectorOperation, waitFor } = require('../acceptance-tools/lib/flow');
const { createRun, finalizeRun, loadRun, pauseRun, recordGate, resumeRun } = require('../acceptance-tools/lib/gates');
const { classifyUninstallSnapshot, waitForUninstallCompletion } = require('../acceptance-tools/lib/official-uninstall');

test('CDP connection errors and missing target are classified, not swallowed', async () => {
  await assert.rejects(() => discoverTarget({ port: 1, timeoutMs: 10 }), (error) => error instanceof CdpError && ['CDP_CONNECTION', 'ECONNREFUSED'].includes(error.code));
});

test('waitFor propagates selector failures and has deterministic timeout', async () => {
  await assert.rejects(() => waitFor(() => false, { timeoutMs: 5, intervalMs: 1, description: 'selector' }), /timed out waiting for selector/);
  assert.throws(() => selectorOperation({}, '#missing'), /connected CDP page/);
});

test('official uninstall requires stable removal instead of a fixed delay', async () => {
  const dirty = {
    uninstallerExitCode: 0,
    registryViews: [{ view: 'Registry64', exists: true }],
    installDirectoryExists: false,
    shortcutPaths: [],
    productProcesses: [],
    uninstallerProcesses: [],
  };
  const clean = { ...dirty, registryViews: [{ view: 'Registry64', exists: false }] };
  const snapshots = [dirty, clean, dirty, clean, clean, clean];
  let index = 0;
  const result = await waitForUninstallCompletion(
    async () => snapshots[Math.min(index++, snapshots.length - 1)],
    { timeoutMs: 100, intervalMs: 0, stablePolls: 3, delay: async () => {} },
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.stablePolls, 3);
  assert.equal(index, 6);
  assert.equal(classifyUninstallSnapshot(dirty).status, 'waiting');
});

test('official uninstall rejects nonzero exit and any residual lifecycle state', () => {
  const result = classifyUninstallSnapshot({
    uninstallerExitCode: 2,
    registryViews: [{ view: 'Registry64', exists: false }, { view: 'Registry32', exists: false }],
    installDirectoryExists: false,
    shortcutPaths: [{ path: 'start-menu', exists: false }],
    productProcesses: [],
    uninstallerProcesses: [],
  });
  assert.equal(result.status, 'failed');
  assert.match(result.problems.join('\n'), /exit code 2/);
});

test('Windows official uninstall probe reads the separate install key and never deletes registry evidence', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'acceptance-tools', 'ps', 'official-uninstall.ps1'), 'utf8');
  assert.match(source, /InstallRegistrySubKey/);
  assert.match(source, /ExpectedDisplayName/);
  assert.match(source, /GetFullPath/);
  assert.match(source, /GetDirectoryName/);
  assert.match(source, /UninstallString contains a line break/);
  assert.match(source, /Start-Process[^\n]+-Wait/);
  assert.match(source, /StablePolls/);
  assert.match(source, /filesystem-registry-check\.json/);
  assert.doesNotMatch(source, /Remove-Item|DeleteRegKey|DeleteSubKey/i);
  assert.doesNotMatch(source, /-Encoding utf8NoBOM/i);
  assert.doesNotMatch(source, /expected exactly one HKCU uninstall registration/i);
});

test('dialog and platform classifications never turn manual or unavailable into passed', () => {
  assert.equal(typeof captureScreenshot, 'function');
  assert.equal(classifyDialogResult({ manual: true }), 'manual-continuation');
  assert.equal(classifyDialogResult({ status: 'platform-unavailable' }), 'platform-unavailable');
  assert.equal(classifyDialogResult({ exitCode: 0 }), 'passed');
  assert.equal(platformResult('dpi').status, 'platform-unavailable');
});

test('evidence paths reject absolute, traversal, empty, symlink and out-of-root files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-evidence-'));
  try {
    fs.writeFileSync(path.join(root, 'ok.log'), 'ok');
    fs.writeFileSync(path.join(root, 'empty.log'), '');
    fs.symlinkSync(path.join(root, 'ok.log'), path.join(root, 'link.log'));
    assert.equal(validateEvidencePath(root, 'ok.log'), true);
    assert.equal(validateEvidencePath(root, 'empty.log'), false);
    assert.equal(validateEvidencePath(root, 'link.log'), false);
    assert.equal(validateEvidencePath(root, '../ok.log'), false);
    assert.equal(validateEvidencePath(root, 'C:\\ok.log'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('run state supports running → paused → running and records non-overwriting attempts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-run-'));
  const evidenceRoot = path.join(root, 'evidence'); fs.mkdirSync(evidenceRoot); fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'attempt one');
  try {
    const identity = { sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'macos-test', candidateSha256: null };
    const run = createRun({ runId: 'run-one', evidenceRoot: root, ...identity });
    assert.equal(run.state.overallStatus, 'running');
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['gate.log'] }, { evidenceRoot });
    pauseRun(run.root, { pauseReason: '等待人工', nextStep: '继续执行', unfinishedGates: ['G2'] });
    assert.equal(loadRun(run.root).state.overallStatus, 'paused');
    resumeRun(run.root, identity);
    fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'attempt two');
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['gate.log'] }, { evidenceRoot });
    assert.equal(loadRun(run.root).state.attempts.length, 2);
    assert.equal(loadRun(run.root).state.gates.length, 1);
    assert.notEqual(loadRun(run.root).state.attempts[0].evidencePaths[0], loadRun(run.root).state.attempts[1].evidencePaths[0]);
    assert.match(loadRun(run.root).state.attempts[0].evidencePaths[0], /attempts[\/\\]G1[\/\\]1[\/\\]/);
    assert.match(loadRun(run.root).state.attempts[1].evidencePaths[0], /attempts[\/\\]G1[\/\\]2[\/\\]/);
    pauseRun(run.root, { pauseReason: '再次暂停', nextStep: '核对身份' });
    assert.throws(() => resumeRun(run.root, { sourceCommit: 'd'.repeat(40) }), /identity is incomplete or changed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('finalize rejects incomplete gates, null candidate, scale mismatch and residual processes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-finalize-')); const evidenceRoot = path.join(root, 'evidence'); fs.mkdirSync(evidenceRoot); fs.writeFileSync(path.join(evidenceRoot, 'g.log'), 'e');
  try {
    const requiredGates = Array.from({ length: 60 }, (_, index) => `G${index + 1}`);
    const run = createRun({ runId: 'run-final', evidenceRoot: root, sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'windows-test', candidateSha256: null, requiredGates });
    assert.throws(() => finalizeRun(run.root, { candidateSha256: null, originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /candidateSha256/);
    assert.throws(() => finalizeRun(run.root, { candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /required gates incomplete/);
    for (const id of requiredGates) recordGate(run.root, { id, status: 'passed', exitCode: 0, evidencePaths: ['g.log'] }, { evidenceRoot });
    assert.throws(() => finalizeRun(run.root, { candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '125', cleanupStatus: 'passed' }), /scale/);
    assert.throws(() => finalizeRun(run.root, { candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed', finalProcesses: [{ ProcessId: 1 }] }), /cleanup/);
    const state = finalizeRun(run.root, { candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' });
    assert.equal(state.overallStatus, 'passed');
    const checksums = fs.readFileSync(path.join(run.root, 'returned-checksums.sha256'), 'utf8');
    assert.match(checksums, /  final-report\.json$/m);
    assert.match(checksums, /  acceptance-state\.json$/m);
    for (const line of checksums.trim().split('\n')) {
      const [expected, relativePath] = line.split('  ');
      const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(run.root, relativePath))).digest('hex');
      assert.equal(actual, expected);
    }
    assert.throws(() => finalizeRun(run.root, { candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /terminal state/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a child with no exit code is still running', () => {
  const child = { exitCode: null, signalCode: null }; assert.equal(classifyWindowExit(child), 'running');
});

test('resume requires every run identity field, including a null candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-resume-'));
  try {
    const run = createRun({ runId: 'resume-complete', evidenceRoot: root, sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'windows-test', candidateSha256: null });
    pauseRun(run.root, { pauseReason: '等待 Windows', nextStep: '继续' });
    assert.throws(() => resumeRun(run.root, { sourceCommit: 'a'.repeat(40) }), /identity.*complete|identity.*required/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('finalize rejects tampered historical evidence and writes checksum closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-finalize-tamper-'));
  const evidenceRoot = path.join(root, 'evidence'); fs.mkdirSync(evidenceRoot); fs.writeFileSync(path.join(evidenceRoot, 'g.log'), 'evidence');
  try {
    const run = createRun({ runId: 'tamper', evidenceRoot: root, sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'windows-test' });
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['g.log'] }, { evidenceRoot });
    fs.writeFileSync(path.join(run.root, 'attempts', 'G1', '1', 'g.log'), 'tampered');
    assert.throws(() => finalizeRun(run.root, { requiredGates: ['G1'], candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /hash|evidence/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('smoke screenshot operation uses the injected adapter and requires PNG plus metadata', async () => {
  const { runSmokeOperation } = require('../acceptance-tools/smoke');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-screenshot-'));
  try {
    const result = await runSmokeOperation({ platform: 'win32', operation: 'screenshot', evidenceRoot: root, capture: async (pngPath) => { fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); return { status: 'ok', windowHandle: 42, monitor: 'DISPLAY1' }; } });
    assert.equal(result.status, 'passed');
    assert.ok(fs.statSync(path.join(root, 'preflight', 'screenshot.png')).size > 0);
    assert.ok(fs.statSync(path.join(root, 'preflight', 'screenshot.json')).size > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('smoke exit cleanup writes both declared evidence files', async () => {
  const { runSmokeOperation } = require('../acceptance-tools/smoke');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-cleanup-'));
  try {
    const result = await runSmokeOperation({ platform: 'win32', operation: 'exit-cleanup', evidenceRoot: root, getProcesses: () => ({ operation: 'process-snapshot', status: 'ok', processes: [] }), getEnvironmentFingerprint: () => 'windows-test' });
    assert.equal(result.status, 'passed');
    assert.ok(fs.statSync(path.join(root, 'preflight', 'exit-cleanup.json')).size > 0);
    assert.ok(fs.statSync(path.join(root, 'preflight', 'final-processes.json')).size > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('smoke never treats a non-Windows probe as passed', async () => {
  const { runSmokeOperation } = require('../acceptance-tools/smoke');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-platform-'));
  try {
    const result = await runSmokeOperation({ platform: 'darwin', operation: 'screenshot', evidenceRoot: root });
    assert.equal(result.status, 'platform-unavailable');
    assert.equal(result.exitCode, 2);
    assert.ok(fs.statSync(path.join(root, 'preflight', 'screenshot.json')).size > 0);
    assert.equal(fs.existsSync(path.join(root, 'preflight', 'screenshot.png')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
