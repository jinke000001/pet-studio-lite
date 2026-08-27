const fs = require('node:fs');

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectWebpBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)
    || buffer.length < 20
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Invalid WebP container');
  }

  let dimensions;
  let hasAlpha = false;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + size + (size % 2);
    if (dataOffset + size > buffer.length) throw new Error('Invalid WebP chunk length');

    if (type === 'VP8X' && size >= 10) {
      hasAlpha ||= Boolean(buffer[dataOffset] & 0x10);
      dimensions = {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
      };
    } else if (type === 'VP8L' && size >= 5) {
      if (buffer[dataOffset] !== 0x2f) throw new Error('Invalid lossless WebP signature');
      const bits = buffer.readUInt32LE(dataOffset + 1);
      dimensions = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
      hasAlpha ||= Boolean((bits >>> 28) & 1);
    } else if (type === 'VP8 ' && size >= 10) {
      if (buffer[dataOffset + 3] !== 0x9d
        || buffer[dataOffset + 4] !== 0x01
        || buffer[dataOffset + 5] !== 0x2a) {
        throw new Error('Invalid lossy WebP signature');
      }
      dimensions = {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    } else if (type === 'ALPH') {
      hasAlpha = true;
    }
    offset = nextOffset;
  }

  if (!dimensions || !dimensions.width || !dimensions.height) {
    throw new Error('WebP dimensions are missing');
  }
  return { ...dimensions, hasAlpha };
}

function inspectWebp(filePath) {
  return inspectWebpBuffer(fs.readFileSync(filePath));
}

module.exports = { inspectWebp, inspectWebpBuffer };
