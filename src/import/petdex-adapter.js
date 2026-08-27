const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { importPetDirectory } = require('./directory-importer');
const { ImportError, normalizeImportOptions } = require('./import-contract');

const PETDEX_MANIFEST_URL = 'https://petdex.dev/api/manifest';
const TRUSTED_ASSET_HOSTS = new Set(['assets.petdex.dev']);
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_PET_JSON_BYTES = 1024 * 1024;

function validateAssetUrl(rawUrl, expectedExtension) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ImportError('UNTRUSTED_ASSET_URL', 'Petdex manifest contains an invalid asset URL');
  }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password
    || !TRUSTED_ASSET_HOSTS.has(parsed.hostname)
    || !parsed.pathname.toLowerCase().endsWith(expectedExtension)) {
    throw new ImportError('UNTRUSTED_ASSET_URL', 'Petdex manifest contains an untrusted asset URL');
  }
  return parsed.href;
}

async function readBoundedResponse(response, maxBytes, label) {
  if (!response || response.ok !== true) {
    throw new ImportError('DOWNLOAD_FAILED', `${label} download failed with status ${response?.status ?? 'unknown'}`);
  }
  const declaredLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ImportError('DOWNLOAD_TOO_LARGE', `${label} exceeds the download size limit`);
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new ImportError('DOWNLOAD_TOO_LARGE', `${label} exceeds the download size limit`);
    return buffer;
  }
  const chunks = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ImportError('DOWNLOAD_TOO_LARGE', `${label} exceeds the download size limit`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

async function safeFetch(fetchImpl, url, { maxBytes, label, referer }) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      ...(referer ? { headers: { Referer: referer } } : {}),
    });
  } catch (error) {
    throw new ImportError('DOWNLOAD_FAILED', `${label} download failed`, { cause: error });
  }
  return readBoundedResponse(response, maxBytes, label);
}

function parseManifest(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new ImportError('INVALID_PETDEX_MANIFEST', 'Petdex manifest is not valid JSON', { cause: error });
  }
  if (!data || !Array.isArray(data.pets) || data.pets.length > 10_000) {
    throw new ImportError('INVALID_PETDEX_MANIFEST', 'Petdex manifest has an invalid pets list');
  }
  return data.pets;
}

async function downloadPetdexSlug({
  slug,
  outputRoot,
  authorizationStatus = 'internal-test',
  limits,
  now,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') throw new ImportError('FETCH_UNAVAILABLE', 'fetch is unavailable');
  const options = normalizeImportOptions({
    sourceType: 'petdex-slug',
    sourceIdentity: slug,
    authorizationStatus,
    limits,
  });
  const manifestBuffer = await safeFetch(fetchImpl, PETDEX_MANIFEST_URL, {
    maxBytes: MAX_MANIFEST_BYTES,
    label: 'Petdex manifest',
  });
  const entry = parseManifest(manifestBuffer).find((pet) => pet && pet.slug === options.sourceIdentity);
  if (!entry) throw new ImportError('PETDEX_SLUG_NOT_FOUND', `Petdex slug was not found: ${slug}`);
  const petJsonUrl = validateAssetUrl(entry.petJsonUrl, '.json');
  const spritesheetUrl = validateAssetUrl(entry.spritesheetUrl, '.webp');
  const [petJson, spritesheet] = await Promise.all([
    safeFetch(fetchImpl, petJsonUrl, {
      maxBytes: Math.min(MAX_PET_JSON_BYTES, options.limits.maxFileBytes),
      label: 'pet.json',
      referer: 'https://petdex.dev/',
    }),
    safeFetch(fetchImpl, spritesheetUrl, {
      maxBytes: options.limits.maxFileBytes,
      label: 'spritesheet',
      referer: 'https://petdex.dev/',
    }),
  ]);

  const isolatedSource = fs.mkdtempSync(path.join(os.tmpdir(), 'petdex-slug-'));
  try {
    fs.writeFileSync(path.join(isolatedSource, 'pet.json'), petJson, { flag: 'wx' });
    fs.writeFileSync(path.join(isolatedSource, 'spritesheet.webp'), spritesheet, { flag: 'wx' });
    return importPetDirectory({
      sourceDirectory: isolatedSource,
      outputRoot,
      sourceType: 'petdex-slug',
      sourceIdentity: options.sourceIdentity,
      sourceOriginalPath: `https://petdex.dev/pets/${options.sourceIdentity}`,
      authorizationStatus: options.authorizationStatus,
      limits: options.limits,
      now,
    });
  } finally {
    fs.rmSync(isolatedSource, { recursive: true, force: true });
  }
}

module.exports = {
  PETDEX_MANIFEST_URL,
  downloadPetdexSlug,
  parseManifest,
  readBoundedResponse,
  validateAssetUrl,
};
