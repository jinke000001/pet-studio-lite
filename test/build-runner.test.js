const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createBuilderCommand,
  discoverCandidateArtifacts,
  parseBuildArguments,
} = require('../src/build/build-runner');

test('parses an explicit safe product build request', () => {
  assert.deepEqual(parseBuildArguments([
    '--product', 'dai',
    '--targets', 'mac,win',
    '--output', 'release/candidates',
  ]), {
    selector: 'dai',
    targets: ['mac', 'win'],
    outputPath: 'release/candidates',
  });
});

test('rejects incomplete, duplicate, unknown and unsafe build arguments', () => {
  assert.throws(() => parseBuildArguments([]), /product/);
  assert.throws(() => parseBuildArguments(['--product', 'dai', '--targets', 'win,win']), /target/);
  assert.throws(() => parseBuildArguments(['--product', '../dai']), /product/);
  assert.throws(() => parseBuildArguments(['--product', 'dai', '--output', '../release']), /output/);
  assert.throws(() => parseBuildArguments(['--product', 'dai', '--unknown', 'x']), /Unknown/);
});

test('creates a no-publish builder command for requested platforms', () => {
  const command = createBuilderCommand({
    projectRoot: '/project',
    configPath: '/project/release/build-config.json',
    targets: ['mac', 'win'],
  });
  assert.equal(command.executable, process.execPath);
  assert.deepEqual(command.args.slice(-4), ['--config', '/project/release/build-config.json', '--mac', '--win']);
  assert.equal(command.environment.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(command.environment.ELECTRON_BUILDER_PUBLISH, 'never');
});

test('discovers only key candidate deliverables in a build directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-build-runner-'));
  const paths = [
    'artifacts/sample-0.1.0-x64.exe',
    'artifacts/win-unpacked/Sample.exe',
    'artifacts/win-unpacked/resources/app.asar',
    'artifacts/mac-arm64/Sample.app/Contents/MacOS/Sample',
    'artifacts/mac-arm64/Sample.app/Contents/Resources/app.asar',
    'artifacts/builder-debug.yml',
  ];
  for (const relativePath of paths) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, relativePath);
  }

  assert.deepEqual(
    discoverCandidateArtifacts(root).map((filePath) => path.relative(root, filePath)).sort(),
    paths.slice(0, 5).sort(),
  );
});
