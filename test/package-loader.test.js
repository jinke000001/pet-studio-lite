const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadRuntimeInputs } = require('../src/core/package-loader');

test('loads a project-relative product profile and normalizes its pet package', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-loader-'));
  const petDir = path.join(projectRoot, 'local-pets', 'sample');
  const profilePath = path.join(projectRoot, 'config', 'sample.json');
  fs.mkdirSync(petDir, { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    productId: 'sample-pet',
    productName: 'Sample Pet',
    petPackagePath: 'local-pets/sample',
    version: '0.1.0',
    build: { appId: 'com.jinke.sample', executableName: 'SamplePet', artifactName: 'sample-pet', iconStrategy: 'electron-default-test' },
  }));
  fs.writeFileSync(path.join(petDir, 'pet.json'), JSON.stringify({
    id: 'sample',
    displayName: 'Sample',
    spritesheetPath: 'spritesheet.webp',
  }));
  fs.writeFileSync(path.join(petDir, 'spritesheet.webp'), 'fixture');

  const loaded = loadRuntimeInputs({
    projectRoot,
    profilePath,
    inspectAtlas(atlasPath) {
      assert.equal(atlasPath, path.join(petDir, 'spritesheet.webp'));
      return { width: 1536, height: 1872, hasAlpha: true };
    },
  });

  assert.equal(loaded.product.productId, 'sample-pet');
  assert.equal(loaded.pet.spriteVersionNumber, 1);
  assert.equal(loaded.petDirectory, petDir);
  assert.match(loaded.atlasUrl, /^file:/);
});

test('reports a missing pet package without falling back to another character', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-loader-'));
  const profilePath = path.join(projectRoot, 'missing.json');
  fs.writeFileSync(profilePath, JSON.stringify({
    productId: 'missing-pet',
    productName: 'Missing Pet',
    petPackagePath: 'local-pets/missing',
    version: '0.1.0',
    build: { appId: 'com.jinke.missing', executableName: 'MissingPet', artifactName: 'missing-pet', iconStrategy: 'electron-default-test' },
  }));

  assert.throws(() => loadRuntimeInputs({
    projectRoot,
    profilePath,
    inspectAtlas() {
      throw new Error('should not inspect');
    },
  }), /pet\.json/);
});
