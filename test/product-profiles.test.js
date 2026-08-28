const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeProductProfile } = require('../src/core/product-profile');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROFILE_DIRECTORY = path.join(PROJECT_ROOT, 'config', 'products');

test('tracked product profiles are valid and use unique product and pet identities', () => {
  const profileFiles = fs.readdirSync(PROFILE_DIRECTORY)
    .filter((name) => name.endsWith('.json'))
    .sort();

  assert.deepEqual(profileFiles, [
    'dai.json',
    'doraemon.json',
    'jokebear-codexpet.json',
    'wukong.json',
    'xiaofuxing.json',
  ]);

  const profiles = profileFiles.map((name) => normalizeProductProfile(
    JSON.parse(fs.readFileSync(path.join(PROFILE_DIRECTORY, name), 'utf8')),
  ));

  assert.equal(new Set(profiles.map((profile) => profile.productId)).size, profiles.length);
  assert.equal(new Set(profiles.map((profile) => profile.petPackagePath)).size, profiles.length);
  assert.equal(new Set(profiles.map((profile) => profile.build.appId)).size, profiles.length);
  assert.equal(new Set(profiles.map((profile) => profile.build.executableName.toLowerCase())).size, profiles.length);
  assert.equal(new Set(profiles.map((profile) => profile.build.artifactName.toLowerCase())).size, profiles.length);
  assert.ok(profiles.every((profile) => profile.petPackagePath.startsWith('local-pets/')));
  assert.ok(profiles.every((profile) => profile.version === '0.1.0'));
});
