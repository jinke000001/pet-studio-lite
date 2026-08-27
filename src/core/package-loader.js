const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { normalizePetPackage } = require('./pet-package');
const { normalizeProductProfile } = require('./product-profile');

function resolveInside(root, relativePath, field) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);
  if (resolved !== absoluteRoot && !resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`${field} must stay inside the project root`);
  }
  return resolved;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }
}

function loadRuntimeInputs({ projectRoot, profilePath, inspectAtlas }) {
  if (typeof inspectAtlas !== 'function') throw new Error('inspectAtlas is required');
  const resolvedProfilePath = resolveInside(projectRoot, path.relative(projectRoot, profilePath), 'profilePath');
  const product = normalizeProductProfile(readJson(resolvedProfilePath, 'product profile'));
  const petDirectory = resolveInside(projectRoot, product.petPackagePath, 'petPackagePath');
  const petManifestPath = path.join(petDirectory, 'pet.json');
  const manifest = readJson(petManifestPath, 'pet.json');
  const atlasPath = resolveInside(petDirectory, manifest.spritesheetPath || '', 'spritesheetPath');
  if (!fs.existsSync(atlasPath)) throw new Error(`Missing spritesheet at ${atlasPath}`);
  const pet = normalizePetPackage({ manifest, atlas: inspectAtlas(atlasPath) });
  return Object.freeze({
    product,
    pet,
    petDirectory,
    petManifestPath,
    atlasPath,
    atlasUrl: pathToFileURL(atlasPath).href,
  });
}

module.exports = { loadRuntimeInputs };
