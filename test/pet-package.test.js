const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePetPackage,
  stateMeta,
} = require('../src/core/pet-package');

test('infers a v1 package from a 1536x1872 atlas when the manifest omits a version', () => {
  const pet = normalizePetPackage({
    manifest: {
      id: 'doraemon',
      displayName: 'Doraemon',
      spritesheetPath: 'spritesheet.webp',
    },
    atlas: { width: 1536, height: 1872, hasAlpha: true },
  });

  assert.equal(pet.spriteVersionNumber, 1);
  assert.equal(pet.grid.rows, 9);
  assert.equal(pet.capabilities.lookDirections, false);
  assert.deepEqual(stateMeta(pet, 'look-090'), pet.states.idle);
});

test('accepts a declared v2 package with an 8x11 atlas and exposes look directions', () => {
  const pet = normalizePetPackage({
    manifest: {
      id: 'dai',
      displayName: '阿岱 Dai',
      spriteVersionNumber: 2,
      spritesheetPath: 'spritesheet.webp',
    },
    atlas: { width: 1536, height: 2288, hasAlpha: true },
  });

  assert.equal(pet.spriteVersionNumber, 2);
  assert.equal(pet.grid.rows, 11);
  assert.equal(pet.capabilities.lookDirections, true);
  assert.deepEqual(stateMeta(pet, 'look-090'), { row: 9, frames: 1, column: 4 });
});

test('rejects unsafe atlas paths and version-dimension mismatches', () => {
  assert.throws(() => normalizePetPackage({
    manifest: { id: 'unsafe', displayName: 'Unsafe', spritesheetPath: '../outside.webp' },
    atlas: { width: 1536, height: 1872, hasAlpha: true },
  }), /spritesheetPath/);

  assert.throws(() => normalizePetPackage({
    manifest: {
      id: 'wrong-v2',
      displayName: 'Wrong v2',
      spriteVersionNumber: 2,
      spritesheetPath: 'spritesheet.webp',
    },
    atlas: { width: 1536, height: 1872, hasAlpha: true },
  }), /dimensions/);
});

test('rejects atlases without transparency', () => {
  assert.throws(() => normalizePetPackage({
    manifest: { id: 'opaque', displayName: 'Opaque', spritesheetPath: 'spritesheet.webp' },
    atlas: { width: 1536, height: 1872, hasAlpha: false },
  }), /alpha/);
});
