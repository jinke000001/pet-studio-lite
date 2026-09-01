const fs = require('node:fs');
const path = require('node:path');

function packagePathSegments(name) {
  if (typeof name !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) {
    throw new Error(`invalid package name: ${name}`);
  }
  return name.split('/');
}

function findPackageDirectory(name, startDirectory, projectRoot) {
  const root = path.resolve(projectRoot);
  const segments = packagePathSegments(name);
  let current = path.resolve(startDirectory);
  while (current === root || current.startsWith(`${root}${path.sep}`)) {
    const candidates = [path.join(current, 'node_modules', ...segments)];
    if (path.basename(current) === 'node_modules') candidates.push(path.join(current, ...segments));
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function snapshotPackage(sourceDirectory, destination) {
  function visit(source, target, relativePath = '') {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (!relativePath && entry.name === 'node_modules') continue;
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      const nextRelativePath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        visit(sourcePath, targetPath, nextRelativePath);
      } else if (entry.isFile()) {
        try { fs.linkSync(sourcePath, targetPath); }
        catch (error) {
          if (!['EXDEV', 'EPERM', 'ENOTSUP'].includes(error.code)) throw error;
          fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
        }
      } else if (entry.isSymbolicLink()) {
        const link = fs.readlinkSync(sourcePath);
        const resolvedLink = path.resolve(path.dirname(sourcePath), link);
        if (path.isAbsolute(link) || (resolvedLink !== sourceDirectory && !resolvedLink.startsWith(`${sourceDirectory}${path.sep}`))) {
          throw new Error(`builder runtime package contains an escaping symlink: ${nextRelativePath}`);
        }
        fs.symlinkSync(link, targetPath);
      }
    }
  }
  visit(sourceDirectory, destination);
}

function collectBuilderRuntime({ projectRoot, roots = ['electron-builder'] }) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const nodeModulesRoot = fs.realpathSync(path.join(root, 'node_modules'));
  const packages = [];
  const visited = new Set();

  function include(name, fromDirectory, optional = false) {
    const sourceDirectory = findPackageDirectory(name, fromDirectory, root);
    if (!sourceDirectory) {
      if (optional) return;
      throw new Error(`builder runtime dependency is missing: ${name}`);
    }
    if (sourceDirectory !== nodeModulesRoot && !sourceDirectory.startsWith(`${nodeModulesRoot}${path.sep}`)) {
      throw new Error(`builder runtime dependency escaped node_modules: ${name}`);
    }
    if (visited.has(sourceDirectory)) return;
    visited.add(sourceDirectory);
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'package.json'), 'utf8'));
    const relativeDirectory = path.relative(root, sourceDirectory);
    packages.push({ name: manifest.name, version: manifest.version, sourceDirectory, relativePath: relativeDirectory.replaceAll(path.sep, '/') });
    for (const dependency of Object.keys(manifest.dependencies || {})) include(dependency, sourceDirectory);
    for (const dependency of Object.keys(manifest.optionalDependencies || {})) include(dependency, sourceDirectory, true);
  }

  for (const name of roots) include(name, root);
  packages.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { packages };
}

function stageBuilderRuntime({ projectRoot, outputDirectory, roots }) {
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const runtime = collectBuilderRuntime({ projectRoot, roots });
  for (const entry of runtime.packages) snapshotPackage(entry.sourceDirectory, path.join(output, ...entry.relativePath.split('/')));
  const publicPackages = runtime.packages.map(({ sourceDirectory: _sourceDirectory, ...entry }) => entry);
  fs.writeFileSync(path.join(output, 'runtime-manifest.json'), `${JSON.stringify({ schemaVersion: 1, packages: publicPackages }, null, 2)}\n`, { flag: 'wx' });
  return { outputDirectory: output, packages: publicPackages };
}

module.exports = { collectBuilderRuntime, findPackageDirectory, snapshotPackage, stageBuilderRuntime };
