const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  createBuilderConfiguration,
  createCandidateManifest,
  normalizeTargets,
  reserveBuildDirectory,
} = require('./build-plan');
const { loadRuntimeInputs } = require('../core/package-loader');
const { normalizeProductProfile } = require('../core/product-profile');
const { resolveProductProfile } = require('../core/profile-selector');
const { inspectWebp } = require('../core/webp-inspector');

function safeRelativeOutput(value) {
  const candidate = value.replaceAll('\\', '/');
  if (path.isAbsolute(candidate) || candidate.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('output must be a safe project-relative path');
  }
  return candidate;
}

function parseBuildArguments(argv) {
  const values = { targets: ['mac', 'win'], outputPath: 'release/candidates' };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag || 'product'} requires a value`);
    if (flag === '--product') values.selector = value;
    else if (flag === '--targets') values.targets = value.split(',');
    else if (flag === '--output') values.outputPath = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!values.selector || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.selector)) {
    throw new Error('product must use lowercase kebab-case');
  }
  values.targets = normalizeTargets(values.targets);
  values.outputPath = safeRelativeOutput(values.outputPath);
  return values;
}

function createBuilderCommand({ projectRoot, configPath, targets }) {
  const builderCli = path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
  return {
    executable: process.execPath,
    args: [builderCli, '--publish', 'never', '--config', configPath, ...targets.map((target) => `--${target}`)],
    environment: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_PUBLISH: 'never',
    },
  };
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function discoverCandidateArtifacts(runDirectory) {
  const root = path.resolve(runDirectory);
  return walkFiles(path.join(root, 'artifacts')).filter((filePath) => {
    const relativePath = path.relative(root, filePath).replaceAll(path.sep, '/');
    const parts = relativePath.split('/');
    if (parts.length === 2 && relativePath.endsWith('.exe')) return true;
    if (/^artifacts\/win-unpacked\/[^/]+\.exe$/.test(relativePath)) return true;
    if (relativePath.endsWith('/resources/app.asar') || relativePath.endsWith('/Resources/app.asar')) return true;
    return relativePath.includes('.app/Contents/MacOS/');
  });
}

function candidateRunId(now = new Date()) {
  return `candidate-${now.toISOString().replace(/[-:.TZ]/g, '').toLowerCase()}`;
}

function renderDeliveryReadme(manifest) {
  const artifactRows = manifest.artifacts.map((artifact) => `| \`${artifact.path}\` | ${artifact.size} | \`${artifact.sha256}\` |`).join('\n');
  return `# ${manifest.product.productName} ${manifest.product.version} 内部候选\n\n`
    + `- 状态：未签名内部候选，不是正式发布版。\n`
    + `- appId：\`${manifest.product.appId}\`\n`
    + `- 图标：Electron 默认测试图标，尚未经过产品确认。\n`
    + `- Windows：仅生成候选并做 Mac 侧静态核对；source、win-unpacked、installed mode 和 100%/125%/150% DPI 均需在 Windows 另行验收。\n`
    + `- SmartScreen：未签名 NSIS 安装包可能触发提示。\n\n`
    + `| 文件 | 字节 | SHA-256 |\n| --- | ---: | --- |\n${artifactRows}\n`;
}

function runProductBuild({ projectRoot, argv, spawn = childProcess.spawnSync, now = new Date() }) {
  const request = parseBuildArguments(argv);
  const profilePath = resolveProductProfile(projectRoot, request.selector);
  const profile = normalizeProductProfile(JSON.parse(fs.readFileSync(profilePath, 'utf8')));
  const runtime = loadRuntimeInputs({ projectRoot, profilePath, inspectAtlas: inspectWebp });
  const outputRoot = path.resolve(projectRoot, request.outputPath);
  const runDirectory = reserveBuildDirectory(outputRoot, profile, candidateRunId(now));
  const config = createBuilderConfiguration({
    selector: request.selector,
    profile,
    outputDirectory: runDirectory,
    targets: request.targets,
  });
  const configPath = path.join(runDirectory, 'build-config.json');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(runDirectory, 'build-request.json'), `${JSON.stringify({ ...request, runDirectory }, null, 2)}\n`);

  const command = createBuilderCommand({ projectRoot, configPath, targets: request.targets });
  const result = spawn(command.executable, command.args, {
    cwd: projectRoot,
    env: command.environment,
    encoding: 'utf8',
  });
  fs.writeFileSync(path.join(runDirectory, 'builder.log'), `${result.stdout || ''}${result.stderr || ''}`);
  if (result.error || result.status !== 0) {
    fs.writeFileSync(path.join(runDirectory, 'build-failure.json'), `${JSON.stringify({
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
    }, null, 2)}\n`);
    throw new Error(`electron-builder failed; evidence kept at ${runDirectory}`);
  }

  const artifactPaths = discoverCandidateArtifacts(runDirectory);
  if (artifactPaths.length === 0) throw new Error(`builder produced no candidate artifacts in ${runDirectory}`);
  const manifest = createCandidateManifest({
    runDirectory,
    profile,
    selector: request.selector,
    targets: request.targets,
    sourceAtlasPath: runtime.atlasPath,
    artifactPaths,
    toolVersions: {
      node: process.versions.node,
      electron: require(path.join(projectRoot, 'node_modules', 'electron', 'package.json')).version,
      electronBuilder: require(path.join(projectRoot, 'node_modules', 'electron-builder', 'package.json')).version,
    },
  });
  fs.writeFileSync(path.join(runDirectory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(runDirectory, 'DELIVERY.md'), renderDeliveryReadme(manifest));
  return { runDirectory, manifest };
}

module.exports = {
  candidateRunId,
  createBuilderCommand,
  discoverCandidateArtifacts,
  parseBuildArguments,
  renderDeliveryReadme,
  runProductBuild,
};
