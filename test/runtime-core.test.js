const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRuntimeContract,
  normalizeSettings,
  framePosition,
  resizeAroundAnchor,
  clampBounds,
  dragState,
  dragUpdateInterval,
} = require('../src/core/runtime-core');
const { normalizePetPackage } = require('../src/core/pet-package');
const { normalizeProductProfile } = require('../src/core/product-profile');

function makePet(version = 1) {
  return normalizePetPackage({
    manifest: {
      id: version === 1 ? 'v1-pet' : 'v2-pet',
      displayName: version === 1 ? 'V1 Pet' : 'V2 Pet',
      spriteVersionNumber: version,
      spritesheetPath: 'spritesheet.webp',
    },
    atlas: { width: 1536, height: version === 1 ? 1872 : 2288, hasAlpha: true },
  });
}

function makeProfile() {
  return normalizeProductProfile({
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/test',
    version: '0.1.0',
    build: { appId: 'com.jinke.desktop-pet.dev', executableName: 'DesktopPetDev', artifactName: 'desktop-pet-dev', iconStrategy: 'electron-default-test' },
    defaultScale: 0.75,
  });
}

test('creates a character-neutral runtime contract with supported idle states', () => {
  const contract = createRuntimeContract(makePet(1), makeProfile());

  assert.equal(contract.pet.id, 'v1-pet');
  assert.deepEqual(contract.idleActionNames, ['waving', 'jumping', 'running', 'review']);
  assert.equal(contract.animationTimings.stateFrameMs['running-left'], 1000 / 24);
  assert.equal(JSON.stringify(contract).includes('Wukong'), false);
});

test('maps ordinary and v2 look frames using the normalized pet grid', () => {
  assert.deepEqual(framePosition(makePet(1), 'waving', 5), { x: -192, y: -624 });
  assert.deepEqual(framePosition(makePet(2), 'look-090', 0), { x: -768, y: -1872 });
});

test('normalizes scale and preserves the pet bottom-center anchor while resizing', () => {
  const profile = makeProfile();
  assert.deepEqual(normalizeSettings(profile, { scale: 9 }), { scale: 1.5, launchAtStartup: false });
  assert.deepEqual(
    resizeAroundAnchor({ x: 100, y: 100, width: 144, height: 156 }, makePet(1).grid, 1),
    { x: 76, y: 48, width: 192, height: 208 },
  );
});

test('clamps resized bounds inside the matching display work area', () => {
  assert.deepEqual(
    clampBounds(
      { x: 1900, y: 1040, width: 192, height: 208 },
      { x: 0, y: 0, width: 1920, height: 1080 },
    ),
    { x: 1728, y: 872, width: 192, height: 208 },
  );
});

test('selects drag direction and adapts update cadence to display frequency', () => {
  assert.equal(dragState(-1), 'running-left');
  assert.equal(dragState(1), 'running-right');
  assert.equal(dragState(0, 'running-left'), 'running-left');
  assert.equal(dragUpdateInterval(60), 16);
  assert.equal(dragUpdateInterval(200), 5);
});
