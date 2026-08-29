const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('lint uses a Node script instead of shell-dependent wildcard expansion', () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(packageMetadata.scripts.lint, 'node scripts/check-syntax.js');
});
