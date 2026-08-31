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
  const versions = Object.fromEntries(profiles.map((profile) => [profile.productId, profile.version]));
  assert.deepEqual(versions, {
    'dai-desktop-pet': '0.1.0',
    'doraemon-desktop-pet': '0.1.0',
    'jokebear-desktop-pet': '0.1.0',
    'wukong-desktop-pet': '0.1.0',
    'xiaofuxing-desktop-pet': '0.1.5',
  });
  const installScopes = Object.fromEntries(profiles.map((profile) => [profile.productId, profile.build.installScope]));
  assert.deepEqual(installScopes, {
    'dai-desktop-pet': 'user',
    'doraemon-desktop-pet': 'user',
    'jokebear-desktop-pet': 'user',
    'wukong-desktop-pet': 'user',
    'xiaofuxing-desktop-pet': 'machine',
  });
});
