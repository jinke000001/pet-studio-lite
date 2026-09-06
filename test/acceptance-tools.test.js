const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CdpError, discoverTarget } = require('../acceptance-tools/lib/cdp');
const { cleanElectronEnv, classifyDialogResult, platformResult, validateEvidencePath } = require('../acceptance-tools/lib/lab');
const { classifyWindowExit, selectorOperation, waitFor } = require('../acceptance-tools/lib/flow');
const { createRun, finalizeRun, loadRun, pauseRun, recordGate, resumeRun } = require('../acceptance-tools/lib/gates');

test('CDP connection errors and missing target are classified, not swallowed', async () => {
  await assert.rejects(() => discoverTarget({ port: 1, timeoutMs: 10 }), (error) => error instanceof CdpError && ['CDP_CONNECTION', 'ECONNREFUSED'].includes(error.code));
});

test('waitFor propagates selector failures and has deterministic timeout', async () => {
  await assert.rejects(() => waitFor(() => false, { timeoutMs: 5, intervalMs: 1, description: 'selector' }), /timed out waiting for selector/);
  assert.throws(() => selectorOperation({}, '#missing'), /connected CDP page/);
});

test('dialog and platform classifications never turn manual or unavailable into passed', () => {
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
    const run = createRun({ runId: 'run-one', evidenceRoot: root, sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'macos-test' });
    assert.equal(run.state.overallStatus, 'running');
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['gate.log'] }, { evidenceRoot });
    pauseRun(run.root, { pauseReason: '等待人工', nextStep: '继续执行', unfinishedGates: ['G2'] });
    assert.equal(loadRun(run.root).state.overallStatus, 'paused');
    resumeRun(run.root, { sourceCommit: 'a'.repeat(40), sourceZipSha256: 'b'.repeat(64), acceptanceContractSha256: 'c'.repeat(64), environmentFingerprint: 'macos-test' });
    fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'attempt two');
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['gate.log'] }, { evidenceRoot });
    assert.equal(loadRun(run.root).state.attempts.length, 2);
    pauseRun(run.root, { pauseReason: '再次暂停', nextStep: '核对身份' });
    assert.throws(() => resumeRun(run.root, { sourceCommit: 'd'.repeat(40) }), /identity changed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('finalize rejects incomplete gates, null candidate, scale mismatch and residual processes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-finalize-')); const evidenceRoot = path.join(root, 'evidence'); fs.mkdirSync(evidenceRoot); fs.writeFileSync(path.join(evidenceRoot, 'g.log'), 'e');
  try {
    const run = createRun({ runId: 'run-final', evidenceRoot: root });
    recordGate(run.root, { id: 'G1', status: 'passed', exitCode: 0, evidencePaths: ['g.log'] }, { evidenceRoot });
    assert.throws(() => finalizeRun(run.root, { requiredGates: ['G1', 'G2'], candidateSha256: null, originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /candidateSha256/);
    assert.throws(() => finalizeRun(run.root, { requiredGates: ['G1'], candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '125', cleanupStatus: 'passed' }), /scale/);
    assert.throws(() => finalizeRun(run.root, { requiredGates: ['G1'], candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed', finalProcesses: [{ ProcessId: 1 }] }), /cleanup/);
    const state = finalizeRun(run.root, { requiredGates: ['G1'], candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' });
    assert.equal(state.overallStatus, 'passed');
    assert.throws(() => finalizeRun(run.root, { requiredGates: ['G1'], candidateSha256: 'd'.repeat(64), originalDisplayScale: '100', finalDisplayScale: '100', cleanupStatus: 'passed' }), /terminal state/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('early window exit is explicit', () => {
  const child = { exitCode: null }; assert.equal(classifyWindowExit(child), 'window-exited-early');
});
