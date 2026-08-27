const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { normalizePetPackage } = require('../core/pet-package');
const { inspectWebp } = require('../core/webp-inspector');
const { writeImportArtifacts } = require('./artifact-generator');
const {
  ImportError,
  normalizeImportOptions,
  validateSafeIdentifier,
} = require('./import-contract');

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveThroughExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(fs.realpathSync(cursor), ...missingSegments);
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

function importDigest({ digest, sourceType, sourceIdentity, sourceOriginalSha256 }) {
  return crypto.createHash('sha256')
    .update([digest, sourceType, sourceIdentity, sourceOriginalSha256 || ''].join('\0'))
    .digest('hex');
}

function readManifest(sourceRoot, files) {
  const manifestFile = files.find((file) => file.relativePath === 'pet.json');
  if (!manifestFile) throw new ImportError('MISSING_MANIFEST', 'Package must contain pet.json at its root');
  if (manifestFile.bytes > 1024 * 1024) {
    throw new ImportError('MANIFEST_TOO_LARGE', 'pet.json exceeds the 1 MB limit');
  }
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

function existingResult(importDirectory, expected) {
  const reportPath = path.join(importDirectory, 'import-report.json');
  try {
    const sourceSnapshotPath = path.join(importDirectory, 'source');
    const packagePath = path.join(importDirectory, 'package');
    const humanReportPath = path.join(importDirectory, 'import-report.md');
    const contactSheetPath = path.join(importDirectory, 'preview', 'contact-sheet.svg');
    const actionPreviewPath = path.join(importDirectory, 'preview', 'actions.html');
    const requiredPaths = [reportPath, sourceSnapshotPath, packagePath, humanReportPath, contactSheetPath, actionPreviewPath];
    if (requiredPaths.some((requiredPath) => !fs.existsSync(requiredPath))) throw new Error('required artifact is missing');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report.schemaVersion !== 1 || report.sourceDigest !== expected.digest
      || report.source?.type !== expected.options.sourceType
      || report.source?.identity !== expected.options.sourceIdentity
      || (expected.sourceOriginalSha256 && report.source.originalSha256 !== expected.sourceOriginalSha256)) {
      throw new Error('report identity does not match the requested import');
    }
    const snapshotFiles = scanSource(sourceSnapshotPath, expected.options.limits);
    const snapshotRecords = snapshotFiles.map(({ relativePath, bytes, sha256 }) => ({
      path: relativePath,
      bytes,
      sha256,
    }));
    if (sourceDigest(snapshotFiles) !== expected.digest
      || JSON.stringify(snapshotRecords) !== JSON.stringify(report.files)) {
      throw new Error('source snapshot does not match its report');
    }
    const packageFiles = scanSource(packagePath, expected.options.limits);
    const packageManifest = readManifest(packagePath, packageFiles);
    const packageAtlas = packageFiles.find((file) => file.relativePath === packageManifest.spritesheetPath);
    if (!packageAtlas) throw new Error('standard package atlas is missing');
    const normalizedPackage = normalizePetPackage({
      manifest: packageManifest,
      atlas: inspectWebp(packageAtlas.absolutePath),
    });
    const sourceAtlas = snapshotRecords.find((file) => file.path === expected.pet.spritesheetPath);
    if (normalizedPackage.id !== expected.pet.id
      || normalizedPackage.spriteVersionNumber !== expected.pet.spriteVersionNumber
      || packageAtlas.sha256 !== sourceAtlas?.sha256) {
      throw new Error('standard package does not match the source snapshot');
    }
    return {
      alreadyImported: true,
      importDirectory,
      sourceSnapshotPath,
      packagePath,
      reportPath,
      humanReportPath,
      contactSheetPath,
      actionPreviewPath,
      report,
    };
  } catch (error) {
    throw new ImportError(
      'DESTINATION_CONFLICT',
      `Import destination exists but failed integrity verification: ${importDirectory}`,
      { cause: error },
    );
  }
}

function importPetDirectory({
  sourceDirectory,
  outputRoot,
  sourceIdentity,
  sourceType = 'directory',
  sourceOriginalPath,
  sourceOriginalSha256,
  authorizationStatus = 'unknown',
  limits,
  now = () => new Date(),
}) {
  const options = normalizeImportOptions({
    sourceType,
    sourceIdentity,
    authorizationStatus,
    limits,
  });
  const sourceInput = path.resolve(sourceDirectory);
  const sourceInputStat = fs.lstatSync(sourceInput);
  if (sourceInputStat.isSymbolicLink()) {
    throw new ImportError('SYMLINK_NOT_ALLOWED', 'sourceDirectory must not be a symbolic link');
  }
  if (!sourceInputStat.isDirectory()) {
    throw new ImportError('INVALID_SOURCE', 'sourceDirectory must be a directory');
  }
  const sourceRoot = fs.realpathSync(sourceInput);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const canonicalOutputRoot = resolveThroughExistingAncestor(resolvedOutputRoot);
  if (isInside(sourceRoot, canonicalOutputRoot)) {
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
  const uniqueDigest = importDigest({
    digest,
    sourceType: options.sourceType,
    sourceIdentity: options.sourceIdentity,
    sourceOriginalSha256,
  });
  const importDirectory = path.join(resolvedOutputRoot, `${packageId}-${uniqueDigest.slice(0, 12)}`);
  const expectedExisting = { digest, options, pet, sourceOriginalSha256 };
  if (fs.existsSync(importDirectory)) return existingResult(importDirectory, expectedExisting);

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
      source: {
        type: options.sourceType,
        identity: options.sourceIdentity,
        originalPath: sourceOriginalPath || sourceRoot,
        ...(sourceOriginalSha256 ? { originalSha256: sourceOriginalSha256 } : {}),
      },
      sourceDigest: digest,
      files: files.map(({ relativePath, bytes, sha256 }) => ({ path: relativePath, bytes, sha256 })),
      pet,
      artifacts: {
        humanReport: 'import-report.md',
        contactSheet: 'preview/contact-sheet.svg',
        actionPreview: 'preview/actions.html',
      },
    };
    writeImportArtifacts(temporaryDirectory, report);
    const temporaryReportPath = path.join(temporaryDirectory, 'import-report.json');
    fs.writeFileSync(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporaryDirectory, importDirectory);
    return {
      alreadyImported: false,
      importDirectory,
      sourceSnapshotPath: path.join(importDirectory, 'source'),
      packagePath: path.join(importDirectory, 'package'),
      reportPath: path.join(importDirectory, 'import-report.json'),
      humanReportPath: path.join(importDirectory, 'import-report.md'),
      contactSheetPath: path.join(importDirectory, 'preview', 'contact-sheet.svg'),
      actionPreviewPath: path.join(importDirectory, 'preview', 'actions.html'),
      report,
    };
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    if (fs.existsSync(importDirectory)) return existingResult(importDirectory, expectedExisting);
    throw error;
  }
}

module.exports = { importPetDirectory, scanSource, sourceDigest };
