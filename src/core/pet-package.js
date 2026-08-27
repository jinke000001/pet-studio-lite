const path = require('node:path');

const GRID_BY_VERSION = Object.freeze({
  1: Object.freeze({ columns: 8, rows: 9, cellWidth: 192, cellHeight: 208 }),
  2: Object.freeze({ columns: 8, rows: 11, cellWidth: 192, cellHeight: 208 }),
});

const STANDARD_STATES = Object.freeze({
  idle: Object.freeze({ row: 0, frames: 6 }),
  'running-right': Object.freeze({ row: 1, frames: 8 }),
  'running-left': Object.freeze({ row: 2, frames: 8 }),
  waving: Object.freeze({ row: 3, frames: 4 }),
  jumping: Object.freeze({ row: 4, frames: 5 }),
  failed: Object.freeze({ row: 5, frames: 8 }),
  waiting: Object.freeze({ row: 6, frames: 6 }),
  running: Object.freeze({ row: 7, frames: 6 }),
  review: Object.freeze({ row: 8, frames: 6 }),
});

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function validateAtlasName(value) {
  const name = requireText(value, 'spritesheetPath');
  if (path.isAbsolute(name) || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw new Error('spritesheetPath must be a package-local filename');
  }
  return name;
}

function inferVersion(manifest, atlas) {
  const declared = manifest.spriteVersionNumber;
  if (declared !== undefined && declared !== 1 && declared !== 2) {
    throw new Error('spriteVersionNumber must be 1 or 2');
  }
  const inferred = atlas.width === 1536 && atlas.height === 1872
    ? 1
    : atlas.width === 1536 && atlas.height === 2288
      ? 2
      : null;
  if (!inferred) throw new Error('atlas dimensions must be 1536x1872 or 1536x2288');
  if (declared !== undefined && declared !== inferred) {
    throw new Error('declared version does not match atlas dimensions');
  }
  return declared ?? inferred;
}

function normalizePetPackage({ manifest, atlas }) {
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest is required');
  if (!atlas || typeof atlas !== 'object') throw new Error('atlas metadata is required');
  if (atlas.hasAlpha !== true) throw new Error('atlas must have an alpha channel');
  const spriteVersionNumber = inferVersion(manifest, atlas);
  return Object.freeze({
    id: requireText(manifest.id, 'id'),
    displayName: requireText(manifest.displayName, 'displayName'),
    description: typeof manifest.description === 'string' ? manifest.description.trim() : '',
    spriteVersionNumber,
    spritesheetPath: validateAtlasName(manifest.spritesheetPath),
    grid: GRID_BY_VERSION[spriteVersionNumber],
    states: STANDARD_STATES,
    capabilities: Object.freeze({ lookDirections: spriteVersionNumber === 2 }),
  });
}

function lookState(name) {
  const match = /^look-(\d{3}(?:\.5)?)$/.exec(name);
  if (!match) return null;
  const degrees = Number(match[1]);
  if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360 || degrees % 22.5 !== 0) return null;
  const index = Math.round(degrees / 22.5);
  return { row: index < 8 ? 9 : 10, frames: 1, column: index % 8 };
}

function stateMeta(pet, name) {
  if (pet.capabilities.lookDirections) {
    const look = lookState(name);
    if (look) return look;
  }
  return pet.states[name] || pet.states.idle;
}

module.exports = {
  GRID_BY_VERSION,
  STANDARD_STATES,
  normalizePetPackage,
  stateMeta,
};
