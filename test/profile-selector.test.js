const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveProductProfile, selectProductSelector } = require('../src/core/profile-selector');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('selects Wukong by default and supports another tracked product', () => {
  assert.equal(
    resolveProductProfile(PROJECT_ROOT),
    path.join(PROJECT_ROOT, 'config', 'products', 'wukong.json'),
  );
  assert.equal(
    resolveProductProfile(PROJECT_ROOT, 'dai'),
    path.join(PROJECT_ROOT, 'config', 'products', 'dai.json'),
  );
});

test('rejects traversal and unknown products instead of silently falling back', () => {
  assert.throws(() => resolveProductProfile(PROJECT_ROOT, '../dai'), /product selector/);
  assert.throws(() => resolveProductProfile(PROJECT_ROOT, 'missing'), /Unknown product/);
});

test('prefers an embedded packaged product over an environment selector', () => {
  assert.equal(selectProductSelector({ embeddedSelector: 'dai', environmentSelector: 'wukong' }), 'dai');
  assert.equal(selectProductSelector({ environmentSelector: 'doraemon' }), 'doraemon');
  assert.equal(selectProductSelector({}), 'wukong');
});
