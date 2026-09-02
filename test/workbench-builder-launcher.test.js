const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronPath = require('electron');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LAUNCHER = path.join(PROJECT_ROOT, 'src', 'workbench', 'builder-launcher.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'helpers', 'builder-cli-fixture.js');
const YARGS_ENTRY = require.resolve('yargs');
const REAL_CLI = path.join(PROJECT_ROOT, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

function spawnProcess(command, args, { env = {}, cwd } = {}) {
  return childProcess.spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000,
  });
}

function spawnElectronAsNode(args, options = {}) {
  return spawnProcess(electronPath, args, { ...options, env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' } });
}

function makeFixtureBuilderRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-builder-root-'));
  const cliDirectory = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli');
  fs.mkdirSync(cliDirectory, { recursive: true });
  const cliPath = path.join(cliDirectory, 'cli.js');
  fs.copyFileSync(FIXTURE, cliPath);
  return { root, cliPath };
}

function parseFixtureOutput(result) {
  assert.equal(result.status, 0, `fixture cli failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

// Root-cause control: the real electron-builder CLI entry, spawned the way the
// old candidate controller did (Electron-as-Node, cli path at argv[1]), makes
// yargs' hideBin keep the cli path as a bogus positional argument.
test('electron-as-node without argv normalization keeps the cli path as a bogus positional (root-cause control)', () => {
  const result = spawnElectronAsNode([
    REAL_CLI, '--publish', 'never', '--config', path.join(os.tmpdir(), 'missing-build-config.json'), '--mac',
  ]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /Unknown argument|无法识别的选项/);
  assert.ok(output.includes('cli.js'), output);
});

test('launcher normalizes electron-as-node argv so yargs only receives builder flags', () => {
  const { root, cliPath } = makeFixtureBuilderRoot();
  const configPath = path.join(root, 'build-config.json');
  const result = spawnElectronAsNode(
    [LAUNCHER, cliPath, '--publish', 'never', '--config', configPath, '--mac'],
    { env: { DESKTOP_PET_BUILDER_ROOT: root, BUILDER_FIXTURE_YARGS: YARGS_ENTRY } },
  );
  const parsed = parseFixtureOutput(result);
  assert.deepEqual(parsed._, []);
  assert.equal(parsed.publish, 'never');
  assert.equal(parsed.config, configPath);
  assert.equal(parsed.mac, true);
  assert.equal(parsed.win, null);
});

test('launcher normalizes electron-as-node argv for the windows target flag', () => {
  const { root, cliPath } = makeFixtureBuilderRoot();
  const configPath = path.join(root, 'build-config.json');
  const result = spawnElectronAsNode(
    [LAUNCHER, cliPath, '--publish', 'never', '--config', configPath, '--win'],
    { env: { DESKTOP_PET_BUILDER_ROOT: root, BUILDER_FIXTURE_YARGS: YARGS_ENTRY } },
  );
  const parsed = parseFixtureOutput(result);
  assert.deepEqual(parsed._, []);
  assert.equal(parsed.publish, 'never');
  assert.equal(parsed.config, configPath);
  assert.equal(parsed.mac, null);
  assert.equal(parsed.win, true);
});

test('launcher keeps the standard node argv shape when not running inside electron', () => {
  const { root, cliPath } = makeFixtureBuilderRoot();
  const configPath = path.join(root, 'build-config.json');
  const result = spawnProcess(
    process.execPath,
    [LAUNCHER, cliPath, '--publish', 'never', '--config', configPath, '--mac'],
    { env: { DESKTOP_PET_BUILDER_ROOT: root, BUILDER_FIXTURE_YARGS: YARGS_ENTRY } },
  );
  const parsed = parseFixtureOutput(result);
  assert.deepEqual(parsed._, []);
  assert.equal(parsed.publish, 'never');
  assert.equal(parsed.config, configPath);
  assert.equal(parsed.mac, true);
});

test('launcher rejects a cli path outside the controlled builder root', () => {
  const { root } = makeFixtureBuilderRoot();
  const outside = path.join(os.tmpdir(), 'injected-cli.js');
  const result = spawnElectronAsNode([LAUNCHER, outside, '--mac'], { env: { DESKTOP_PET_BUILDER_ROOT: root } });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /builder root/i);
});

test('launcher refuses to run without the controlled builder root', () => {
  const { root, cliPath } = makeFixtureBuilderRoot();
  const result = spawnElectronAsNode([LAUNCHER, cliPath, '--mac'], { env: { DESKTOP_PET_BUILDER_ROOT: '' } });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /builder root/i);
});

test('launcher drives the real electron-builder cli past argv parsing under electron-as-node', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-builder-real-'));
  const configPath = path.join(sandbox, 'build-config.json');
  fs.writeFileSync(configPath, '{}\n');
  const result = spawnElectronAsNode(
    [LAUNCHER, REAL_CLI, '--publish', 'never', '--config', configPath, '--mac'],
    { cwd: sandbox, env: { DESKTOP_PET_BUILDER_ROOT: PROJECT_ROOT } },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  // The build must fail on the empty sandbox project, never on argv parsing.
  assert.doesNotMatch(output, /Unknown argument|无法识别的选项/);
  assert.match(output, /loaded configuration/);
});
