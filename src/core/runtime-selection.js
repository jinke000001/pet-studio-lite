const fs = require('node:fs');
const path = require('node:path');

const { resolveProductProfile, selectProductSelector } = require('./profile-selector');

function regularFile(filePath) {
  const stats = fs.lstatSync(filePath);
  return stats.isFile() && !stats.isSymbolicLink();
}

function resolveRuntimeSelection({ defaultProjectRoot, packageMetadata, environment = process.env }) {
  const previewRootInput = environment.DESKTOP_PET_PREVIEW_ROOT;
  if (!previewRootInput) {
    const selector = selectProductSelector({
      embeddedSelector: packageMetadata.desktopPetProduct,
      environmentSelector: environment.PET_PRODUCT,
    });
    return {
      preview: false,
      projectRoot: defaultProjectRoot,
      profilePath: resolveProductProfile(defaultProjectRoot, selector),
      userDataPath: undefined,
      parentPid: undefined,
    };
  }
  if (!path.isAbsolute(previewRootInput)) throw new Error('preview root must be absolute');
  const previewStats = fs.lstatSync(previewRootInput);
  if (!previewStats.isDirectory() || previewStats.isSymbolicLink()) throw new Error('preview root is unsafe');
  const previewRoot = fs.realpathSync(previewRootInput);
  const markerPath = path.join(previewRoot, '.desktop-pet-preview.json');
  const profilePath = path.join(previewRoot, 'config', 'products', 'preview.json');
  if (!regularFile(markerPath) || !regularFile(profilePath)) throw new Error('preview bundle is incomplete');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (marker.schemaVersion !== 1) throw new Error('preview bundle version is unsupported');
  const userDataPath = environment.DESKTOP_PET_PREVIEW_USER_DATA;
  if (typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath)) {
    throw new Error('preview user data must be an absolute isolated path');
  }
  const parentPid = Number(environment.DESKTOP_PET_PREVIEW_PARENT_PID);
  return {
    preview: true,
    projectRoot: previewRoot,
    profilePath,
    userDataPath: path.resolve(userDataPath),
    parentPid: Number.isSafeInteger(parentPid) && parentPid > 0 ? parentPid : undefined,
  };
}

module.exports = { resolveRuntimeSelection };
