const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProductProfile } = require('../src/core/product-profile');

test('normalizes safe defaults without embedding a character identity in the runtime', () => {
  const profile = normalizeProductProfile({
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/wukong',
    version: '0.1.0',
    build: {
      appId: 'com.jinke.desktop-pet.dev',
      executableName: 'DesktopPetDev',
      artifactName: 'desktop-pet-dev',
      iconStrategy: 'electron-default-test',
    },
  });

  assert.deepEqual(profile, {
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/wukong',
    version: '0.1.0',
    build: {
      appId: 'com.jinke.desktop-pet.dev',
      executableName: 'DesktopPetDev',
      artifactName: 'desktop-pet-dev',
      iconStrategy: 'electron-default-test',
    },
    defaultScale: 0.75,
    messages: { singleClick: '你好！', doubleClick: '很高兴见到你！' },
  });
});

test('rejects absolute and parent-relative pet package paths', () => {
  for (const petPackagePath of ['/tmp/pet', '../pet']) {
    assert.throws(() => normalizeProductProfile({
      productId: 'desktop-pet-dev',
      productName: '通用桌宠开发版',
      petPackagePath,
      version: '0.1.0',
      build: {
        appId: 'com.jinke.desktop-pet.dev',
        executableName: 'DesktopPetDev',
        artifactName: 'desktop-pet-dev',
        iconStrategy: 'electron-default-test',
      },
    }), /petPackagePath/);
  }
});

test('rejects incomplete or unsafe build identities', () => {
  const base = {
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/wukong',
    version: '0.1.0',
    build: {
      appId: 'com.jinke.desktop-pet.dev',
      executableName: 'DesktopPetDev',
      artifactName: 'desktop-pet-dev',
      iconStrategy: 'electron-default-test',
    },
  };

  assert.throws(() => normalizeProductProfile({ ...base, version: 'v1' }), /version/);
  assert.throws(() => normalizeProductProfile({ ...base, build: { ...base.build, appId: 'unsafe id' } }), /appId/);
  assert.throws(() => normalizeProductProfile({ ...base, build: { ...base.build, executableName: '../pet' } }), /executableName/);
  assert.throws(() => normalizeProductProfile({ ...base, build: { ...base.build, artifactName: 'Pet Setup' } }), /artifactName/);
  assert.throws(() => normalizeProductProfile({ ...base, build: { ...base.build, iconStrategy: 'download' } }), /iconStrategy/);
});
