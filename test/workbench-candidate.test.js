const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const {
  createStudioBuilderConfiguration,
  createStudioCandidateManifest,
  candidateId,
  readGitBaseline,
} = require('../src/workbench/candidate-builder');
const { stageBuilderRuntime } = require('../src/workbench/builder-runtime');
test('creates isolated unsigned workbench candidate configuration', () => {
  const projectRoot = path.resolve(os.tmpdir(), 'workbench-candidate-project');
  const outputDirectory = path.resolve(os.tmpdir(), 'workbench-candidate-output');
  const builderSource = path.join(projectRoot, 'node_modules', 'electron-builder');
  const config = createStudioBuilderConfiguration({ outputDirectory, projectRoot, builderPackages: [{ sourceDirectory: builderSource, relativePath: 'node_modules/electron-builder' }] });
  assert.equal(config.extraMetadata.main, 'src/workbench/main.js'); assert.equal(config.forceCodeSigning, false); assert.equal(config.publish, null); assert.equal(config.mac.identity, null); assert.match(config.directories.output, /artifacts$/);
  assert.deepEqual(config.files, [
    'package.json',
    'src/**/*',
    'config/**/*',
    'build/**/*',
    '.workbench-dist/**/*',
    '!**/.DS_Store',
    '!**/._*',
  ]);
  assert.deepEqual(config.extraResources, [
    { from: builderSource, to: 'workbench-builder/node_modules/electron-builder' },
    { from: path.join(outputDirectory, 'workbench-build-package.json'), to: 'workbench-build-assets/package.json' },
    { from: path.join(projectRoot, 'src'), to: 'workbench-build-assets/src' },
    { from: path.join(projectRoot, 'build'), to: 'workbench-build-assets/build' },
  ]);
});
test('creates versioned non-overwriting candidate ids', () => { assert.equal(candidateId(new Date('2026-09-01T01:02:03.000Z')), 'candidate-20260901010203000'); });

test('binds studio candidates to a clean Git commit', () => {
  const calls = [];
  const projectRoot = path.resolve(os.tmpdir(), 'workbench-candidate-git');
  const baseline = readGitBaseline({
    projectRoot,
    execFile(command, args, options) {
      calls.push({ command, args, options });
      return args[0] === 'rev-parse' ? 'abc123\n' : '';
    },
  });
  const manifest = createStudioCandidateManifest({
    baseline,
    targets: ['mac'],
    now: new Date('2026-09-01T01:02:03.000Z'),
    artifacts: [],
  });

  assert.equal(baseline.commit, 'abc123');
  assert.deepEqual(manifest.source, { gitCommit: 'abc123', worktreeClean: true });
  assert.deepEqual(calls.map((call) => call.args), [
    ['rev-parse', 'HEAD'],
    ['status', '--porcelain', '--untracked-files=all'],
  ]);
  assert.ok(calls.every((call) => call.options.cwd === path.resolve(projectRoot)));
});

test('refuses to build a studio candidate from a dirty worktree', () => {
  assert.throws(() => readGitBaseline({
    projectRoot: path.resolve(os.tmpdir(), 'workbench-candidate-dirty'),
    execFile(_command, args) {
      return args[0] === 'rev-parse' ? 'abc123\n' : ' M src/workbench/main.js\n';
    },
  }), /clean Git worktree/);
});

test('stages only the electron-builder production dependency closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-builder-source-'));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-builder-output-'));
  function add(name, manifest, extraFile = 'module.exports = true;', parent = root) {
    const directory = path.join(parent, 'node_modules', ...name.split('/'));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest }));
    fs.writeFileSync(path.join(directory, 'index.js'), extraFile);
  }
  add('electron-builder', { dependencies: { required: '1.0.0', nested: '1.0.0' }, devDependencies: { ignored: '1.0.0' } });
  const electronBuilderDirectory = path.join(root, 'node_modules', 'electron-builder');
  add('nested', {}, 'module.exports = true;', electronBuilderDirectory);
  add('required', { optionalDependencies: { optional: '1.0.0' } });
  add('optional', {});
  add('ignored', {});
  const result = stageBuilderRuntime({ projectRoot: root, outputDirectory: output });
  assert.deepEqual(result.packages.map((entry) => entry.name).sort(), ['electron-builder', 'nested', 'optional', 'required']);
  assert.equal(fs.existsSync(path.join(output, 'node_modules', 'electron-builder', 'package.json')), true);
  assert.equal(fs.existsSync(path.join(output, 'node_modules', 'ignored')), false);
  assert.equal(fs.statSync(path.join(root, 'node_modules', 'electron-builder', 'index.js')).ino, fs.statSync(path.join(output, 'node_modules', 'electron-builder', 'index.js')).ino);
});
