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

function normalizeProductProfile(input = {}) {
  const productId = requireText(input.productId, 'productId');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId)) {
    throw new Error('productId must use lowercase kebab-case');
  }
  const scale = Number(input.defaultScale);
  return Object.freeze({
    productId,
    productName: requireText(input.productName, 'productName'),
    petPackagePath: validateRelativePath(input.petPackagePath),
    defaultScale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.5, scale)) : 0.75,
    messages: Object.freeze({
      singleClick: input.messages?.singleClick || '你好！',
      doubleClick: input.messages?.doubleClick || '很高兴见到你！',
    }),
  });
}

module.exports = { normalizeProductProfile };
