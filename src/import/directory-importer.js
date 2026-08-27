const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { normalizePetPackage } = require('../core/pet-package');
const { inspectWebp } = require('../core/webp-inspector');
const {
  ImportError,
  normalizeImportOptions,
  validateSafeIdentifier,
} = require('./import-contract');

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function scanSource(sourceRoot, limits) {
  const files = [];
  let totalBytes = 0;

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(sourceRoot, absolutePath).split(path.sep).join('/');
      if (!relativePath || relativePath.length > limits.maxPathLength) {
        throw new ImportError('PATH_TOO_LONG', `Package path exceeds the limit: ${relativePath}`);
      }
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new ImportError('SYMLINK_NOT_ALLOWED', `Symbolic links are not allowed: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new ImportError('FILE_TYPE_NOT_ALLOWED', `Unsupported file type: ${relativePath}`);
      }
      if (stat.size > limits.maxFileBytes) {
        throw new ImportError('FILE_TOO_LARGE', `File exceeds the size limit: ${relativePath}`);
      }
      totalBytes += stat.size;
      if (totalBytes > limits.maxTotalBytes) {
        throw new ImportError('PACKAGE_TOO_LARGE', 'Package exceeds the total size limit');
      }
      files.push({ absolutePath, relativePath, bytes: stat.size, sha256: sha256File(absolutePath) });
      if (files.length > limits.maxFiles) {
        throw new ImportError('TOO_MANY_FILES', 'Package exceeds the file count limit');
      }
    }
  }

  visit(sourceRoot);
  return files;
}

function sourceDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(String(file.bytes));
    hash.update('\0');
    hash.update(file.sha256);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function readManifest(sourceRoot, files) {
  const manifestFile = files.find((file) => file.relativePath === 'pet.json');
  if (!manifestFile) throw new ImportError('MISSING_MANIFEST', 'Package must contain pet.json at its root');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile.absolutePath, 'utf8'));
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw new Error('expected an object');
    return manifest;
  } catch (error) {
    throw new ImportError('INVALID_MANIFEST', `Unable to parse pet.json: ${error.message}`, { cause: error });
  }
}

function copyVerifiedFile(file, sourceRoot, destinationRoot) {
  const realFilePath = fs.realpathSync(file.absolutePath);
  if (!isInside(sourceRoot, realFilePath)) {
    throw new ImportError('SOURCE_ESCAPE', `Source file resolves outside the package: ${file.relativePath}`);
  }
  const destination = path.join(destinationRoot, ...file.relativePath.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(realFilePath, destination, fs.constants.COPYFILE_EXCL);
  if (sha256File(destination) !== file.sha256) {
    throw new ImportError('SOURCE_CHANGED', `Source changed during import: ${file.relativePath}`);
  }
}

function existingResult(importDirectory) {
  const reportPath = path.join(importDirectory, 'import-report.json');
  if (!fs.existsSync(reportPath)) {
    throw new ImportError('DESTINATION_CONFLICT', `Import destination already exists: ${importDirectory}`);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return {
    alreadyImported: true,
    importDirectory,
    sourceSnapshotPath: path.join(importDirectory, 'source'),
    packagePath: path.join(importDirectory, 'package'),
    reportPath,
    report,
  };
}

function importPetDirectory({
  sourceDirectory,
  outputRoot,
  sourceIdentity,
  authorizationStatus = 'unknown',
  limits,
  now = () => new Date(),
}) {
  const options = normalizeImportOptions({
    sourceType: 'directory',
    sourceIdentity,
    authorizationStatus,
    limits,
  });
  const sourceRoot = fs.realpathSync(sourceDirectory);
  if (!fs.lstatSync(sourceRoot).isDirectory()) {
    throw new ImportError('INVALID_SOURCE', 'sourceDirectory must be a directory');
  }
  const resolvedOutputRoot = path.resolve(outputRoot);
  if (isInside(sourceRoot, resolvedOutputRoot)) {
    throw new ImportError('OUTPUT_INSIDE_SOURCE', 'outputRoot must not be inside sourceDirectory');
  }

  const files = scanSource(sourceRoot, options.limits);
  const manifest = readManifest(sourceRoot, files);
  const packageId = validateSafeIdentifier(manifest.id, 'pet.json id');
  const atlasRelativePath = manifest.spritesheetPath;
  const atlasFile = files.find((file) => file.relativePath === atlasRelativePath);
  if (!atlasFile) throw new ImportError('MISSING_SPRITESHEET', 'pet.json spritesheetPath does not exist');
  const pet = normalizePetPackage({ manifest, atlas: inspectWebp(atlasFile.absolutePath) });
  const digest = sourceDigest(files);
  const importDirectory = path.join(resolvedOutputRoot, `${packageId}-${digest.slice(0, 12)}`);
  if (fs.existsSync(importDirectory)) return existingResult(importDirectory);

  fs.mkdirSync(resolvedOutputRoot, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(resolvedOutputRoot, '.tmp-import-'));
  try {
    const sourceSnapshotPath = path.join(temporaryDirectory, 'source');
    const packagePath = path.join(temporaryDirectory, 'package');
    fs.mkdirSync(sourceSnapshotPath);
    fs.mkdirSync(packagePath);
    for (const file of files) copyVerifiedFile(file, sourceRoot, sourceSnapshotPath);
    fs.copyFileSync(
      path.join(sourceSnapshotPath, ...atlasFile.relativePath.split('/')),
      path.join(packagePath, pet.spritesheetPath),
      fs.constants.COPYFILE_EXCL,
    );
    fs.writeFileSync(path.join(packagePath, 'pet.json'), `${JSON.stringify({
      id: pet.id,
      displayName: pet.displayName,
      description: pet.description,
      spriteVersionNumber: pet.spriteVersionNumber,
      spritesheetPath: pet.spritesheetPath,
    }, null, 2)}\n`, { flag: 'wx' });

    const report = {
      schemaVersion: 1,
      importedAt: now().toISOString(),
      authorizationStatus: options.authorizationStatus,
      source: { type: options.sourceType, identity: options.sourceIdentity, originalPath: sourceRoot },
      sourceDigest: digest,
      files: files.map(({ relativePath, bytes, sha256 }) => ({ path: relativePath, bytes, sha256 })),
      pet,
    };
    const temporaryReportPath = path.join(temporaryDirectory, 'import-report.json');
    fs.writeFileSync(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporaryDirectory, importDirectory);
    return {
      alreadyImported: false,
      importDirectory,
      sourceSnapshotPath: path.join(importDirectory, 'source'),
      packagePath: path.join(importDirectory, 'package'),
      reportPath: path.join(importDirectory, 'import-report.json'),
      report,
    };
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    if (fs.existsSync(importDirectory)) return existingResult(importDirectory);
    throw error;
  }
}

module.exports = { importPetDirectory, scanSource, sourceDigest };
