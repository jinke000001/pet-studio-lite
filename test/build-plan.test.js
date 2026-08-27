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
  const reserved = reserveBuildDirectory(root, sampleProfile());
  assert.equal(reserved, path.join(root, 'sample-desktop-pet', '0.1.0'));
  assert.ok(fs.statSync(reserved).isDirectory());
  assert.throws(() => reserveBuildDirectory(root, sampleProfile()), /already exists/);
});

test('records candidate hashes and explicit Windows acceptance boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-build-manifest-'));
  const installer = path.join(root, 'artifacts', 'sample.exe');
  const atlas = path.join(root, 'spritesheet.webp');
  fs.mkdirSync(path.dirname(installer), { recursive: true });
  fs.writeFileSync(installer, 'installer-candidate');
  fs.writeFileSync(atlas, 'approved-atlas');

  const manifest = createCandidateManifest({
    runDirectory: root,
    profile: sampleProfile(),
    selector: 'sample',
    targets: ['win'],
    sourceAtlasPath: atlas,
    artifactPaths: [installer],
    toolVersions: { node: '22.12.0', electron: '43.4.1', electronBuilder: '26.15.3' },
  });

  assert.equal(manifest.status, 'internal-candidate');
  assert.equal(manifest.acceptance.windows.source, 'unverified');
  assert.equal(manifest.acceptance.windows.installedMode, 'unverified');
  assert.equal(manifest.artifacts[0].size, 19);
  assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.sourceAtlas.sha256, /^[a-f0-9]{64}$/);
});
