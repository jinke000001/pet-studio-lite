const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { collectBuilderRuntime } = require('./builder-runtime');

function candidateId(now = new Date()) { return `candidate-${now.toISOString().replace(/[-:.TZ]/g, '')}`; }
function hashFile(filePath) { const bytes = fs.readFileSync(filePath); return { size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }

function readGitBaseline({ projectRoot, execFile = childProcess.execFileSync }) {
  const options = { cwd: path.resolve(projectRoot), encoding: 'utf8' };
  const commit = execFile('git', ['rev-parse', 'HEAD'], options).trim();
  const status = execFile('git', ['status', '--porcelain', '--untracked-files=all'], options).trim();
  if (!commit || status) throw new Error('workbench candidates require a clean Git worktree');
  return { commit };
}

function createStudioCandidateManifest({ baseline, targets, now, artifacts }) {
  return {
    schemaVersion: 2,
    status: 'unsigned-internal-candidate',
    generatedAt: now.toISOString(),
    source: { gitCommit: baseline.commit, worktreeClean: true },
    targets,
    evidenceLevel: {
      source: 'automated-regression-passed',
      packaged: 'built-pending-runtime-check',
      windowsInstalledMode: 'pending-external-return',
    },
    artifacts,
  };
}

function createStudioBuilderConfiguration({ outputDirectory, projectRoot, builderPackages, version = '0.1.0' }) {
  return {
    appId: 'com.jinke.desktop-pet.studio',
    productName: '桌宠制作台',
    asar: true,
    forceCodeSigning: false,
    publish: null,
    directories: { output: path.join(outputDirectory, 'artifacts') },
    extraMetadata: { name: 'desktop-pet-studio', version, main: 'src/workbench/main.js', private: true },
    files: [
      'package.json',
      'src/**/*',
      'config/**/*',
      'build/**/*',
      '.workbench-dist/**/*',
      '!**/.DS_Store', '!**/._*',
    ],
    extraResources: [
      ...builderPackages.map((entry) => ({ from: entry.sourceDirectory, to: `workbench-builder/${entry.relativePath}` })),
      { from: path.join(outputDirectory, 'workbench-build-package.json'), to: 'workbench-build-assets/package.json' },
      { from: path.join(projectRoot, 'src'), to: 'workbench-build-assets/src' },
      { from: path.join(projectRoot, 'build'), to: 'workbench-build-assets/build' },
    ],
    mac: { target: [{ target: 'dir', arch: ['arm64'] }], identity: null, category: 'public.app-category.developer-tools' },
    win: { target: [{ target: 'dir', arch: ['x64'] }, { target: 'nsis', arch: ['x64'] }], executableName: 'DesktopPetStudio' },
    nsis: {
      guid: '980c4302-3a05-517b-ba38-6c71a752ed15',
      artifactName: 'desktop-pet-studio-${version}-${arch}.${ext}',
      oneClick: false,
      perMachine: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      uninstallDisplayName: `桌宠制作台 ${version}`,
    },
  };
}

function buildStudioCandidate({ projectRoot, targets = ['mac'], now = new Date(), spawn = childProcess.spawnSync }) {
  if (!Array.isArray(targets) || targets.length === 0 || targets.some((target) => !['mac', 'win'].includes(target))) throw new Error('targets must contain mac or win');
  const root = path.resolve(projectRoot); const baseline = readGitBaseline({ projectRoot: root });
  const releaseRoot = path.join(root, 'release', 'workbench-candidates'); fs.mkdirSync(releaseRoot, { recursive: true });
  const runDirectory = path.join(releaseRoot, candidateId(now)); fs.mkdirSync(runDirectory);
  fs.copyFileSync(path.join(root, 'package.json'), path.join(runDirectory, 'workbench-build-package.json'), fs.constants.COPYFILE_EXCL);
  const builderPackages = collectBuilderRuntime({ projectRoot: root }).packages;
  const config = createStudioBuilderConfiguration({ outputDirectory: runDirectory, projectRoot: root, builderPackages });
  const configPath = path.join(runDirectory, 'build-config.json'); fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  const cli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
  const result = spawn(process.execPath, [cli, '--publish', 'never', '--config', configPath, ...targets.map((target) => `--${target}`)], { cwd: root, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_PUBLISH: 'never' }, encoding: 'utf8' });
  fs.writeFileSync(path.join(runDirectory, 'builder.log'), `${result.stdout || ''}${result.stderr || ''}`);
  if (result.status !== 0 || result.error) throw new Error(`workbench candidate build failed: ${runDirectory}`);
  const files = [];
  function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const item = path.join(directory, entry.name); if (entry.isDirectory()) walk(item); else if (entry.isFile() && (entry.name === 'app.asar' || /DesktopPetStudio|桌宠制作台/.test(entry.name) || entry.name.endsWith('.exe'))) files.push(item); } }
  walk(path.join(runDirectory, 'artifacts'));
  const manifest = createStudioCandidateManifest({
    baseline,
    targets,
    now,
    artifacts: files.map((file) => ({ path: path.relative(runDirectory, file).split(path.sep).join('/'), ...hashFile(file) })),
  });
  fs.writeFileSync(path.join(runDirectory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { runDirectory, manifest };
}

module.exports = {
  buildStudioCandidate,
  candidateId,
  createStudioBuilderConfiguration,
  createStudioCandidateManifest,
  readGitBaseline,
};
