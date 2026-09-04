const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAcceptanceKit, createKit, evaluateTestRun, listZipEntries, renderPrompt, renderReportTemplate, runToolPreflight } = require('../scripts/workbench-acceptance-kit');

test('acceptance kit derives file count and hashes from the source ZIP input', () => {
  const zipPath = path.join(os.tmpdir(), '桌宠 source.zip');
  fs.writeFileSync(zipPath, 'zip bytes');
  try {
    const kit = buildAcceptanceKit({
      contract: { schemaVersion: 1, requiredGates: [{ id: 'G1', title: '启动', mode: 'windows' }], toolPreflight: ['startup'] },
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
  fs.writeFileSync(contractPath, JSON.stringify({ schemaVersion: 1, requiredGates: [{ id: 'G1', title: '启动', mode: 'windows' }] }));
  fs.writeFileSync(zipPath, 'zip bytes');
  const original = require('node:child_process').execFileSync;
  require('node:child_process').execFileSync = () => 'src/中文.txt\n';
  try {
    const kit = createKit({ contractPath, sourceZip: zipPath, sourceCommit: 'a'.repeat(40), outputDirectory: output });
    assert.equal(kit.source.fileCount, 1);
    assert.equal(fs.existsSync(path.join(output, 'acceptance-checklist.json')), true);
    assert.equal(fs.existsSync(path.join(output, 'tool-preflight.json')), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'validator-arguments.json'))).requiredGates[0], 'G1');
    assert.throws(() => createKit({ contractPath, sourceZip: zipPath, outputDirectory: output }), /already exists/);
  } finally {
    require('node:child_process').execFileSync = original;
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
  assert.throws(() => buildAcceptanceKit({ contract: { schemaVersion: 2, requiredGates: [{ id: 'G1' }] } }), /contract/);
});

test('zip entries normalize separators, reject traversal and reject duplicate names', () => {
  assert.deepEqual(listZipEntries('ignored', () => 'a\n../escape\nb\\c\n'), ['a', 'b/c']);
  assert.throws(() => listZipEntries('ignored', () => 'a\na\n'), /duplicate paths/);
});

test('tool preflight classifies unavailable tools separately from product failures', () => {
  const result = runToolPreflight({ checks: ['startup', 'dialog-fill'], commandRunner: (_command, args) => ({ status: args[0] === 'startup' ? 0 : 1 }) });
  assert.deepEqual(result, [
    { name: 'startup', available: true, classification: 'available' },
    { name: 'dialog-fill', available: false, classification: 'tool-unavailable' },
  ]);
});
