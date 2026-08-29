const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');

const {
  inspectPackagedAsar,
  normalizeArchiveEntry,
  toArchiveExtractionPath,
} = require('../src/build/asar-inspector');

test('normalizes Windows ASAR entry separators before validating package contents', () => {
  assert.equal(
    normalizeArchiveEntry('\\config\\products\\sample.json'),
    'config/products/sample.json',
  );
});

test('restores Windows separators before extracting a normalized nested ASAR entry', () => {
  assert.equal(
    toArchiveExtractionPath('config/products/sample.json', '\\'),
    'config\\products\\sample.json',
  );
});

async function makeAsar({ includeOtherProduct = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-asar-inspector-'));
  const source = path.join(root, 'source');
  const archive = path.join(root, 'app.asar');
  fs.mkdirSync(path.join(source, 'config', 'products'), { recursive: true });
  fs.mkdirSync(path.join(source, 'local-pets', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
    name: 'sample-desktop-pet',
    version: '0.1.0',
    desktopPetProduct: 'sample',
  }));
  fs.writeFileSync(path.join(source, 'config', 'products', 'sample.json'), JSON.stringify({
    productId: 'sample-desktop-pet',
    productName: 'Sample Desktop Pet',
    petPackagePath: 'local-pets/sample',
    version: '0.1.0',
    build: {
      appId: 'com.jinke.desktop-pet.sample',
      executableName: 'SampleDesktopPet',
      artifactName: 'sample-desktop-pet',
      iconStrategy: 'electron-default-test',
    },
  }));
  fs.writeFileSync(path.join(source, 'local-pets', 'sample', 'pet.json'), JSON.stringify({
    id: 'sample',
    displayName: 'Sample',
    spritesheetPath: 'spritesheet.webp',
  }));
  fs.writeFileSync(path.join(source, 'local-pets', 'sample', 'spritesheet.webp'), 'approved-atlas');
  if (includeOtherProduct) fs.writeFileSync(path.join(source, 'config', 'products', 'other.json'), '{}');
  await asar.createPackage(source, archive);
  return archive;
}

test('validates one selected ASAR before inspecting another archive', async (context) => {
  const selectedArchive = await makeAsar();
  await context.test('proves an ASAR contains exactly one selected product and pet atlas', () => {
    const result = inspectPackagedAsar({ asarPath: selectedArchive, selector: 'sample' });
    assert.equal(result.embeddedSelector, 'sample');
    assert.deepEqual(result.productProfiles, ['config/products/sample.json']);
    assert.deepEqual(result.petPackages, ['local-pets/sample']);
    assert.equal(result.petId, 'sample');
    assert.match(result.atlas.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.atlas.size, 14);
  });

  const mixedArchive = await makeAsar({ includeOtherProduct: true });
  await context.test('rejects an ASAR containing another product profile', () => {
    assert.throws(() => inspectPackagedAsar({ asarPath: mixedArchive, selector: 'sample' }), /exactly one product profile/);
  });
});
