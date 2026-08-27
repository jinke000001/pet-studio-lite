const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProductProfile } = require('../src/core/product-profile');

test('normalizes safe defaults without embedding a character identity in the runtime', () => {
  const profile = normalizeProductProfile({
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/wukong',
  });

  assert.deepEqual(profile, {
    productId: 'desktop-pet-dev',
    productName: '通用桌宠开发版',
    petPackagePath: 'local-pets/wukong',
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
    }), /petPackagePath/);
  }
});
