const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { downloadPetdexSlug } = require('../src/import/petdex-adapter');

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

function manifestPet(overrides = {}) {
  return {
    slug: 'remote-sample',
    displayName: 'Remote Sample',
    petJsonUrl: 'https://assets.petdex.dev/pets/remote-sample/pet.json',
    spritesheetUrl: 'https://assets.petdex.dev/pets/remote-sample/spritesheet.webp',
    spriteVersionNumber: 2,
    ...overrides,
  };
}

test('downloads an allowlisted slug into isolation and imports it without touching user pet folders', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-'));
  const requests = [];
  const petJson = JSON.stringify({
    id: 'remote-sample',
    displayName: 'Remote Sample',
    spriteVersionNumber: 2,
    spritesheetPath: 'spritesheet.webp',
  });
  const atlas = makeLosslessWebp(1536, 2288, true);
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url === 'https://petdex.dev/api/manifest') {
      return new Response(JSON.stringify({ pets: [manifestPet()] }));
    }
    if (url.endsWith('/pet.json')) return new Response(petJson);
    if (url.endsWith('/spritesheet.webp')) return new Response(atlas);
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await downloadPetdexSlug({
    slug: 'remote-sample',
    outputRoot: path.join(root, 'imports'),
    fetchImpl,
  });

  assert.equal(result.report.source.type, 'petdex-slug');
  assert.equal(result.report.source.identity, 'remote-sample');
  assert.equal(result.report.pet.spriteVersionNumber, 2);
  assert.deepEqual(requests.map((request) => request.url), [
    'https://petdex.dev/api/manifest',
    manifestPet().petJsonUrl,
    manifestPet().spritesheetUrl,
  ]);
  assert.equal(requests[0].options.redirect, 'manual');
  assert.ok(requests.slice(1).every((request) => request.options.redirect === 'error'));
});

test('follows one allowlisted manifest redirect and rejects other redirect targets', async (t) => {
  await t.test('allowlisted Petdex manifest target', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-'));
    const requests = [];
    const petJson = JSON.stringify({
      id: 'remote-sample', displayName: 'Remote Sample', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp',
    });
    const fetchImpl = async (url) => {
      requests.push(url);
      if (url === 'https://petdex.dev/api/manifest') {
        return new Response(null, {
          status: 307,
          headers: { location: 'https://assets.petdex.dev/manifests/petdex-v1.json' },
        });
      }
      if (url.endsWith('/petdex-v1.json')) return new Response(JSON.stringify({ pets: [manifestPet()] }));
      if (url.endsWith('/pet.json')) return new Response(petJson);
      return new Response(makeLosslessWebp(1536, 2288, true));
    };
    const result = await downloadPetdexSlug({
      slug: 'remote-sample', outputRoot: path.join(root, 'imports'), fetchImpl,
    });
    assert.equal(result.report.pet.id, 'remote-sample');
    assert.equal(requests[1], 'https://assets.petdex.dev/manifests/petdex-v1.json');
  });

  await t.test('untrusted redirect target', async () => {
    await assert.rejects(downloadPetdexSlug({
      slug: 'remote-sample',
      outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-')),
      fetchImpl: async () => new Response(null, {
        status: 307,
        headers: { location: 'https://example.com/manifest.json' },
      }),
    }), (error) => error.code === 'UNTRUSTED_MANIFEST_REDIRECT');
  });
});

test('rejects asset URLs outside the Petdex allowlist before downloading assets', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return new Response(JSON.stringify({
      pets: [manifestPet({ spritesheetUrl: 'https://example.com/evil.webp' })],
    }));
  };

  await assert.rejects(downloadPetdexSlug({
    slug: 'remote-sample',
    outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-')),
    fetchImpl,
  }), (error) => error.code === 'UNTRUSTED_ASSET_URL');
  assert.deepEqual(requested, ['https://petdex.dev/api/manifest']);
});

test('rejects missing slugs and responses over the configured size limit', async (t) => {
  await t.test('missing slug', async () => {
    await assert.rejects(downloadPetdexSlug({
      slug: 'missing',
      outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-')),
      fetchImpl: async () => new Response(JSON.stringify({ pets: [] })),
    }), (error) => error.code === 'PETDEX_SLUG_NOT_FOUND');
  });

  await t.test('oversized manifest', async () => {
    await assert.rejects(downloadPetdexSlug({
      slug: 'remote-sample',
      outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-adapter-')),
      fetchImpl: async () => new Response('oversized', { headers: { 'content-length': '5000000' } }),
    }), (error) => error.code === 'DOWNLOAD_TOO_LARGE');
  });
});
