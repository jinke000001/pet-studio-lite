const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { inspectElectronInstallation } = require('../scripts/source-preflight');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function makeProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-source-preflight-'));
  const electronRoot = path.join(projectRoot, 'node_modules', 'electron');
  fs.mkdirSync(path.join(electronRoot, 'dist'), { recursive: true });
  return { electronRoot, projectRoot };
}

test('source preflight accepts an installed Electron executable without loading Electron', () => {
  const { electronRoot, projectRoot } = makeProject();
  fs.writeFileSync(path.join(electronRoot, 'path.txt'), 'electron.exe');
  fs.writeFileSync(path.join(electronRoot, 'dist', 'electron.exe'), 'binary');

  assert.deepEqual(inspectElectronInstallation(projectRoot, {}), {
    executablePath: path.join(electronRoot, 'dist', 'electron.exe'),
    ok: true,
  });
});

test('source preflight reports a missing Electron binary and skip-download environment', () => {
  const { electronRoot, projectRoot } = makeProject();
  fs.writeFileSync(path.join(electronRoot, 'path.txt'), 'electron.exe');

  assert.deepEqual(inspectElectronInstallation(projectRoot, {
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
  }), {
    environment: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
    executablePath: path.join(electronRoot, 'dist', 'electron.exe'),
    ok: false,
    reason: 'electron executable is missing',
  });
});

test('npm ci explicitly installs the Electron runtime before source preflight', () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(packageMetadata.scripts.postinstall, 'node node_modules/electron/install.js');
});
