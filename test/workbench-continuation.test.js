const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContinuationRun, deriveCandidateSha256 } = require('../acceptance-tools/lib/continuation');
const { createRun, finalizeRun, loadRun, recordGate, resumeRun, updateRun } = require('../acceptance-tools/lib/gates');

const SOURCE_COMMIT = 'fcd10851e979e73ab524593a63e53861197102f2';
const SOURCE_ZIP_SHA256 = '69bc4eeae7b9933ad4d7fa2a8fe78c3717f4fba5f8dbf94407acd90bea83b52d';
const CONTRACT_SHA256 = '17b12e42bca85429115f13083fd7b6b81f9601fa6af050d53724fd06ca95865a';
const ENVIRONMENT_FINGERPRINT = 'win32-x64-10.0.26200-node24.17.0';
const CANDIDATE_SHA256 = '94582cd0adab5da646a502f8c65e3164cec1fd9143c14fde2d4c06c5c1393f39';
const PARENT_RUN_ID = 'run-1788809382733';
const FAILED_GATE = 'G7-02-official-uninstall';

const REQUIRED_GATE_IDS = [
  'G4-01-focused-tests', 'G4-02-npm-test', 'G4-03-typecheck', 'G4-04-build', 'G4-05-lint', 'G4-06-preflight', 'G4-07-audit',
  ...['source', 'unpacked', 'installed'].flatMap((mode) => [
    `S6-${mode}-01-immediate-preview-start`, `S6-${mode}-02-preview-survives-history-refresh`, `S6-${mode}-03-job-refresh-keeps-preview`,
    `S6-${mode}-04-switch-stops-preview`, `S6-${mode}-05-restart-recovery`, `S6-${mode}-06-explicit-stop-cleanup`,
  ]),
  'G5-01-single-instance-source', 'G5-02-single-instance-unpacked', 'G5-03-single-instance-installed',
  'G5-04-v1-directory-import', 'G5-05-v2-zip-import', 'G5-06-malicious-zip-blocked',
  'G5-07-contact-sheet-action-preview', 'G5-08-real-pet-preview-start-stop', 'G5-09-product-config',
  'G5-10-standard-package-export', 'G5-11-project-archive-export', 'G5-12-candidate-build-source',
  'G5-13-candidate-build-unpacked', 'G5-14-job-failure-retry', 'G5-15-offline-isolation', 'G5-16-general-restart-recovery',
  ...['source', 'unpacked', 'installed'].flatMap((mode) => [
    `G6-${mode}-dpi-cold-100`, `G6-${mode}-dpi-cold-125`, `G6-${mode}-dpi-cold-150`, `G6-${mode}-dynamic-dpi`,
  ]),
  'G7-01-install', 'G7-02-official-uninstall', 'G7-03-reinstall-same-package',
  'S7-01-running-build-cancel', 'S7-02-duplicate-operation-rejected',
  'U8-01-drag-feel-user-confirmation', 'U8-02-animation-experience-user-confirmation',
];

const PASSED_GATE_IDS = [
  'G4-01-focused-tests', 'G4-02-npm-test', 'G4-03-typecheck', 'G4-04-build', 'G4-05-lint', 'G4-06-preflight', 'G4-07-audit',
  'S6-source-01-immediate-preview-start', 'S6-source-02-preview-survives-history-refresh', 'S6-source-04-switch-stops-preview',
  'S6-source-06-explicit-stop-cleanup', 'S6-source-05-restart-recovery', 'G5-09-product-config', 'G5-04-v1-directory-import',
  'S6-source-03-job-refresh-keeps-preview', 'G5-10-standard-package-export', 'G5-11-project-archive-export',
  'G5-07-contact-sheet-action-preview', 'G5-08-real-pet-preview-start-stop', 'G5-12-candidate-build-source',
  'G5-01-single-instance-source', 'G5-13-candidate-build-unpacked', 'G5-02-single-instance-unpacked',
  'G7-01-install', 'G5-03-single-instance-installed',
];

const NOT_EXECUTED_GATE_IDS = REQUIRED_GATE_IDS.filter((id) => !PASSED_GATE_IDS.includes(id) && id !== FAILED_GATE);

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function candidateManifest(candidateSha256 = CANDIDATE_SHA256) {
  return JSON.stringify({
    schemaVersion: 1,
    product: { productName: 'Windows Phase 6.8', executableName: 'DesktopPetCandidate', version: '0.1.0' },
    artifacts: [
      { path: 'artifacts/desktop-pet-candidate-0.1.0-x64.exe', size: 106228404, sha256: candidateSha256 },
      { path: 'artifacts/win-unpacked/DesktopPetCandidate.exe', size: 235533824, sha256: 'a'.repeat(64) },
      { path: 'artifacts/win-unpacked/resources/app.asar', size: 10082336, sha256: 'b'.repeat(64) },
    ],
  });
}

function buildArtifacts(candidateSha256 = CANDIDATE_SHA256) {
  return JSON.stringify({
    files: [
      { path: 'C:\\wb\\exports\\candidate\\artifacts\\desktop-pet-candidate-0.1.0-x64.exe', size: 106228404, sha256: candidateSha256 },
      { path: 'C:\\wb\\exports\\candidate\\artifacts\\win-unpacked\\DesktopPetCandidate.exe', size: 235533824, sha256: 'a'.repeat(64) },
    ],
  });
}

function installPreflight(candidateSha256 = CANDIDATE_SHA256) {
  return JSON.stringify({
    installer: 'C:\\wb\\exports\\candidate\\artifacts\\desktop-pet-candidate-0.1.0-x64.exe',
    installerSize: 106228404,
    installerSha256: candidateSha256,
    existingMatches: [],
  });
}

function writeChecksumManifest(dir) {
  const files = [];
  const walk = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relativePath === 'returned-checksums.sha256') continue;
      if (entry.isDirectory()) walk(path.join(current, entry.name), relativePath);
      else files.push(relativePath);
    }
  };
  walk(dir);
  const lines = files.sort().map((relativePath) => `${sha256File(path.join(dir, ...relativePath.split('/')))}  ${relativePath}`);
  fs.writeFileSync(path.join(dir, 'returned-checksums.sha256'), `${lines.join('\n')}\n`, 'utf8');
}

function createParentReturn(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-parent-'));
  const evidenceRoot = path.join(root, 'evidence-input');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const identity = {
    sourceCommit: SOURCE_COMMIT,
    sourceZipSha256: SOURCE_ZIP_SHA256,
    acceptanceContractSha256: CONTRACT_SHA256,
    environmentFingerprint: ENVIRONMENT_FINGERPRINT,
    candidateSha256: null,
  };
  const run = createRun({ runId: PARENT_RUN_ID, evidenceRoot: root, requiredGates: REQUIRED_GATE_IDS, ...identity });
  const parentRoot = run.root;
  const gateEvidence = {
    'G5-12-candidate-build-source': {
      'g5-12/candidate-manifest.json': candidateManifest(options.manifestSha256),
      'g5-12/build-artifacts.json': buildArtifacts(options.artifactSha256),
    },
    'G7-01-install': {
      'g7-01/g7-01-install-preflight.json': installPreflight(options.installerSha256),
    },
    [FAILED_GATE]: {
      'g7-02/termination-popup.json': JSON.stringify({ cancelledOnce: true }),
    },
  };
  for (const id of REQUIRED_GATE_IDS) {
    let status = 'not-executed';
    let exitCode = 1;
    if (PASSED_GATE_IDS.includes(id)) { status = 'passed'; exitCode = 0; }
    if (id === FAILED_GATE) { status = 'failed'; exitCode = 1; }
    const evidence = gateEvidence[id] || { [`${id}/evidence.json`]: JSON.stringify({ gate: id, status }) };
    const evidencePaths = Object.keys(evidence);
    for (const [relativePath, content] of Object.entries(evidence)) {
      const target = path.join(evidenceRoot, ...relativePath.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    recordGate(parentRoot, { id, status, exitCode, command: `parent execution of ${id}`, evidencePaths }, { evidenceRoot });
  }
  updateRun(parentRoot, {
    overallStatus: 'failed',
    firstFailedGate: FAILED_GATE,
    stopReason: 'G7-02-official-uninstall termination gate failed',
    originalDisplayScale: '150%',
    finalDisplayScale: '150%',
    cleanupStatus: 'failed',
    finalProcesses: [],
  });
  writeChecksumManifest(parentRoot);
  return parentRoot;
}

function continuationIdentity(overrides = {}) {
  return {
    sourceCommit: SOURCE_COMMIT,
    sourceZipSha256: SOURCE_ZIP_SHA256,
    acceptanceContractSha256: CONTRACT_SHA256,
    environmentFingerprint: ENVIRONMENT_FINGERPRINT,
    candidateSha256: CANDIDATE_SHA256,
    ...overrides,
  };
}

function withParent(options, assertion) {
  const parentRoot = createParentReturn(options);
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-work-'));
  try {
    assertion(parentRoot, workRoot);
  } finally {
    fs.rmSync(parentRoot, { recursive: true, force: true });
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

test('a failed parent RETURN cannot be reopened by the ordinary resumeRun', () => {
  withParent({}, (parentRoot) => {
    assert.equal(loadRun(parentRoot).state.overallStatus, 'failed');
    assert.throws(() => resumeRun(parentRoot, continuationIdentity()), /only paused runs can resume/);
  });
});

test('continuation refuses a missing parent RETURN, missing checksums or incomplete identity', () => {
  withParent({}, (parentRoot, workRoot) => {
    assert.throws(
      () => createContinuationRun({ parentReturnDir: path.join(workRoot, 'does-not-exist'), evidenceRoot: workRoot, identity: continuationIdentity() }),
      /parent RETURN/i,
    );
    assert.throws(
      () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: { sourceCommit: SOURCE_COMMIT } }),
      /identity/i,
    );
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-no-checksums-'));
    try {
      fs.writeFileSync(path.join(broken, 'acceptance-state.json'), '{}\n', 'utf8');
      assert.throws(
        () => createContinuationRun({ parentReturnDir: broken, evidenceRoot: workRoot, identity: continuationIdentity() }),
        /returned-checksums/,
      );
    } finally { fs.rmSync(broken, { recursive: true, force: true }); }
  });
});

test('continuation rejects the parent RETURN when any parent evidence hash changed', () => {
  withParent({}, (parentRoot, workRoot) => {
    const target = path.join(parentRoot, 'attempts', 'G4-02-npm-test', '1', 'G4-02-npm-test', 'evidence.json');
    fs.appendFileSync(target, 'tampered\n');
    assert.throws(
      () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() }),
      /hash/i,
    );
  });
});

test('continuation rejects any identity drift: commit, source zip, contract, environment or candidate', () => {
  withParent({}, (parentRoot, workRoot) => {
    const drifts = [
      ['sourceCommit', '0'.repeat(40)],
      ['sourceZipSha256', '0'.repeat(64)],
      ['acceptanceContractSha256', '0'.repeat(64)],
      ['environmentFingerprint', 'win32-x64-10.0.99999-node24.17.0'],
      ['candidateSha256', '0'.repeat(64)],
    ];
    for (const [key, value] of drifts) {
      assert.throws(
        () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity({ [key]: value }) }),
        new RegExp(key),
        `expected rejection for ${key}`,
      );
    }
  });
});

test('candidateSha256 is never inherited as null: manifest, artifact hashes and install evidence must agree', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity({ candidateSha256: null }) });
    assert.equal(result.state.candidateSha256, CANDIDATE_SHA256);
    assert.equal(result.state.continuation.candidateSha256, CANDIDATE_SHA256);
  });
  withParent({ installerSha256: 'f'.repeat(64) }, (parentRoot, workRoot) => {
    assert.throws(
      () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() }),
      /candidate/i,
    );
  });
  withParent({ artifactSha256: 'f'.repeat(64) }, (parentRoot, workRoot) => {
    assert.throws(
      () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() }),
      /candidate/i,
    );
  });
  withParent({ manifestSha256: 'f'.repeat(64) }, (parentRoot, workRoot) => {
    assert.throws(
      () => createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() }),
      /candidate/i,
    );
  });
  assert.throws(() => deriveCandidateSha256({ gates: [] }), /candidate/i);
});

test('only passed gates with exitCode 0 and complete evidence hashes are inherited', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    const inheritedIds = result.state.gates.filter((gate) => gate.inherited === true).map((gate) => gate.id).sort();
    assert.deepEqual(inheritedIds, [...PASSED_GATE_IDS].sort());
    assert.equal(result.state.gates.length, PASSED_GATE_IDS.length);
    assert.ok(result.state.gates.every((gate) => gate.status === 'passed' && gate.exitCode === 0));
    assert.ok(result.state.gates.every((gate) => gate.parentEvidencePaths.length > 0));
    const notInherited = result.state.continuation.notInheritedGates.map((entry) => entry.id).sort();
    assert.deepEqual(notInherited, [FAILED_GATE, ...NOT_EXECUTED_GATE_IDS].sort());
    assert.equal(result.state.continuation.notInheritedGates.find((entry) => entry.id === FAILED_GATE).status, 'failed');
  });
});

test('failed, not-executed and environment-blocked parent gates are never inherited as passed', () => {
  withParent({}, (parentRoot, workRoot) => {
    const parentStatePath = path.join(parentRoot, 'acceptance-state.json');
    const state = JSON.parse(fs.readFileSync(parentStatePath, 'utf8'));
    for (const gate of state.gates) {
      if (gate.id === FAILED_GATE) gate.status = 'environment-blocked';
    }
    fs.writeFileSync(parentStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    writeChecksumManifest(parentRoot);
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    assert.equal(result.state.gates.some((gate) => gate.id === FAILED_GATE), false);
    assert.equal(result.state.gates.some((gate) => gate.status !== 'passed'), false);
  });
});

test('inherited gates record parentRunId, parent checksum digest, original attempt and inherited=true', () => {
  withParent({}, (parentRoot, workRoot) => {
    const parentReturnSha256 = sha256File(path.join(parentRoot, 'returned-checksums.sha256'));
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    assert.equal(result.state.continuation.parentRunId, PARENT_RUN_ID);
    assert.equal(result.state.continuation.parentReturnSha256, parentReturnSha256);
    assert.equal(result.state.continuation.parentFirstFailedGate, FAILED_GATE);
    for (const gate of result.state.gates) {
      assert.equal(gate.inherited, true);
      assert.equal(gate.parentRunId, PARENT_RUN_ID);
      assert.equal(gate.parentReturnSha256, parentReturnSha256);
      assert.equal(gate.attempt, 1);
      assert.ok(Object.keys(gate.parentEvidenceSha256).length > 0);
    }
  });
});

test('the continuation starts at the failed gate without rewriting the parent record', () => {
  withParent({}, (parentRoot, workRoot) => {
    const parentStatePath = path.join(parentRoot, 'acceptance-state.json');
    const parentStateBefore = sha256File(parentStatePath);
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    assert.notEqual(result.state.runId, PARENT_RUN_ID);
    assert.notEqual(path.resolve(result.root), path.resolve(parentRoot));
    assert.equal(result.state.gates.some((gate) => gate.id === FAILED_GATE), false);
    assert.equal(sha256File(parentStatePath), parentStateBefore);
    assert.equal(loadRun(parentRoot).state.overallStatus, 'failed');
    assert.equal(loadRun(parentRoot).state.gates.find((gate) => gate.id === FAILED_GATE).status, 'failed');
    const g702 = REQUIRED_GATE_IDS.indexOf(FAILED_GATE);
    const pending = REQUIRED_GATE_IDS.slice(g702).filter((id) => !result.state.gates.some((gate) => gate.id === id));
    assert.equal(pending[0], FAILED_GATE);
  });
});

test('a continuation finalizes only after all remaining gates are executed for real', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    const runRoot = result.root;
    const evidenceRoot = path.join(workRoot, 'new-evidence');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'real execution evidence\n', 'utf8');
    assert.throws(
      () => finalizeRun(runRoot, { candidateSha256: CANDIDATE_SHA256, originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] }),
      /required gates incomplete/,
    );
    for (const id of [FAILED_GATE, ...NOT_EXECUTED_GATE_IDS]) {
      recordGate(runRoot, { id, status: 'passed', exitCode: 0, command: `continuation execution of ${id}`, evidencePaths: ['gate.log'] }, { evidenceRoot });
    }
    assert.throws(
      () => finalizeRun(runRoot, { candidateSha256: '0'.repeat(64), originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] }),
      /candidateSha256/,
    );
    const finalState = finalizeRun(runRoot, { candidateSha256: CANDIDATE_SHA256, originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] });
    assert.equal(finalState.overallStatus, 'passed');
    assert.equal(finalState.gates.length, REQUIRED_GATE_IDS.length);
    assert.equal(finalState.gates.filter((gate) => gate.inherited === true).length, PASSED_GATE_IDS.length);
    assert.ok(fs.existsSync(path.join(runRoot, 'returned-checksums.sha256')));
  });
});

test('finalize of a continuation re-verifies the parent RETURN instead of trusting copied state', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    const evidenceRoot = path.join(workRoot, 'new-evidence');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'real execution evidence\n', 'utf8');
    for (const id of [FAILED_GATE, ...NOT_EXECUTED_GATE_IDS]) {
      recordGate(result.root, { id, status: 'passed', exitCode: 0, command: `continuation execution of ${id}`, evidencePaths: ['gate.log'] }, { evidenceRoot });
    }
    const tampered = path.join(parentRoot, 'attempts', 'G7-01-install', '1', 'g7-01', 'g7-01-install-preflight.json');
    fs.appendFileSync(tampered, 'tampered\n');
    assert.throws(
      () => finalizeRun(result.root, { candidateSha256: CANDIDATE_SHA256, originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] }),
      /parent|hash/i,
    );
  });
});

test('continuation cannot be minted from a paused or passed parent run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-nonfailed-'));
  try {
    const identity = { sourceCommit: SOURCE_COMMIT, sourceZipSha256: SOURCE_ZIP_SHA256, acceptanceContractSha256: CONTRACT_SHA256, environmentFingerprint: ENVIRONMENT_FINGERPRINT, candidateSha256: null };
    const run = createRun({ runId: 'run-paused', evidenceRoot: root, ...identity });
    updateRun(run.root, { overallStatus: 'paused', pauseReason: '等待', nextStep: '继续' });
    writeChecksumManifest(run.root);
    assert.throws(
      () => createContinuationRun({ parentReturnDir: run.root, evidenceRoot: root, identity: continuationIdentity({ candidateSha256: null }) }),
      /paused|resume/i,
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---- validator continuation reporting against a real continued RETURN ----

const VALIDATOR = path.resolve(__dirname, '..', 'scripts', 'validate-windows-return.js');

function finalizeContinuation(parentRoot, workRoot) {
  const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
  const evidenceRoot = path.join(workRoot, 'new-evidence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'real execution evidence\n', 'utf8');
  for (const id of [FAILED_GATE, ...NOT_EXECUTED_GATE_IDS]) {
    recordGate(result.root, { id, status: 'passed', exitCode: 0, command: `continuation execution of ${id}`, evidencePaths: ['gate.log'] }, { evidenceRoot });
  }
  finalizeRun(result.root, { candidateSha256: CANDIDATE_SHA256, originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] });
  return result;
}

function runReturnValidator(returnDir, extraArguments = []) {
  return require('node:child_process').spawnSync(process.execPath, [
    VALIDATOR,
    returnDir,
    '--expect-source-commit', SOURCE_COMMIT,
    '--expect-source-zip-sha256', SOURCE_ZIP_SHA256,
    '--expect-candidate-sha256', CANDIDATE_SHA256,
    '--expect-contract-sha256', CONTRACT_SHA256,
    '--expect-environment-fingerprint', ENVIRONMENT_FINGERPRINT,
    '--required-gates', REQUIRED_GATE_IDS.join(','),
    ...extraArguments,
  ], { encoding: 'utf8' });
}

test('validator reports parent and continuation verdicts separately for a completed continuation RETURN', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = finalizeContinuation(parentRoot, workRoot);
    const parentReturnSha256 = sha256File(path.join(parentRoot, 'returned-checksums.sha256'));
    const validated = runReturnValidator(result.root, ['--json', '--parent-return', parentRoot, '--expect-parent-return-sha256', parentReturnSha256]);
    assert.equal(validated.status, 0, validated.stderr + validated.stdout);
    const report = JSON.parse(validated.stdout);
    assert.equal(report.status, 'passed');
    assert.equal(report.acceptancePassed, true);
    assert.equal(report.parentReturnValid, true);
    assert.equal(report.continuationIdentityValid, true);
    assert.equal(report.inheritedGateCount, PASSED_GATE_IDS.length);
    assert.equal(report.executedGateCount, NOT_EXECUTED_GATE_IDS.length + 1);
  });
});

test('validator rejects a continuation RETURN when the parent RETURN is missing, tampered or misbound', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = finalizeContinuation(parentRoot, workRoot);
    const parentReturnSha256 = sha256File(path.join(parentRoot, 'returned-checksums.sha256'));
    const missing = runReturnValidator(result.root, ['--json']);
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).parentReturnValid, false);
    const wrongDigest = runReturnValidator(result.root, ['--json', '--parent-return', parentRoot, '--expect-parent-return-sha256', '0'.repeat(64)]);
    assert.equal(wrongDigest.status, 1);
    assert.match(wrongDigest.stdout, /parent-return-sha256/);
    fs.appendFileSync(path.join(parentRoot, 'attempts', 'G4-01-focused-tests', '1', 'G4-01-focused-tests', 'evidence.json'), 'tampered\n');
    const tampered = runReturnValidator(result.root, ['--json', '--parent-return', parentRoot, '--expect-parent-return-sha256', parentReturnSha256]);
    assert.equal(tampered.status, 1);
    assert.equal(JSON.parse(tampered.stdout).parentReturnValid, false);
  });
});

test('validator refuses inherited pass claims that are not backed by a real parent passed gate', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = finalizeContinuation(parentRoot, workRoot);
    const parentReturnSha256 = sha256File(path.join(parentRoot, 'returned-checksums.sha256'));
    const statePath = path.join(result.root, 'acceptance-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    // Forge an inherited pass for the parent FAILED gate and re-freeze the
    // RETURN checksums: the validator must reject it against the parent record.
    const forged = { ...state.gates[0], id: FAILED_GATE, evidencePaths: [], evidenceSha256: {} };
    state.continuation.inheritedGateIds.push(FAILED_GATE);
    state.gates.push(forged);
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    writeChecksumManifest(result.root);
    const validated = runReturnValidator(result.root, ['--json', '--parent-return', parentRoot, '--expect-parent-return-sha256', parentReturnSha256]);
    assert.equal(validated.status, 1);
    const report = JSON.parse(validated.stdout);
    assert.equal(report.continuationIdentityValid, false);
    assert.ok(report.failures.some((check) => check.rule === 'continuation:inherited-gates-match-parent'));
  });
});

test('finalize rejects a forged inherited gate before any checksum is frozen', () => {
  withParent({}, (parentRoot, workRoot) => {
    const result = createContinuationRun({ parentReturnDir: parentRoot, evidenceRoot: workRoot, identity: continuationIdentity() });
    const evidenceRoot = path.join(workRoot, 'new-evidence');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'gate.log'), 'real execution evidence\n', 'utf8');
    for (const id of [FAILED_GATE, ...NOT_EXECUTED_GATE_IDS]) {
      recordGate(result.root, { id, status: 'passed', exitCode: 0, command: `continuation execution of ${id}`, evidencePaths: ['gate.log'] }, { evidenceRoot });
    }
    const statePath = path.join(result.root, 'acceptance-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.gates.find((gate) => gate.id === 'G7-01-install').parentEvidenceSha256 = { 'forged.json': '0'.repeat(64) };
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    assert.throws(
      () => finalizeRun(result.root, { candidateSha256: CANDIDATE_SHA256, originalDisplayScale: '150%', finalDisplayScale: '150%', cleanupStatus: 'passed', finalProcesses: [] }),
      /inherited|parent|evidence|hash/i,
    );
  });
});
