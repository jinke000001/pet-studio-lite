const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createBuilderConfiguration,
  createCandidateManifest,
  reserveBuildDirectory,
} = require('../src/build/build-plan');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function sampleProfile() {
  return {
    productId: 'sample-desktop-pet',
    productName: 'Sample Desktop Pet',
    petPackagePath: 'local-pets/sample',
    version: '0.1.0',
    build: {
      appId: 'com.jinke.desktop-pet.sample',
      executableName: 'SampleDesktopPet',
      artifactName: 'sample-desktop-pet',
      iconStrategy: 'electron-default-test',
    },
  };
}

test('creates a single-product unsigned builder configuration', () => {
  const config = createBuilderConfiguration({
    selector: 'sample',
    profile: sampleProfile(),
    outputDirectory: '/tmp/release/sample',
    targets: ['mac', 'win'],
  });

  assert.equal(config.appId, 'com.jinke.desktop-pet.sample');
  assert.equal(config.extraMetadata.desktopPetProduct, 'sample');
  assert.equal(config.extraMetadata.version, '0.1.0');
  assert.deepEqual(config.files, [
    'package.json',
    'src/**/*',
    'config/products/sample.json',
    'local-pets/sample/**/*',
    '!**/.DS_Store',
    '!**/._*',
  ]);
  assert.deepEqual(config.mac.target, [{ target: 'dir', arch: ['arm64'] }]);
  assert.equal(config.mac.identity, null);
  assert.deepEqual(config.win.target, [
    { target: 'dir', arch: ['x64'] },
    { target: 'nsis', arch: ['x64'] },
  ]);
  assert.equal(config.publish, null);
  assert.match(config.nsis.artifactName, /sample-desktop-pet-0\.1\.0/);
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.include, undefined);
});

test('custom NSIS process check matches only the installed application executable', () => {
  const includePath = path.join(PROJECT_ROOT, 'build', 'nsis', 'exact-app-process-check.nsh');
  const source = fs.readFileSync(includePath, 'utf8');

  assert.match(source, /ExecutablePath/);
  assert.match(source, /::Equals\(/);
  assert.match(source, /OrdinalIgnoreCase/);
  assert.match(source, /APP_EXECUTABLE_FILENAME/);
  assert.doesNotMatch(source, /\.StartsWith\(/);
  assert.match(source, /process query failed; continuing without a false running-app block/i);
  assert.match(source, /!ifdef BUILD_UNINSTALLER\s+CRCCheck off\s+!endif/);
  assert.match(source, /!macro desktopPetPreUninstallOldVersion/);
  assert.match(source, /!insertmacro desktopPetPreUninstallOldVersion/);
  assert.match(source, /!macro customUnInstallCheck/);
});

test('uses a deterministic per-machine installer only when the product requests it', () => {
  const profile = sampleProfile();
  profile.build.installScope = 'machine';
  const config = createBuilderConfiguration({
    selector: 'sample',
    profile,
    outputDirectory: '/tmp/release/sample',
    targets: ['win'],
  });

  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.perMachine, true);
  assert.equal(config.nsis.include, 'build/nsis/exact-app-process-check.nsh');
});

test('rejects unsupported or duplicate targets', () => {
  const base = {
    selector: 'sample',
    profile: sampleProfile(),
    outputDirectory: '/tmp/release/sample',
  };
  assert.throws(() => createBuilderConfiguration({ ...base, targets: ['linux'] }), /target/);
  assert.throws(() => createBuilderConfiguration({ ...base, targets: ['win', 'win'] }), /target/);
});

test('reserves a versioned output directory without overwriting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-build-plan-'));
  const reserved = reserveBuildDirectory(root, sampleProfile(), 'candidate-test');
  assert.equal(reserved, path.join(root, 'sample-desktop-pet', '0.1.0', 'candidate-test'));
  assert.ok(fs.statSync(reserved).isDirectory());
  assert.throws(() => reserveBuildDirectory(root, sampleProfile(), 'candidate-test'), /already exists/);
  assert.throws(() => reserveBuildDirectory(root, sampleProfile(), '../unsafe'), /runId/);
});

test('records candidate hashes and explicit Windows acceptance boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-build-manifest-'));
  const installer = path.join(root, 'artifacts', 'sample.exe');
  const atlas = path.join(root, 'spritesheet.webp');
  fs.mkdirSync(path.dirname(installer), { recursive: true });
  fs.writeFileSync(installer, 'installer-candidate');
  fs.writeFileSync(atlas, 'approved-atlas');
  const atlasHash = require('node:crypto').createHash('sha256').update('approved-atlas').digest('hex');

  const manifest = createCandidateManifest({
    runDirectory: root,
    profile: sampleProfile(),
    selector: 'sample',
    targets: ['win'],
    sourceAtlasPath: atlas,
    artifactPaths: [installer],
    toolVersions: { node: '22.12.0', electron: '43.4.1', electronBuilder: '26.15.3' },
    packagedResources: [{ embeddedSelector: 'sample', atlas: { sha256: atlasHash }, asar: { sha256: 'c'.repeat(64) } }],
  });

  assert.equal(manifest.status, 'internal-candidate');
  assert.equal(manifest.acceptance.windows.source, 'unverified');
  assert.equal(manifest.acceptance.windows.installedMode, 'unverified');
  assert.equal(manifest.artifacts[0].size, 19);
  assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.sourceAtlas.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.packagedResources[0].embeddedSelector, 'sample');
  assert.equal(manifest.product.installScope, 'user');
});

test('rejects packaged resources whose selector, atlas or ASAR bytes disagree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-build-integrity-'));
  const artifact = path.join(root, 'artifact.exe');
  const atlas = path.join(root, 'atlas.webp');
  fs.writeFileSync(artifact, 'artifact');
  fs.writeFileSync(atlas, 'atlas');
  const base = {
    runDirectory: root,
    profile: sampleProfile(),
    selector: 'sample',
    targets: ['win'],
    sourceAtlasPath: atlas,
    artifactPaths: [artifact],
    toolVersions: {},
  };
  const atlasHash = require('node:crypto').createHash('sha256').update('atlas').digest('hex');
  assert.throws(() => createCandidateManifest({
    ...base,
    packagedResources: [{ embeddedSelector: 'other', atlas: { sha256: atlasHash }, asar: { sha256: 'c'.repeat(64) } }],
  }), /selector/);
  assert.throws(() => createCandidateManifest({
    ...base,
    packagedResources: [{ embeddedSelector: 'sample', atlas: { sha256: 'b'.repeat(64) }, asar: { sha256: 'c'.repeat(64) } }],
  }), /atlas/);
  assert.throws(() => createCandidateManifest({
    ...base,
    packagedResources: [
      { embeddedSelector: 'sample', atlas: { sha256: atlasHash }, asar: { sha256: 'c'.repeat(64) } },
      { embeddedSelector: 'sample', atlas: { sha256: atlasHash }, asar: { sha256: 'd'.repeat(64) } },
    ],
  }), /ASAR/);
});
