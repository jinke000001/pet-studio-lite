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
  const lines = listFilesRecursive(returnDir)
    .filter((relativePath) => relativePath !== 'returned-checksums.sha256')
    .map((relativePath) => {
      const digest = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(returnDir, ...relativePath.split('/'))))
        .digest('hex');
      return `${digest}  ${relativePath}`;
    });
  if (mode === 'self') lines.push(`${'0'.repeat(64)}  returned-checksums.sha256`);
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
