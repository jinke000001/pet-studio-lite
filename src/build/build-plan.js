const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeProductProfile } = require('../core/product-profile');

const SUPPORTED_TARGETS = Object.freeze(['mac', 'win']);

function normalizeTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('at least one build target is required');
  if (new Set(targets).size !== targets.length || targets.some((target) => !SUPPORTED_TARGETS.includes(target))) {
    throw new Error('build targets must be unique mac or win values');
  }
  return [...targets];
}

function createBuilderConfiguration({ selector, profile: inputProfile, outputDirectory, targets }) {
  if (typeof selector !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selector)) {
    throw new Error('selector must use lowercase kebab-case');
  }
  const profile = normalizeProductProfile(inputProfile);
  const normalizedTargets = normalizeTargets(targets);
  const config = {
    appId: profile.build.appId,
    productName: profile.productName,
    asar: true,
    forceCodeSigning: false,
    publish: null,
    directories: { output: path.join(outputDirectory, 'artifacts') },
    extraMetadata: {
      name: profile.productId,
      version: profile.version,
      main: 'src/main.js',
      private: true,
      desktopPetProduct: selector,
    },
    files: [
      'package.json',
      'src/**/*',
      `config/products/${selector}.json`,
      `${profile.petPackagePath}/**/*`,
      '!**/.DS_Store',
      '!**/._*',
    ],
  };
  if (normalizedTargets.includes('mac')) {
    config.mac = {
      target: [{ target: 'dir', arch: ['arm64'] }],
      identity: null,
      category: 'public.app-category.entertainment',
    };
  }
  if (normalizedTargets.includes('win')) {
    config.win = {
      target: [
        { target: 'dir', arch: ['x64'] },
        { target: 'nsis', arch: ['x64'] },
      ],
      executableName: profile.build.executableName,
    };
    config.nsis = {
      artifactName: `${profile.build.artifactName}-${profile.version}-\${arch}.\${ext}`,
      oneClick: false,
      perMachine: profile.build.installScope === 'machine',
      allowToChangeInstallationDirectory: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      shortcutName: profile.productName,
      uninstallDisplayName: `${profile.productName} ${profile.version}`,
    };
    if (profile.build.installScope === 'machine') {
      config.nsis.include = 'build/nsis/exact-app-process-check.nsh';
    }
  }
  return config;
}

function reserveBuildDirectory(outputRoot, inputProfile, runId) {
  const profile = normalizeProductProfile(inputProfile);
  if (typeof runId !== 'string' || !/^candidate-[a-z0-9-]+$/.test(runId)) {
    throw new Error('runId must be a safe candidate identifier');
  }
  const productDirectory = path.join(path.resolve(outputRoot), profile.productId, profile.version);
  const runDirectory = path.join(productDirectory, runId);
  fs.mkdirSync(productDirectory, { recursive: true });
  try {
    fs.mkdirSync(runDirectory);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`build output already exists: ${runDirectory}`);
    throw error;
  }
  return runDirectory;
}

function hashFile(filePath) {
  // Candidate artifacts include app.asar. Inside the packaged workbench
  // process, Electron's asar fs patch intercepts reads of *.asar paths and
  // fails with ENOENT instead of returning the archive bytes; bypass the
  // patch for this synchronous read.
  const previousNoAsar = process.noAsar;
  process.noAsar = true;
  try {
    const content = fs.readFileSync(filePath);
    return {
      size: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  } finally {
    process.noAsar = previousNoAsar;
  }
}

function createCandidateManifest({
  runDirectory,
  profile: inputProfile,
  selector,
  targets,
  sourceAtlasPath,
  artifactPaths,
  toolVersions,
  packagedResources,
}) {
  const profile = normalizeProductProfile(inputProfile);
  const normalizedTargets = normalizeTargets(targets);
  const root = path.resolve(runDirectory);
  const artifacts = artifactPaths.map((artifactPath) => {
    const resolved = path.resolve(artifactPath);
    const relativePath = path.relative(root, resolved);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('artifact path must be inside the build directory');
    }
    return { path: relativePath.replaceAll(path.sep, '/'), ...hashFile(resolved) };
  });
  if (!Array.isArray(packagedResources) || packagedResources.length === 0) {
    throw new Error('at least one packaged ASAR inspection is required');
  }
  const sourceAtlas = { path: path.resolve(sourceAtlasPath), ...hashFile(sourceAtlasPath) };
  if (packagedResources.some((resource) => resource.embeddedSelector !== selector)) {
    throw new Error('packaged product selector does not match the build request');
  }
  if (packagedResources.some((resource) => resource.atlas?.sha256 !== sourceAtlas.sha256)) {
    throw new Error('packaged atlas does not match the selected source atlas');
  }
  if (new Set(packagedResources.map((resource) => resource.asar?.sha256)).size !== 1) {
    throw new Error('packaged ASAR bytes differ between platform candidates');
  }
  return {
    schemaVersion: 1,
    status: 'internal-candidate',
    generatedAt: new Date().toISOString(),
    selector,
    product: {
      productId: profile.productId,
      productName: profile.productName,
      version: profile.version,
      appId: profile.build.appId,
      executableName: profile.build.executableName,
      iconStrategy: profile.build.iconStrategy,
      installScope: profile.build.installScope,
    },
    targets: normalizedTargets,
    tools: { ...toolVersions },
    sourceAtlas,
    packagedResources,
    artifacts,
    acceptance: {
      macOS: normalizedTargets.includes('mac') ? { packagedApp: 'candidate-built-not-yet-runtime-verified' } : { packagedApp: 'not-built' },
      windows: {
        source: 'unverified',
        unpackedMode: normalizedTargets.includes('win') ? 'candidate-built-static-verification-only' : 'not-built',
        installedMode: 'unverified',
        dpi100: 'unverified',
        dpi125: 'unverified',
        dpi150: 'unverified',
      },
    },
    limitations: [
      'Unsigned internal candidate; Windows SmartScreen may warn.',
      'macOS build evidence does not prove Windows runtime acceptance.',
      'Electron default test icon is temporary and not an approved product icon.',
    ],
  };
}

module.exports = {
  createBuilderConfiguration,
  createCandidateManifest,
  normalizeTargets,
  reserveBuildDirectory,
};
