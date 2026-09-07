const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAcceptanceKit, createHandoff, createKit, evaluateTestRun, listZipEntries, renderPrompt, renderReportTemplate, runToolPreflight, validateContract, verifyGitCommit, writeToolPreflight } = require('../scripts/workbench-acceptance-kit');
const { readZipEntry } = require('../scripts/zip-reader');
const { writeZip } = require('./helpers/zip-fixture');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(PROJECT_ROOT, 'tasks', 'phase-6-workbench-acceptance-contract.json');
const EXPECTED_REQUIRED_GATE_IDS = [
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

function minimalContract() {
  return {
    schemaVersion: 2,
    requiredGates: [{ id: 'G1', title: '启动', mode: 'windows', check: '启动应用', passCriteria: '窗口可见', evidence: ['screenshot'] }],
    coverageGroups: [{ id: 'group', title: '启动', gateIds: ['G1'] }],
    toolPreflight: [],
  };
}

test('acceptance kit derives file count and hashes from the source ZIP input', () => {
  const zipPath = path.join(os.tmpdir(), '桌宠 source.zip');
  fs.writeFileSync(zipPath, 'zip bytes');
  try {
    const kit = buildAcceptanceKit({
      contract: minimalContract(),
      sourceZip: zipPath,
      sourceCommit: 'a'.repeat(40),
      execFile: (_command, _args) => 'src/index.js\nsrc/中文.txt\nsrc/dir/\n',
    });
    assert.equal(kit.source.fileCount, 2);
    assert.equal(kit.source.zipSha256.length, 64);
    assert.equal(kit.requiredGates[0].id, 'G1');
    assert.match(renderReportTemplate(kit), /source ZIP 文件数：2/);
    assert.match(renderPrompt(kit), /不得复用不同身份/);
  } finally { fs.rmSync(zipPath, { force: true }); }
});

test('kit generation supports spaces and Chinese paths and refuses overwrite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '桌宠 kit '));
  const contractPath = path.join(root, '验收 contract.json');
  const zipPath = path.join(root, 'source package.zip');
  const output = path.join(root, 'new kit');
  fs.writeFileSync(contractPath, JSON.stringify(minimalContract()));
  writeZip(zipPath, [{ name: 'src/中文.txt', data: 'content' }]);
  try {
    const kit = createKit({ contractPath, sourceZip: zipPath, sourceCommit: 'a'.repeat(40), outputDirectory: output });
    assert.equal(kit.source.fileCount, 1);
    assert.equal(fs.existsSync(path.join(output, 'acceptance-checklist.json')), true);
    assert.equal(fs.existsSync(path.join(output, 'tool-preflight.json')), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'validator-arguments.json'))).requiredGates[0], 'G1');
    assert.throws(() => createKit({ contractPath, sourceZip: zipPath, outputDirectory: output }), /already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('test run acceptance checks exit code, failures, skips and expected coverage', () => {
  assert.equal(evaluateTestRun({ exitCode: 0, summary: { tests: 10, fail: 0, skipped: 0, cancelled: 0 }, expectedFiles: ['a.test.js'], coveredFiles: ['a.test.js'] }).ok, true);
  const rejected = evaluateTestRun({ exitCode: 1, summary: { tests: 10, fail: 1, skipped: 2, cancelled: 0 }, expectedFiles: ['a.test.js', 'b.test.js'], coveredFiles: ['a.test.js'] });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.missingCoverage, ['b.test.js']);
  assert.match(rejected.problems.join('; '), /exitCode=1.*fail=1.*skipped=2.*missing expected coverage/);
});

test('kit rejects an unsupported contract version', () => {
  assert.throws(() => buildAcceptanceKit({ contract: { schemaVersion: 1, requiredGates: [{ id: 'G1' }] } }), /schemaVersion/);
});

test('zip entries normalize separators, reject traversal and reject duplicate names', () => {
  assert.deepEqual(listZipEntries('ignored', () => 'a\n../escape\nb\\c\n'), ['a', 'b/c']);
  assert.throws(() => listZipEntries('ignored', () => 'a\na\n'), /duplicate paths/);
});

test('portable ZIP reader lists and extracts entries without the system unzip command', () => {
  const zipPath = path.join(os.tmpdir(), 'portable-acceptance-kit.zip');
  writeZip(zipPath, [
    { name: 'wrapped/', data: '' },
    { name: 'wrapped/中文.txt', data: 'portable content' },
  ]);
  try {
    assert.deepEqual(listZipEntries(zipPath), ['wrapped/中文.txt']);
    assert.equal(readZipEntry(zipPath, 'wrapped/中文.txt').toString('utf8'), 'portable content');
  } finally { fs.rmSync(zipPath, { force: true }); }
});

test('authoritative contract preserves all 60 concrete -11 requirements with complete coverage mappings', () => {
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  assert.deepEqual(contract.requiredGates.map(({ id }) => id), EXPECTED_REQUIRED_GATE_IDS);
  assert.equal(contract.requiredGates.length, 60);
  assert.doesNotThrow(() => validateContract(contract));
  assert.ok(contract.requiredGates.every((gate) => gate.mode && gate.check && gate.passCriteria && gate.evidence.length > 0));
  assert.match(contract.requiredGates.find(({ id }) => id === 'G4-01-focused-tests').check, /workbench-single-instance\.test\.js/);
  assert.doesNotMatch(contract.requiredGates.find(({ id }) => id === 'G4-01-focused-tests').check, /workbench-instance-lock\.test\.js/);
});

test('contract coverage cannot omit or duplicate a concrete required gate', () => {
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const missing = structuredClone(contract);
  missing.requiredGates = missing.requiredGates.filter(({ id }) => id !== 'G5-06-malicious-zip-blocked');
  assert.throws(() => validateContract(missing), /coverage.*G5-06-malicious-zip-blocked/);
  const duplicate = structuredClone(contract);
  duplicate.coverageGroups[0].gateIds.push(duplicate.coverageGroups[0].gateIds[0]);
  assert.throws(() => validateContract(duplicate), /coverage.*duplicate/);
});

test('tool preflight records a successful driven operation only with required evidence', () => {
  const result = runToolPreflight({
    checks: [{ id: 'startup', driver: { command: 'node', args: ['smoke.js', '--startup'], timeoutMs: 1000 }, requiredEvidence: ['startup.json'] }],
    commandRunner: (command, args) => ({ status: 0, stdout: `${command} ${args.join(' ')}` }),
    evidenceExists: () => true,
    now: (() => { let ms = 0; return () => new Date(ms += 25); })(),
  });
  assert.equal(result[0].driverAvailable, true);
  assert.equal(result[0].operationSucceeded, true);
  assert.equal(result[0].classification, 'passed');
  assert.equal(result[0].durationMs, 25);
});

test('tool preflight uses a fresh run directory and passes it to a real driver', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-preflight-'));
  const evidenceRoot = path.join(root, 'evidence');
  const contractPath = path.join(root, 'contract.json');
  const outputPath = path.join(root, 'tool-preflight.json');
  const driverPath = path.join(root, 'driver.js');
  fs.mkdirSync(path.join(evidenceRoot, 'preflight'), { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'preflight', 'startup.json'), 'old evidence\n');
  fs.writeFileSync(driverPath, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "if (process.argv[2] === 'write') { const root = process.env.TOOL_PREFLIGHT_EVIDENCE_ROOT; fs.mkdirSync(path.join(root, 'preflight'), { recursive: true }); fs.writeFileSync(path.join(root, 'preflight', 'startup.json'), 'new evidence\\n'); }",
  ].join('\n'));
  const contract = { ...minimalContract(), toolPreflight: [{ id: 'startup', driver: { command: process.execPath, path: driverPath, args: [driverPath, 'noop'] }, requiredEvidence: ['preflight/startup.json'] }] };
  fs.writeFileSync(contractPath, JSON.stringify(contract));
  try {
    const first = writeToolPreflight({ contractPath, evidenceRoot, outputPath });
    assert.equal(first.checks[0].classification, 'evidence-missing');
    assert.equal(first.checks[0].operationSucceeded, false);
    assert.notEqual(first.evidenceRoot, path.resolve(evidenceRoot));
    assert.equal(fs.readFileSync(path.join(evidenceRoot, 'preflight', 'startup.json'), 'utf8'), 'old evidence\n');

    const secondOutputPath = path.join(root, 'tool-preflight-2.json');
    const secondContract = { ...contract, toolPreflight: [{ ...contract.toolPreflight[0], driver: { ...contract.toolPreflight[0].driver, args: [driverPath, 'write'] } }] };
    fs.writeFileSync(contractPath, JSON.stringify(secondContract));
    const second = writeToolPreflight({ contractPath, evidenceRoot, outputPath: secondOutputPath });
    assert.equal(second.checks[0].classification, 'passed');
    assert.equal(second.checks[0].operationSucceeded, true);
    assert.notEqual(second.evidenceRoot, first.evidenceRoot);
    assert.equal(fs.readFileSync(path.join(evidenceRoot, 'preflight', 'startup.json'), 'utf8'), 'old evidence\n');
    assert.equal(fs.readFileSync(path.join(second.evidenceRoot, 'preflight', 'startup.json'), 'utf8'), 'new evidence\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tool preflight rejects missing, empty, directory, symlink and traversal evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-preflight-invalid-'));
  const evidenceRoot = path.join(root, 'run');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const outside = path.join(root, 'outside.txt');
  fs.writeFileSync(outside, 'outside');
  fs.mkdirSync(path.join(evidenceRoot, 'directory'), { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'empty.txt'), '');
  fs.symlinkSync(outside, path.join(evidenceRoot, 'link.txt'));
  const checks = [
    ['missing', 'missing.txt'],
    ['empty', 'empty.txt'],
    ['directory', 'directory'],
    ['symlink', 'link.txt'],
    ['traversal', '../outside.txt'],
    ['windows-absolute', 'C:\\outside.txt'],
  ].map(([id, requiredEvidence]) => ({ id, driver: { command: process.execPath, args: ['-e', ''], timeoutMs: 1000 }, requiredEvidence: [requiredEvidence] }));
  try {
    const results = runToolPreflight({ checks, evidenceRoot, commandRunner: () => ({ status: 0 }) });
    assert.deepEqual(results.map(({ classification }) => classification), checks.map(() => 'evidence-missing'));
    assert.deepEqual(results.map(({ operationSucceeded }) => operationSucceeded), checks.map(() => false));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('actual tool preflight entry preserves unavailable, failed, timeout and manual classifications', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-preflight-classifications-'));
  const evidenceRoot = path.join(root, 'evidence');
  const contractPath = path.join(root, 'contract.json');
  const outputPath = path.join(root, 'tool-preflight.json');
  const driverPath = path.join(root, 'driver.js');
  fs.writeFileSync(driverPath, "if (process.argv[2] === 'fail') process.exit(7); setInterval(() => {}, 1000);\n");
  const driver = (mode) => ({ command: process.execPath, path: driverPath, args: [driverPath, mode], timeoutMs: mode === 'timeout' ? 50 : 1000 });
  fs.writeFileSync(contractPath, JSON.stringify({
    ...minimalContract(),
    toolPreflight: [
      { id: 'missing', driver: { command: process.execPath, path: path.join(root, 'missing.js'), args: [] }, requiredEvidence: [] },
      { id: 'failed', driver: driver('fail'), requiredEvidence: [] },
      { id: 'timeout', driver: driver('timeout'), requiredEvidence: [] },
      { id: 'manual', method: 'manual', reason: '真实人工接续' },
    ],
  }));
  try {
    const report = writeToolPreflight({ contractPath, evidenceRoot, outputPath });
    assert.deepEqual(report.checks.map(({ classification }) => classification), ['tool-unavailable', 'operation-failed', 'timeout', 'manual-continuation']);
    assert.deepEqual(report.checks.map(({ operationSucceeded }) => operationSucceeded), [false, false, false, null]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tool preflight passes when a driver writes every required evidence file in the received directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-preflight-valid-'));
  const evidenceRoot = path.join(root, 'run');
  const driverPath = path.join(root, 'driver.js');
  fs.writeFileSync(driverPath, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const root = process.env.TOOL_PREFLIGHT_EVIDENCE_ROOT;",
    "fs.mkdirSync(path.join(root, 'preflight'), { recursive: true });",
    "for (const file of ['one.json', 'two.png']) fs.writeFileSync(path.join(root, 'preflight', file), 'evidence');",
  ].join('\n'));
  try {
    const [result] = runToolPreflight({
      checks: [{ id: 'complete', driver: { command: process.execPath, path: driverPath, args: [driverPath] }, requiredEvidence: ['preflight/one.json', 'preflight/two.png'] }],
      evidenceRoot,
      driverExists: (candidate) => fs.existsSync(candidate),
    });
    assert.equal(result.classification, 'passed');
    assert.equal(result.operationSucceeded, true);
    assert.deepEqual(result.missingEvidence, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tool preflight separates missing command, nonzero exit, timeout and missing evidence', () => {
  const checks = ['missing', 'nonzero', 'timeout', 'no-evidence'].map((id) => ({
    id,
    driver: { command: `${id}.exe`, args: [], timeoutMs: 1000 },
    requiredEvidence: [`${id}.json`],
  }));
  const result = runToolPreflight({
    checks,
    commandRunner: (command) => {
      if (command === 'missing.exe') return { status: null, error: { code: 'ENOENT', message: 'not found' } };
      if (command === 'nonzero.exe') return { status: 7, stderr: 'driver failed' };
      if (command === 'timeout.exe') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: 'timed out' } };
      return { status: 0 };
    },
    evidenceExists: () => false,
  });
  assert.deepEqual(result.map(({ classification }) => classification), ['tool-unavailable', 'operation-failed', 'timeout', 'evidence-missing']);
  assert.deepEqual(result.map(({ operationSucceeded }) => operationSucceeded), [false, false, false, false]);
});

test('tool preflight rejects a missing external driver path before invoking its host command', () => {
  let invoked = false;
  const [result] = runToolPreflight({
    checks: [{ id: 'startup', driver: { command: 'node', path: 'acceptance-tools/smoke.js', args: [] }, requiredEvidence: [] }],
    driverExists: () => false,
    commandRunner: () => { invoked = true; return { status: 0 }; },
  });
  assert.equal(invoked, false);
  assert.equal(result.classification, 'tool-unavailable');
  assert.equal(result.driverAvailable, false);
});

test('manual native file selection is recorded as continuation, never as a successful preflight', () => {
  const [result] = runToolPreflight({ checks: [{ id: 'native-file-dialog-manual', method: 'manual', reason: '驱动未取回' }] });
  assert.equal(result.classification, 'manual-continuation');
  assert.equal(result.driverAvailable, null);
  assert.equal(result.operationSucceeded, null);
});

test('handoff generation verifies the exact commit and creates independently recoverable source materials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-handoff-'));
  const output = path.join(root, 'handoff');
  const commit = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  try {
    assert.equal(verifyGitCommit(PROJECT_ROOT, commit), commit);
    assert.throws(() => verifyGitCommit(PROJECT_ROOT, '0'.repeat(40)), /not available/);
    const result = createHandoff({ repoRoot: PROJECT_ROOT, contractPath: CONTRACT_PATH, outputDirectory: output, sourceCommit: commit });
    assert.equal(result.sourceCommit, commit);
    assert.equal(fs.existsSync(result.sourceZip), true);
    assert.equal(fs.existsSync(result.bundle), true);
    assert.equal(fs.existsSync(path.join(output, 'zip-reader.js')), true);
    assert.equal(fs.existsSync(path.join(output, 'acceptance-tools', 'lib', 'cdp.js')), true);
    assert.equal(fs.existsSync(path.join(output, 'acceptance-tools', 'run.js')), true);
    assert.equal(fs.existsSync(path.join(output, 'acceptance-tools', 'ps', 'official-uninstall.ps1')), true);
    assert.equal(fs.existsSync(path.join(output, 'fixtures', 'doraemon-v1', 'pet.json')), true);
    assert.equal(fs.existsSync(path.join(output, 'RETURN')), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'acceptance-checklist.json'))).requiredGates.length, 60);
    const runConfig = JSON.parse(fs.readFileSync(path.join(output, 'acceptance-tools', 'run-config.json')));
    assert.equal(runConfig.identity.sourceCommit, commit);
    assert.equal(runConfig.identity.sourceZipSha256, result.sourceZipSha256);
    assert.equal(runConfig.identity.environmentFingerprint, null);
    assert.equal(runConfig.requiredGates.length, 60);
    const args = JSON.parse(fs.readFileSync(path.join(output, 'validator-arguments.json')));
    assert.equal(args.expectSourceCommit, commit);
    assert.equal(args.expectCandidateSha256, null);
    assert.match(fs.readFileSync(path.join(output, 'HANDOFF.md'), 'utf8'), /bundle/);
    assert.match(fs.readFileSync(path.join(output, 'WINDOWS-WORKBENCH-PROMPT.md'), 'utf8'), /official-uninstall\.ps1/);
    assert.match(fs.readFileSync(path.join(output, 'checksums.sha256'), 'utf8'), /acceptance-checklist\.json/);
    assert.throws(() => createHandoff({ repoRoot: PROJECT_ROOT, contractPath: CONTRACT_PATH, outputDirectory: output, sourceCommit: commit }), /already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
