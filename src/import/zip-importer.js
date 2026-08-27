const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');

const { importPetDirectory } = require('./directory-importer');
const { ImportError, normalizeImportOptions } = require('./import-contract');

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validateZipPath(fileName, maxPathLength) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || fileName.includes('\0')) {
    throw new ImportError('UNSAFE_ZIP_PATH', 'ZIP entry contains an invalid path');
  }
  const withoutTrailingSlash = fileName.endsWith('/') ? fileName.slice(0, -1) : fileName;
  const segments = withoutTrailingSlash.split('/');
  if (!withoutTrailingSlash || path.posix.isAbsolute(fileName) || /^[a-z]:\//i.test(fileName)
    || segments.some((segment) => !segment || segment === '.' || segment === '..'
      || segment.endsWith('.') || segment.endsWith(' ') || WINDOWS_RESERVED_NAME.test(segment))) {
    throw new ImportError('UNSAFE_ZIP_PATH', `Unsafe ZIP entry path: ${fileName}`);
  }
  const normalized = segments.join('/').normalize('NFC');
  if (normalized.length > maxPathLength) {
    throw new ImportError('PATH_TOO_LONG', `ZIP entry path exceeds the limit: ${fileName}`);
  }
  return normalized;
}

function unixFileType(entry) {
  return ((entry.externalFileAttributes >>> 16) & 0o170000);
}

function assertSupportedEntry(entry, relativePath, limits, counters) {
  if (entry.isEncrypted()) {
    throw new ImportError('ENCRYPTED_ZIP_NOT_ALLOWED', `Encrypted ZIP entries are not allowed: ${relativePath}`);
  }
  const fileType = unixFileType(entry);
  if (fileType === 0o120000) {
    throw new ImportError('ZIP_SYMLINK_NOT_ALLOWED', `ZIP symbolic links are not allowed: ${relativePath}`);
  }
  const isDirectory = entry.fileName.endsWith('/');
  if (fileType && fileType !== 0o100000 && fileType !== 0o040000) {
    throw new ImportError('ZIP_FILE_TYPE_NOT_ALLOWED', `Unsupported ZIP entry type: ${relativePath}`);
  }
  if (isDirectory) return;
  if (!entry.canDecodeFileData()) {
    throw new ImportError('ZIP_COMPRESSION_NOT_SUPPORTED', `Unsupported ZIP compression: ${relativePath}`);
  }
  if (entry.uncompressedSize > limits.maxFileBytes) {
    throw new ImportError('FILE_TOO_LARGE', `ZIP entry exceeds the file size limit: ${relativePath}`);
  }
  counters.files += 1;
  counters.bytes += entry.uncompressedSize;
  if (counters.files > limits.maxFiles) throw new ImportError('TOO_MANY_FILES', 'ZIP exceeds the file count limit');
  if (counters.bytes > limits.maxTotalBytes) throw new ImportError('PACKAGE_TOO_LARGE', 'ZIP exceeds the total size limit');
  if (entry.uncompressedSize > 1024 * 1024
    && (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > 100)) {
    throw new ImportError('ZIP_EXPANSION_LIMIT', `ZIP entry has a suspicious expansion ratio: ${relativePath}`);
  }
}

async function extractZip(zipPath, extractionRoot, limits) {
  let zipFile;
  const seenPaths = new Set();
  const counters = { files: 0, bytes: 0 };
  try {
    zipFile = await yauzl.openPromise(zipPath, {
      autoClose: true,
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
    for await (const entry of zipFile.eachEntry()) {
      const relativePath = validateZipPath(entry.fileName, limits.maxPathLength);
      const collisionKey = relativePath.toLowerCase();
      if (seenPaths.has(collisionKey)) {
        throw new ImportError('DUPLICATE_ZIP_PATH', `Duplicate ZIP entry path: ${relativePath}`);
      }
      seenPaths.add(collisionKey);
      assertSupportedEntry(entry, relativePath, limits, counters);
      const destination = path.join(extractionRoot, ...relativePath.split('/'));
      if (entry.fileName.endsWith('/')) {
        fs.mkdirSync(destination, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const readStream = await zipFile.openReadStreamPromise(entry);
      let writtenBytes = 0;
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          writtenBytes += chunk.length;
          if (writtenBytes > entry.uncompressedSize || writtenBytes > limits.maxFileBytes) {
            callback(new ImportError('ZIP_SIZE_MISMATCH', `ZIP entry exceeded its declared size: ${relativePath}`));
          } else {
            callback(null, chunk);
          }
        },
      });
      await pipeline(readStream, limiter, fs.createWriteStream(destination, { flags: 'wx' }));
    }
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('INVALID_ZIP', `Unable to extract ZIP: ${error.message}`, { cause: error });
  } finally {
    if (zipFile && zipFile.isOpen) zipFile.close();
  }
}

function findPackageRoot(extractionRoot) {
  if (fs.existsSync(path.join(extractionRoot, 'pet.json'))) return extractionRoot;
  const candidates = fs.readdirSync(extractionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '__MACOSX')
    .map((entry) => path.join(extractionRoot, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'pet.json')));
  if (candidates.length !== 1) {
    throw new ImportError('PACKAGE_ROOT_NOT_FOUND', 'ZIP must contain one pet.json at its root or one wrapper directory');
  }
  return candidates[0];
}

async function importPetZip({
  zipPath,
  outputRoot,
  sourceIdentity,
  authorizationStatus = 'unknown',
  limits,
  now,
}) {
  const options = normalizeImportOptions({
    sourceType: 'zip',
    sourceIdentity,
    authorizationStatus,
    limits,
  });
  const resolvedZipPath = fs.realpathSync(zipPath);
  if (!fs.lstatSync(resolvedZipPath).isFile()) {
    throw new ImportError('INVALID_SOURCE', 'zipPath must be a regular file');
  }
  const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-zip-extract-'));
  try {
    await extractZip(resolvedZipPath, extractionRoot, options.limits);
    return importPetDirectory({
      sourceDirectory: findPackageRoot(extractionRoot),
      outputRoot,
      sourceType: 'zip',
      sourceIdentity: options.sourceIdentity,
      sourceOriginalPath: resolvedZipPath,
      sourceOriginalSha256: sha256File(resolvedZipPath),
      authorizationStatus: options.authorizationStatus,
      limits: options.limits,
      now,
    });
  } finally {
    fs.rmSync(extractionRoot, { recursive: true, force: true });
  }
}

module.exports = { extractZip, importPetZip, validateZipPath };
