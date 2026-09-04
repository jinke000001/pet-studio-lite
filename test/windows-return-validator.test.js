const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'validate-windows-return.js');
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_ZIP_SHA256 = 'b'.repeat(64);
const CANDIDATE_SHA256 = 'c'.repeat(64);
const CONTRACT_SHA256 = 'd'.repeat(64);
const ENVIRONMENT_FINGERPRINT = 'windows-10-19045-x64';
const REQUIRED_GATES = ['G1-01-process-cleanup', 'G4-02-instance-lock'];
const EXPECTED_PROCESS_PATHS = ['C:\\Acceptance\\Pet\\Pet.exe'];

const DEFAULT_EVIDENCE = {
  'automated/02-instance-lock-focused.log': 'G4-02 instance lock probe: second instance refused, exit code 0\n',
  'automated/final-processes.log': 'final process enumeration: 0 acceptance product processes remain\n',
};

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function baseState(evidence) {
  const gateFor = (id, evidencePath) => ({
    id,
    status: 'passed',
    command: `powershell -NoProfile -Command "run ${id}"`,
    startedAt: '2026-09-01T09:55:00.000Z',
    endedAt: '2026-09-01T09:56:00.000Z',
    exitCode: 0,
    evidencePaths: [evidencePath],
    evidenceSha256: { [evidencePath]: sha256Text(evidence[evidencePath]) },
  });
  return {
    sourceCommit: SOURCE_COMMIT,
    sourceZipSha256: SOURCE_ZIP_SHA256,
    candidateSha256: CANDIDATE_SHA256,
    acceptanceContractSha256: CONTRACT_SHA256,
    environmentFingerprint: ENVIRONMENT_FINGERPRINT,
    overallStatus: 'passed',
    firstFailedGate: null,
    originalDisplayScale: '96',
    finalDisplayScale: '96',
    cleanupStatus: 'passed',
    gates: [
      gateFor('G1-01-process-cleanup', 'automated/final-processes.log'),
      gateFor('G4-02-instance-lock', 'automated/02-instance-lock-focused.log'),
    ],
    evidenceFiles: Object.keys(evidence).sort(),
    finalProcesses: [
      { Name: 'explorer.exe', ProcessId: 4212, ExecutablePath: 'C:\\Windows\\explorer.exe', CommandLine: '' },
    ],
  };
}

function writeEvidence(returnDir, relativePath, content) {
  const target = path.join(returnDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function listFilesRecursive(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory()
        ? listFilesRecursive(path.join(directory, entry.name), relativePath)
        : [relativePath];
    })
    .sort();
}

function writeChecksums(returnDir, mode) {
  if (mode === 'missing') return;
  let entries = listFilesRecursive(returnDir)
    .filter((relativePath) => relativePath !== 'returned-checksums.sha256');
  if (mode === 'omit-evidence') {
    entries = entries.filter((relativePath) => relativePath !== 'automated/final-processes.log');
  }
  const lines = entries.map((relativePath) => {
    const digest = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(returnDir, ...relativePath.split('/'))))
      .digest('hex');
    return `${digest}  ${relativePath}`;
  });
  if (mode === 'self') lines.push(`${'0'.repeat(64)}  returned-checksums.sha256`);
  if (mode === 'duplicate') lines.push(lines[0]);
  if (mode === 'directory-entry') lines.push(`${'1'.repeat(64)}  automated`);
  let content = `${lines.join('\n')}\n`;
  if (mode === 'crlf') content = content.replace(/\n/g, '\r\n');
  if (mode === 'bom') content = '\uFEFF' + content;
  fs.writeFileSync(path.join(returnDir, 'returned-checksums.sha256'), content, 'utf8');
}

function createFixture(options = {}) {
  const returnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-windows-return-'));
  try {
    const evidence = { ...DEFAULT_EVIDENCE, ...(options.evidenceContent || {}) };
    const state = baseState(evidence);
    if (options.mutateState) options.mutateState(state);
    for (const [relativePath, content] of Object.entries(evidence)) {
      if ((options.missingEvidence || []).includes(relativePath)) continue;
      if ((options.symlinkEvidence || []).includes(relativePath)) {
        const target = path.join(returnDir, 'automated', 'symlink-target.txt');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
        fs.symlinkSync(target, path.join(returnDir, ...relativePath.split('/')));
        continue;
      }
      writeEvidence(returnDir, relativePath, content);
    }
    const stateMode = options.acceptanceState || 'ok';
    if (stateMode === 'corrupt') {
      fs.writeFileSync(path.join(returnDir, 'acceptance-state.json'), '{ this is not json', 'utf8');
    } else if (stateMode !== 'missing') {
      fs.writeFileSync(
        path.join(returnDir, 'acceptance-state.json'),
        `${JSON.stringify(state, null, 2)}\n`,
        'utf8',
      );
    }
    writeChecksums(returnDir, options.checksums || 'ok');
    return returnDir;
  } catch (error) {
    fs.rmSync(returnDir, { recursive: true, force: true });
    throw error;
  }
}

function runValidator(returnDir, extraArguments = []) {
  return childProcess.spawnSync(process.execPath, [
    SCRIPT,
    returnDir,
    '--expect-source-commit', SOURCE_COMMIT,
    '--expect-source-zip-sha256', SOURCE_ZIP_SHA256,
    '--expect-candidate-sha256', CANDIDATE_SHA256,
    '--required-gates', REQUIRED_GATES.join(','),
    '--expect-process-paths', EXPECTED_PROCESS_PATHS.join(','),
    '--expect-contract-sha256', CONTRACT_SHA256,
    '--expect-environment-fingerprint', ENVIRONMENT_FINGERPRINT,
    ...extraArguments,
  ], { encoding: 'utf8' });
}

function runLegacyValidator(returnDir, extraArguments = []) {
  return childProcess.spawnSync(process.execPath, [
    SCRIPT,
    returnDir,
    '--expect-source-commit', SOURCE_COMMIT,
    '--expect-source-zip-sha256', SOURCE_ZIP_SHA256,
    '--expect-candidate-sha256', CANDIDATE_SHA256,
    '--required-gates', REQUIRED_GATES.join(','),
    '--expect-process-paths', EXPECTED_PROCESS_PATHS.join(','),
    ...extraArguments,
  ], { encoding: 'utf8' });
}

function runContractValidatorWithoutCandidate(returnDir, extraArguments = []) {
  return childProcess.spawnSync(process.execPath, [
    SCRIPT,
    returnDir,
    '--expect-source-commit', SOURCE_COMMIT,
    '--expect-source-zip-sha256', SOURCE_ZIP_SHA256,
    '--required-gates', REQUIRED_GATES.join(','),
    '--expect-process-paths', EXPECTED_PROCESS_PATHS.join(','),
    '--expect-contract-sha256', CONTRACT_SHA256,
    '--expect-environment-fingerprint', ENVIRONMENT_FINGERPRINT,
    ...extraArguments,
  ], { encoding: 'utf8' });
}

function withFixture(options, assertion) {
  const returnDir = createFixture(options);
  try {
    assertion(returnDir);
  } finally {
    fs.rmSync(returnDir, { recursive: true, force: true });
  }
}

test('fully compliant RETURN directory passes with exit code 0', () => {
  withFixture({}, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /PASS acceptance-state:schema/);
    assert.match(result.stdout, /RESULT PASS/);
  });
});

test('missing evidence file fails with exit code 1', () => {
  withFixture({ missingEvidence: ['automated/02-instance-lock-focused.log'] }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:paths/);
    assert.match(result.stdout, /02-instance-lock-focused\.log/);
  });
});

test('forged pass: overallStatus=passed with a failed required gate fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].status = 'failed';
      state.firstFailedGate = 'G4-02-instance-lock';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gate:G4-02-instance-lock/);
  });
});

test('wrong evidence SHA-256 fails with exit code 1', () => {
  withFixture({
    mutateState(state) {
      state.gates[0].evidenceSha256['automated/final-processes.log'] = '0'.repeat(64);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:sha256/);
  });
});

test('passed overall status with a not-executed required gate fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].status = 'not-executed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gate:G4-02-instance-lock/);
  });
});

test('process gate with exitCode=1 (PowerShell syntax error) fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[0].exitCode = 1;
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL cleanup:process-gate-exit-codes/);
    assert.match(result.stdout, /exitCode=1/);
  });
});

test('residual accepted product process at an expected path fails', () => {
  withFixture({
    mutateState(state) {
      state.finalProcesses.push({
        Name: 'Pet.exe',
        ProcessId: 9999,
        ExecutablePath: 'c:\\acceptance\\pet\\pet.exe',
        CommandLine: '"c:\\acceptance\\pet\\pet.exe"',
      });
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL cleanup:no-residual-processes/);
  });
});

test('display scale mismatch (original=96 final=120) fails', () => {
  withFixture({
    mutateState(state) {
      state.finalDisplayScale = '120';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL display-scale:consistent/);
  });
});

test('returned-checksums.sha256 with UTF-8 BOM fails', () => {
  withFixture({ checksums: 'bom' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:encoding/);
    assert.match(result.stdout, /BOM/);
  });
});

test('returned-checksums.sha256 with CRLF line endings fails', () => {
  withFixture({ checksums: 'crlf' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:encoding/);
    assert.match(result.stdout, /CR byte/);
  });
});

test('returned-checksums.sha256 listing itself fails', () => {
  withFixture({ checksums: 'self' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:no-self-entry/);
  });
});

test('overallStatus=failed with null firstFailedGate fails', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'failed';
      state.gates[1].status = 'failed';
      state.firstFailedGate = null;
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL status:first-failed-gate/);
    assert.match(result.stdout, /firstFailedGate is null/);
  });
});

test('overallStatus=failed with a passed gate after firstFailedGate fails', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'failed';
      state.firstFailedGate = 'G1-01-process-cleanup';
      state.gates[0].status = 'failed';
      state.gates[1].status = 'passed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL status:first-failed-gate/);
    assert.match(result.stdout, /must be not-executed/);
  });
});

test('mismatched sourceCommit fails identity check', () => {
  withFixture({
    mutateState(state) {
      state.sourceCommit = 'd'.repeat(40);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:source-commit/);
  });
});

test('mismatched sourceZipSha256 fails identity check', () => {
  withFixture({
    mutateState(state) {
      state.sourceZipSha256 = 'e'.repeat(64);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:source-zip-sha256/);
  });
});

test('passed report with a mismatched explicitly expected contract identity fails', () => {
  withFixture({
    mutateState(state) {
      state.acceptanceContractSha256 = 'e'.repeat(64);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:acceptance-contract-sha256/);
  });
});

test('passed report with a mismatched explicitly expected environment identity fails', () => {
  withFixture({
    mutateState(state) {
      state.environmentFingerprint = 'windows-11-different-machine';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:environment-fingerprint/);
  });
});

test('passed report missing explicitly expected contract and environment identities fails', () => {
  withFixture({
    mutateState(state) {
      delete state.acceptanceContractSha256;
      delete state.environmentFingerprint;
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:acceptance-contract-sha256/);
    assert.match(result.stdout, /FAIL identity:environment-fingerprint/);
  });
});

test('passed report with correct explicit identities passes', () => {
  withFixture({}, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /PASS identity:acceptance-contract-sha256/);
    assert.match(result.stdout, /PASS identity:environment-fingerprint/);
  });
});

test('legacy invocation remains compatible when optional identity expectations are omitted', () => {
  withFixture({
    mutateState(state) {
      delete state.acceptanceContractSha256;
      delete state.environmentFingerprint;
    },
  }, (returnDir) => {
    const result = runLegacyValidator(returnDir);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.doesNotMatch(result.stdout, /identity:acceptance-contract-sha256/);
    assert.doesNotMatch(result.stdout, /identity:environment-fingerprint/);
  });
});

test('new-contract passed evidence cannot omit the explicit candidate expectation', () => {
  withFixture({}, (returnDir) => {
    const result = runContractValidatorWithoutCandidate(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:candidate-sha256-required/);
  });
});

test('missing acceptance-state.json fails with exit code 1', () => {
  withFixture({ acceptanceState: 'missing' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL acceptance-state:exists/);
  });
});

test('corrupt acceptance-state.json fails with exit code 1', () => {
  withFixture({ acceptanceState: 'corrupt' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL acceptance-state:parse/);
  });
});

test('environment-blocked overall status fails with environment-blocked reason', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'environment-blocked';
      state.gates[1].status = 'environment-blocked';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /environment-blocked/);
    assert.match(result.stdout, /FAIL status:overall/);
  });
});

test('paused overall status is explicit, fails overall acceptance, and emits a continuation summary', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '用户中止，待继续';
      state.nextStep = '先排查原生文件对话框';
      state.acceptanceContractSha256 = 'd'.repeat(64);
      state.environmentFingerprint = 'windows-10-19045-x64';
      state.gates[1].status = 'not-executed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'paused');
    assert.equal(report.acceptancePassed, false);
    assert.equal(report.evidenceValid, true);
    assert.equal(report.summary.pauseReason, '用户中止，待继续');
    assert.equal(report.summary.nextStep, '先排查原生文件对话框');
    assert.deepEqual(report.summary.completed, ['G1-01-process-cleanup']);
    assert.deepEqual(report.summary.unexecuted, ['G4-02-instance-lock']);
    assert.deepEqual(report.summary.missingRequired, []);
    assert.match(result.stderr, /^$/);
  });
});

test('paused report missing a required gate is invalid and names it in the continuation summary', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继验';
      state.nextStep = '执行剩余必需门';
      state.gates.pop();
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.evidenceValid, false);
    assert.deepEqual(report.summary.missingRequired, ['G4-02-instance-lock']);
    assert.ok(report.failures.some((check) => check.rule === 'gates:required-coverage'));
  });
});

test('an unrelated not-executed gate cannot replace a missing required paused gate', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继验';
      state.nextStep = '执行剩余必需门';
      state.gates[1].id = 'G9-unrelated-not-executed';
      state.gates[1].status = 'not-executed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.evidenceValid, false);
    assert.deepEqual(report.summary.unexecuted, []);
    assert.deepEqual(report.summary.missingRequired, ['G4-02-instance-lock']);
  });
});

test('paused report with a duplicate required gate is invalid', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继验';
      state.nextStep = '执行剩余必需门';
      state.gates[1].status = 'not-executed';
      state.gates.push({ ...state.gates[1] });
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.evidenceValid, false);
    assert.ok(report.failures.some((check) => check.rule === 'gates:unique-ids'));
  });
});

test('paused report cannot hide a failed required gate', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继验';
      state.nextStep = '先处理失败门';
      state.gates[0].status = 'failed';
      state.gates[0].exitCode = 1;
      state.gates[1].status = 'not-executed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.evidenceValid, false);
    assert.ok(report.failures.some((check) => check.rule === 'status:paused-no-failed-gates'));
  });
});

test('paused report with damaged evidence is invalid', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继验';
      state.nextStep = '修复证据后继续';
      state.gates[1].status = 'not-executed';
      state.gates[0].evidenceSha256['automated/final-processes.log'] = '0'.repeat(64);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.evidenceValid, false);
    assert.ok(report.failures.some((check) => check.rule === 'evidence:sha256'));
  });
});

test('paused state without reason or next step is rejected as incomplete pause evidence', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.gates[1].status = 'not-executed';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL acceptance-state:schema/);
    assert.match(result.stdout, /pauseReason/);
  });
});

test('paused evidence cannot be reused across a different source or candidate identity', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '环境待恢复';
      state.nextStep = '重新核对输入';
      state.acceptanceContractSha256 = 'd'.repeat(64);
      state.environmentFingerprint = 'windows-10-19045-x64';
      state.sourceCommit = 'd'.repeat(40);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:source-commit/);
  });
});

test('paused evidence cannot be reused when the relevant environment fingerprint changed', () => {
  withFixture({
    mutateState(state) {
      state.overallStatus = 'paused';
      state.pauseReason = '待继续';
      state.nextStep = '复核环境';
      state.acceptanceContractSha256 = CONTRACT_SHA256;
      state.environmentFingerprint = 'windows-11-different-machine';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL identity:environment-fingerprint/);
  });
});

test('evidence path escaping the RETURN directory (../) fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[0].evidencePaths.push('../escape.txt');
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:paths/);
    assert.match(result.stdout, /unsafe paths/);
  });
});

test('--json emits machine readable results for a failing RETURN directory', () => {
  withFixture({ missingEvidence: ['automated/final-processes.log'] }, (returnDir) => {
    const result = runValidator(returnDir, ['--json']);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.ok(report.failures.some((check) => check.rule === 'evidence:paths'));
    assert.ok(report.checks.every((check) => typeof check.rule === 'string' && typeof check.ok === 'boolean'));
  });
});

test('invocation without arguments exits with usage code 2', () => {
  const result = childProcess.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: node scripts\/validate-windows-return\.js/);
});

// ---- Codex 复查阻塞项：验证器硬门（A4） ----

test('required gate marked passed but with exitCode=1 fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].exitCode = 1; // G4-02-instance-lock：普通门，不含 process/cleanup
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gate:G4-02-instance-lock/);
    assert.match(result.stdout, /exitCode=1/);
  });
});

test('duplicate required gate id fails', () => {
  withFixture({
    mutateState(state) {
      state.gates.push({ ...state.gates[1] });
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gates:unique-ids/);
  });
});

test('overallStatus=passed with a failed non-required gate fails', () => {
  withFixture({
    mutateState(state) {
      state.gates.push({
        id: 'G9-optional-extra',
        status: 'failed',
        command: 'run extra',
        startedAt: '2026-09-01T09:57:00.000Z',
        endedAt: '2026-09-01T09:58:00.000Z',
        exitCode: 1,
        evidencePaths: [],
        evidenceSha256: {},
      });
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL status:all-gates-passed-on-pass/);
  });
});

test('overallStatus=passed with non-null firstFailedGate fails', () => {
  withFixture({
    mutateState(state) {
      state.firstFailedGate = 'G4-02-instance-lock';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL status:firstFailedGate-null-on-pass/);
  });
});

test('evidencePath without a matching evidenceSha256 entry fails', () => {
  withFixture({
    mutateState(state) {
      delete state.gates[1].evidenceSha256['automated/02-instance-lock-focused.log'];
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:path-sha256-correspondence/);
  });
});

test('evidenceSha256 key without a matching evidencePath fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].evidenceSha256['automated/02-instance-lock-focused.log'] = state.gates[1].evidenceSha256['automated/02-instance-lock-focused.log'];
      state.gates[1].evidenceSha256['automated/extra.log'] = 'f'.repeat(64);
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:path-sha256-correspondence/);
  });
});

test('returned-checksums omitting a RETURN file fails', () => {
  withFixture({ checksums: 'omit-evidence' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:coverage/);
  });
});

test('returned-checksums with a duplicate entry fails', () => {
  withFixture({ checksums: 'duplicate' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:no-duplicates/);
  });
});

test('symbolic-link evidence file fails even with a matching hash', () => {
  withFixture({ symlinkEvidence: ['automated/02-instance-lock-focused.log'] }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL evidence:regular-files/);
  });
});

test('returned-checksums entry pointing at a directory fails', () => {
  withFixture({ checksums: 'directory-entry' }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:hashes/);
  });
});

test('required gate passed with endedAt before startedAt fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].endedAt = '2026-09-01T09:00:00.000Z';
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gate:G4-02-instance-lock/);
  });
});

test('required gate passed with empty evidencePaths fails', () => {
  withFixture({
    mutateState(state) {
      state.gates[1].evidencePaths = [];
      state.gates[1].evidenceSha256 = {};
    },
  }, (returnDir) => {
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL gate:G4-02-instance-lock/);
  });
});

// ---- RETURN 证据流程：validator 输出不得进入 checksum 闭环 ----

test('--output writes the validator report to a derived file outside the RETURN directory', () => {
  withFixture({}, (returnDir) => {
    const outputPath = path.join(path.dirname(returnDir), `${path.basename(returnDir)}-validator-output.txt`);
    try {
      const result = runValidator(returnDir, ['--output', outputPath]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /RESULT PASS/);
      assert.equal(fs.readFileSync(outputPath, 'utf8'), result.stdout);
    } finally {
      fs.rmSync(outputPath, { force: true });
    }
  });
});

test('--output inside the RETURN directory is refused so it cannot enter the checksum closure', () => {
  withFixture({}, (returnDir) => {
    const result = runValidator(returnDir, ['--output', path.join(returnDir, 'evidence', 'validator-output.txt')]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /inside the RETURN/i);
  });
});

test('modifying a persistent evidence file after checksums were frozen fails', () => {
  withFixture({}, (returnDir) => {
    fs.appendFileSync(path.join(returnDir, 'automated', 'final-processes.log'), 'tampered\n');
    const result = runValidator(returnDir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL returned-checksums:hashes/);
    assert.match(result.stdout, /FAIL evidence:sha256/);
  });
});
