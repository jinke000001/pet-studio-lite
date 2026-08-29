const path = require('node:path');

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function validateRelativePath(value) {
  const candidate = requireText(value, 'petPackagePath').replaceAll('\\', '/');
  const segments = candidate.split('/');
  if (path.isAbsolute(candidate) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('petPackagePath must be a safe project-relative path');
  }
  return candidate;
}

function normalizeBuildIdentity(input = {}) {
  const appId = requireText(input.appId, 'build.appId');
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(appId)) {
    throw new Error('build.appId must use a lowercase reverse-domain identity');
  }
  const executableName = requireText(input.executableName, 'build.executableName');
  if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(executableName)) {
    throw new Error('build.executableName must be a safe ASCII file name');
  }
  const artifactName = requireText(input.artifactName, 'build.artifactName');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifactName)) {
    throw new Error('build.artifactName must use lowercase kebab-case');
  }
  if (input.iconStrategy !== 'electron-default-test') {
    throw new Error('build.iconStrategy must be electron-default-test until an approved icon exists');
  }
  const installScope = input.installScope || 'user';
  if (!['user', 'machine'].includes(installScope)) {
    throw new Error('build.installScope must be user or machine');
  }
  return Object.freeze({
    appId,
    executableName,
    artifactName,
    iconStrategy: input.iconStrategy,
    installScope,
  });
}

function normalizeProductProfile(input = {}) {
  const productId = requireText(input.productId, 'productId');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId)) {
    throw new Error('productId must use lowercase kebab-case');
  }
  const version = requireText(input.version, 'version');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error('version must use semantic version format');
  }
  const scale = Number(input.defaultScale);
  return Object.freeze({
    productId,
    productName: requireText(input.productName, 'productName'),
    petPackagePath: validateRelativePath(input.petPackagePath),
    version,
    build: normalizeBuildIdentity(input.build),
    defaultScale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.5, scale)) : 0.75,
    messages: Object.freeze({
      singleClick: input.messages?.singleClick || '你好！',
      doubleClick: input.messages?.doubleClick || '很高兴见到你！',
    }),
  });
}

module.exports = { normalizeProductProfile };
