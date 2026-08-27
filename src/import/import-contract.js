const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 64,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxPathLength: 240,
});

const SOURCE_TYPES = new Set(['directory', 'zip', 'petdex-slug']);
const AUTHORIZATION_STATUSES = new Set(['unknown', 'internal-test', 'authorized']);

class ImportError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ImportError';
    this.code = code;
  }
}

function validateSafeIdentifier(value, field = 'identifier') {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) {
    throw new ImportError('INVALID_IDENTIFIER', `${field} must be a lowercase package-safe identifier`);
  }
  return value;
}

function normalizeLimit(value, fallback, field) {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 1024 * 1024 * 1024) {
    throw new ImportError('INVALID_LIMIT', `${field} must be a positive safe integer within the supported range`);
  }
  return normalized;
}

function normalizeImportOptions({
  sourceType,
  sourceIdentity,
  authorizationStatus = 'unknown',
  limits = {},
}) {
  if (!SOURCE_TYPES.has(sourceType)) {
    throw new ImportError('INVALID_SOURCE_TYPE', 'sourceType is not supported');
  }
  if (!AUTHORIZATION_STATUSES.has(authorizationStatus)) {
    throw new ImportError('INVALID_AUTHORIZATION_STATUS', 'authorizationStatus is not supported');
  }
  const normalizedLimits = Object.freeze({
    maxFiles: normalizeLimit(limits.maxFiles, DEFAULT_LIMITS.maxFiles, 'maxFiles'),
    maxFileBytes: normalizeLimit(limits.maxFileBytes, DEFAULT_LIMITS.maxFileBytes, 'maxFileBytes'),
    maxTotalBytes: normalizeLimit(limits.maxTotalBytes, DEFAULT_LIMITS.maxTotalBytes, 'maxTotalBytes'),
    maxPathLength: normalizeLimit(limits.maxPathLength, DEFAULT_LIMITS.maxPathLength, 'maxPathLength'),
  });
  return Object.freeze({
    sourceType,
    sourceIdentity: validateSafeIdentifier(sourceIdentity, 'sourceIdentity'),
    authorizationStatus,
    limits: normalizedLimits,
  });
}

module.exports = {
  DEFAULT_LIMITS,
  ImportError,
  normalizeImportOptions,
  validateSafeIdentifier,
};
