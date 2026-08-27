const test = require('node:test');
const assert = require('node:assert/strict');

const { inspectWebpBuffer } = require('../src/core/webp-inspector');

function makeLosslessWebp(width, height, hasAlpha) {
  const dimensions = (width - 1)
    | ((height - 1) << 14)
    | ((hasAlpha ? 1 : 0) << 28);
  const chunk = Buffer.alloc(14);
  chunk.write('VP8L', 0, 'ascii');
  chunk.writeUInt32LE(5, 4);
  chunk[8] = 0x2f;
  chunk.writeUInt32LE(dimensions >>> 0, 9);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(4 + chunk.length, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, chunk]);
}

test('reads dimensions and alpha from a lossless WebP header', () => {
  assert.deepEqual(inspectWebpBuffer(makeLosslessWebp(1536, 2288, true)), {
    width: 1536,
    height: 2288,
    hasAlpha: true,
  });
});

test('reports an opaque WebP and rejects malformed input', () => {
  assert.equal(inspectWebpBuffer(makeLosslessWebp(1536, 1872, false)).hasAlpha, false);
  assert.throws(() => inspectWebpBuffer(Buffer.from('not-webp')), /WebP/);
});
