const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { importPetDirectory } = require('../src/import/directory-importer');
const { loadRuntimeInputs } = require('../src/core/package-loader');
const { inspectWebp } = require('../src/core/webp-inspector');

function makeLosslessWebp(width, height, hasAlpha) {
  const dimensions = (width - 1) | ((height - 1) << 14) | ((hasAlpha ? 1 : 0) << 28);
  const chunk = Buffer.alloc(14);
  chunk.write('VP8L', 0, 'ascii');
  chunk.writeUInt32LE(5, 4);
  chunk[8] = 0x2f;
  chunk.writeUInt32LE(dimensions >>> 0, 9);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(4 + chunk.length, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, chunk]);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function makeSource(root, { id = 'sample', version = 1 } = {}) {
  const source = path.join(root, 'source');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify({
    id,
    displayName: 'Sample Pet',
    ...(version === 2 ? { spriteVersionNumber: 2 } : {}),
    spritesheetPath: 'spritesheet.webp',
  }));
  fs.writeFileSync(
    path.join(source, 'spritesheet.webp'),
    makeLosslessWebp(1536, version === 1 ? 1872 : 2288, true),
  );
  return source;
}

test('imports a directory into immutable source and normalized package snapshots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-directory-import-'));
  const source = makeSource(root);
  const outputRoot = path.join(root, 'imports');
  const sourceHashBefore = sha256(path.join(source, 'spritesheet.webp'));

  const result = importPetDirectory({
    sourceDirectory: source,
    outputRoot,
    sourceIdentity: 'sample-local',
    authorizationStatus: 'internal-test',
    now: () => new Date('2026-08-27T01:02:03.000Z'),
  });

  assert.equal(result.alreadyImported, false);
  assert.equal(result.report.pet.spriteVersionNumber, 1);
  assert.equal(result.report.source.type, 'directory');
  assert.equal(result.report.source.identity, 'sample-local');
  assert.equal(result.report.authorizationStatus, 'internal-test');
  assert.equal(sha256(path.join(source, 'spritesheet.webp')), sourceHashBefore);
  assert.equal(sha256(path.join(result.sourceSnapshotPath, 'spritesheet.webp')), sourceHashBefore);
  assert.equal(sha256(path.join(result.packagePath, 'spritesheet.webp')), sourceHashBefore);
  assert.ok(fs.existsSync(result.reportPath));
  assert.ok(fs.existsSync(result.humanReportPath));
  assert.ok(fs.existsSync(result.contactSheetPath));
  assert.ok(fs.existsSync(result.actionPreviewPath));
  assert.match(fs.readFileSync(result.humanReportPath, 'utf8'), /Sample Pet/);
  assert.equal((fs.readFileSync(result.contactSheetPath, 'utf8').match(/class="frame"/g) || []).length, 72);
  const actionPreview = fs.readFileSync(result.actionPreviewPath, 'utf8');
  assert.doesNotMatch(actionPreview, /innerHTML/);
  assert.match(actionPreview, /rel="icon" href="data:,"/);

  const profilePath = path.join(root, 'config', 'imported.json');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    productId: 'imported-sample',
    productName: 'Imported Sample',
    petPackagePath: path.relative(root, result.packagePath),
  }));
  const runtimeInputs = loadRuntimeInputs({ projectRoot: root, profilePath, inspectAtlas: inspectWebp });
  assert.equal(runtimeInputs.pet.id, 'sample');
  assert.equal(runtimeInputs.atlasPath, path.join(result.packagePath, 'spritesheet.webp'));

  const repeated = importPetDirectory({
    sourceDirectory: source,
    outputRoot,
    sourceIdentity: 'sample-local',
    authorizationStatus: 'internal-test',
  });
  assert.equal(repeated.alreadyImported, true);
  assert.equal(repeated.importDirectory, result.importDirectory);
});

test('rejects symbolic links without leaving a partial import', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-directory-import-'));
  const source = makeSource(root);
  const outputRoot = path.join(root, 'imports');
  fs.symlinkSync(path.join(source, 'spritesheet.webp'), path.join(source, 'linked.webp'));

  assert.throws(() => importPetDirectory({
    sourceDirectory: source,
    outputRoot,
    sourceIdentity: 'unsafe-links',
  }), (error) => error.code === 'SYMLINK_NOT_ALLOWED');
  assert.deepEqual(fs.existsSync(outputRoot) ? fs.readdirSync(outputRoot) : [], []);
});

test('rejects packages that exceed configured limits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-directory-import-'));
  const source = makeSource(root);

  assert.throws(() => importPetDirectory({
    sourceDirectory: source,
    outputRoot: path.join(root, 'imports'),
    sourceIdentity: 'too-large',
    limits: { maxFileBytes: 8 },
  }), (error) => error.code === 'FILE_TOO_LARGE');
});

test('rejects a declared version that conflicts with the atlas without leaving output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-directory-import-'));
  const source = makeSource(root, { version: 1 });
  const manifestPath = path.join(source, 'pet.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.spriteVersionNumber = 2;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const outputRoot = path.join(root, 'imports');

  assert.throws(() => importPetDirectory({
    sourceDirectory: source,
    outputRoot,
    sourceIdentity: 'version-conflict',
  }), /dimensions/);
  assert.deepEqual(fs.existsSync(outputRoot) ? fs.readdirSync(outputRoot) : [], []);
});
