const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { importPetZip } = require('../src/import/zip-importer');
const { writeZip } = require('./helpers/zip-fixture');

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

function validEntries(prefix = '') {
  return [
    {
      name: `${prefix}pet.json`,
      data: JSON.stringify({
        id: 'zip-sample',
        displayName: 'ZIP Sample',
        spriteVersionNumber: 2,
        spritesheetPath: 'spritesheet.webp',
      }),
    },
    { name: `${prefix}spritesheet.webp`, data: makeLosslessWebp(1536, 2288, true) },
  ];
}

test('imports a wrapped ZIP through the same normalized package pipeline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-zip-import-'));
  const zipPath = path.join(root, 'sample.zip');
  writeZip(zipPath, validEntries('sample/'));

  const result = await importPetZip({
    zipPath,
    outputRoot: path.join(root, 'imports'),
    sourceIdentity: 'sample-archive',
    authorizationStatus: 'internal-test',
  });

  assert.equal(result.report.source.type, 'zip');
  assert.equal(result.report.source.identity, 'sample-archive');
  assert.match(result.report.source.originalSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.report.pet.spriteVersionNumber, 2);
  assert.ok(fs.existsSync(path.join(result.packagePath, 'spritesheet.webp')));
});

test('rejects ZIP path traversal without writing outside the extraction root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-zip-import-'));
  const zipPath = path.join(root, 'traversal.zip');
  writeZip(zipPath, [{ name: '../escaped.txt', data: 'escape' }, ...validEntries()]);

  await assert.rejects(importPetZip({
    zipPath,
    outputRoot: path.join(root, 'imports'),
    sourceIdentity: 'traversal',
  }), (error) => ['UNSAFE_ZIP_PATH', 'INVALID_ZIP'].includes(error.code));
  assert.equal(fs.existsSync(path.join(root, 'escaped.txt')), false);
});

test('rejects symbolic links, duplicate paths and encrypted entries', async (t) => {
  const cases = [
    {
      name: 'symbolic link',
      code: 'ZIP_SYMLINK_NOT_ALLOWED',
      entries: [{ name: 'link', data: 'target', mode: 0o120777 }, ...validEntries()],
    },
    {
      name: 'duplicate path',
      code: 'DUPLICATE_ZIP_PATH',
      entries: [...validEntries(), { name: 'pet.json', data: '{}' }],
    },
    {
      name: 'encrypted entry',
      code: 'ENCRYPTED_ZIP_NOT_ALLOWED',
      entries: [{
        name: 'secret',
        data: Buffer.alloc(13),
        flags: 1,
        compressedSize: 13,
        uncompressedSize: 1,
      }, ...validEntries()],
    },
  ];

  for (const zipCase of cases) {
    await t.test(zipCase.name, async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-zip-import-'));
      const zipPath = path.join(root, 'unsafe.zip');
      writeZip(zipPath, zipCase.entries);
      await assert.rejects(importPetZip({
        zipPath,
        outputRoot: path.join(root, 'imports'),
        sourceIdentity: 'unsafe',
      }), (error) => error.code === zipCase.code);
    });
  }
});

test('rejects suspicious expansion metadata before extracting file data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-zip-import-'));
  const zipPath = path.join(root, 'bomb.zip');
  writeZip(zipPath, [{
    name: 'bomb.bin',
    data: 'x',
    method: 8,
    compressedSize: 1,
    uncompressedSize: 65 * 1024 * 1024,
  }]);

  await assert.rejects(importPetZip({
    zipPath,
    outputRoot: path.join(root, 'imports'),
    sourceIdentity: 'bomb',
  }), (error) => error.code === 'FILE_TOO_LARGE');
});
