const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - (22 + MAX_COMMENT_LENGTH));
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('ZIP end-of-central-directory record not found');
}

function decodeEntryName(buffer, flags) {
  return buffer.toString('utf8');
}

function readCentralDirectory(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const endOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error('multi-disk ZIP archives are not supported');
  }
  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported');
  }
  if (centralDirectoryOffset + centralDirectorySize > endOffset) {
    throw new Error('ZIP central directory is outside the archive');
  }

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > endOffset || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error(`invalid ZIP central directory entry at offset ${offset}`);
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalFileAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset) throw new Error('ZIP central directory entry exceeds archive bounds');
    const rawName = decodeEntryName(buffer.subarray(nameStart, nameStart + nameLength), flags);
    entries.push({
      rawName,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      externalFileAttributes,
      localHeaderOffset,
    });
    offset = nextOffset;
  }
  return { buffer, entries };
}

function normalizeEntryName(rawName) {
  return rawName.replace(/\\/g, '/').trim();
}

function readZipEntries(zipPath) {
  return readCentralDirectory(zipPath).entries;
}

function readZipEntry(zipPath, requestedName) {
  const { buffer, entries } = readCentralDirectory(zipPath);
  const entry = entries.find(({ rawName }) => normalizeEntryName(rawName) === requestedName);
  if (!entry) throw new Error(`ZIP entry not found: ${requestedName}`);
  if ((entry.flags & 0x1) !== 0) throw new Error(`encrypted ZIP entry is not supported: ${requestedName}`);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`ZIP entry is too large: ${requestedName}`);
  if (entry.localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER) {
    throw new Error(`invalid ZIP local file header: ${requestedName}`);
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new Error(`ZIP entry data exceeds archive bounds: ${requestedName}`);
  const compressed = buffer.subarray(dataStart, dataEnd);
  let data;
  if (entry.compressionMethod === 0) data = compressed;
  else if (entry.compressionMethod === 8) data = zlib.inflateRawSync(compressed);
  else throw new Error(`unsupported ZIP compression method ${entry.compressionMethod}: ${requestedName}`);
  if (data.length !== entry.uncompressedSize) throw new Error(`ZIP entry size mismatch: ${requestedName}`);
  return data;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { readZipEntries, readZipEntry, normalizeEntryName, sha256 };
