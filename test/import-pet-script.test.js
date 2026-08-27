const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArguments } = require('../scripts/import-pet');

test('parses explicit directory, ZIP and slug import contracts', () => {
  assert.deepEqual(parseArguments([
    'directory', '--source', '/tmp/pet', '--identity', 'sample', '--output', '/tmp/imports',
    '--authorization', 'internal-test',
  ]), {
    command: 'directory',
    source: '/tmp/pet',
    identity: 'sample',
    output: '/tmp/imports',
    authorization: 'internal-test',
  });

  assert.equal(parseArguments(['zip', '--source', '/tmp/pet.zip', '--identity', 'sample']).command, 'zip');
  assert.deepEqual(parseArguments(['slug', '--slug', 'dai']), {
    command: 'slug',
    slug: 'dai',
    output: undefined,
    authorization: 'internal-test',
  });
});

test('rejects missing, duplicate and unknown CLI arguments', () => {
  assert.throws(() => parseArguments(['directory', '--identity', 'sample']), /--source/);
  assert.throws(() => parseArguments(['slug', '--slug', 'dai', '--slug', 'other']), /Duplicate/);
  assert.throws(() => parseArguments(['zip', '--source', 'x.zip', '--identity', 'x', '--wat']), /Unknown/);
});
