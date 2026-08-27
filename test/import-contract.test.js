const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ImportError,
  normalizeImportOptions,
  validateSafeIdentifier,
} = require('../src/import/import-contract');

test('normalizes conservative import limits and source metadata', () => {
  const options = normalizeImportOptions({
    sourceType: 'directory',
    sourceIdentity: 'doraemon',
    authorizationStatus: 'internal-test',
  });

  assert.equal(options.sourceType, 'directory');
  assert.equal(options.sourceIdentity, 'doraemon');
  assert.equal(options.authorizationStatus, 'internal-test');
  assert.equal(options.limits.maxFiles, 64);
  assert.equal(options.limits.maxFileBytes, 64 * 1024 * 1024);
  assert.equal(options.limits.maxTotalBytes, 128 * 1024 * 1024);
});

test('rejects unsafe identifiers and limits outside the supported range', () => {
  assert.throws(() => validateSafeIdentifier('../outside', 'sourceIdentity'), (error) => {
    assert.ok(error instanceof ImportError);
    assert.equal(error.code, 'INVALID_IDENTIFIER');
    return true;
  });

  assert.throws(() => normalizeImportOptions({
    sourceType: 'directory',
    sourceIdentity: 'sample',
    limits: { maxFiles: 0 },
  }), /maxFiles/);
});
