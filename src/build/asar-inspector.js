const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const { normalizeProductProfile } = require('../core/product-profile');

function parseJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function hashBuffer(buffer) {
  return {
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function normalizeArchiveEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\/+/, '');
}

function toArchiveExtractionPath(entry, separator = path.sep) {
  return normalizeArchiveEntry(entry).split('/').join(separator);
}

function safePackageFile(baseDirectory, relativePath, field) {
  if (typeof relativePath !== 'string') throw new Error(`${field} is required`);
  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${field} must be a safe relative path`);
  }
  return path.posix.join(baseDirectory, normalized);
}

function inspectPackagedAsar({ asarPath, selector }) {
  const entries = asar.listPackage(asarPath).map(normalizeArchiveEntry);
  const productProfiles = entries.filter((entry) => /^config\/products\/[^/]+\.json$/.test(entry));
  if (productProfiles.length !== 1 || productProfiles[0] !== `config/products/${selector}.json`) {
    throw new Error('packaged ASAR must contain exactly one product profile for the selected product');
  }

  const packageMetadata = parseJson(
    asar.extractFile(asarPath, toArchiveExtractionPath('package.json')),
    'package.json',
  );
  if (packageMetadata.desktopPetProduct !== selector) throw new Error('packaged product selector does not match the request');
  const profile = normalizeProductProfile(parseJson(
    asar.extractFile(asarPath, toArchiveExtractionPath(productProfiles[0])),
    productProfiles[0],
  ));
  if (packageMetadata.name !== profile.productId || packageMetadata.version !== profile.version) {
    throw new Error('packaged product metadata does not match its profile');
  }

  const petManifestPath = path.posix.join(profile.petPackagePath, 'pet.json');
  const petPackages = entries.filter((entry) => /^local-pets\/[^/]+\/pet\.json$/.test(entry))
    .map((entry) => path.posix.dirname(entry));
  if (petPackages.length !== 1 || petPackages[0] !== profile.petPackagePath) {
    throw new Error('packaged ASAR must contain exactly one selected pet package');
  }
  const petManifest = parseJson(
    asar.extractFile(asarPath, toArchiveExtractionPath(petManifestPath)),
    petManifestPath,
  );
  const atlasPath = safePackageFile(profile.petPackagePath, petManifest.spritesheetPath, 'spritesheetPath');
  if (!entries.includes(atlasPath)) throw new Error('packaged pet atlas is missing');
  const atlas = asar.extractFile(asarPath, toArchiveExtractionPath(atlasPath));
  const archive = fs.readFileSync(asarPath);
  return {
    embeddedSelector: packageMetadata.desktopPetProduct,
    productId: profile.productId,
    version: profile.version,
    productProfiles,
    petPackages,
    petId: petManifest.id,
    atlas: { path: atlasPath, ...hashBuffer(atlas) },
    asar: hashBuffer(archive),
  };
}

module.exports = { inspectPackagedAsar, normalizeArchiveEntry, toArchiveExtractionPath };
