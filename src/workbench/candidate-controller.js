const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const { inspectPackagedAsar } = require('../build/asar-inspector');
const { createBuilderConfiguration, createCandidateManifest } = require('../build/build-plan');
const { discoverCandidateArtifacts } = require('../build/build-runner');

function candidateError(code, message) { const error = new Error(message); error.code = code; return error; }

function recordCancelledRun(runDirectory) {
  for (const name of ['artifacts', 'generated']) fs.rmSync(path.join(runDirectory, name), { recursive: true, force: true });
  fs.writeFileSync(path.join(runDirectory, 'build-cancelled.json'), `${JSON.stringify({ status: 'cancelled', cancelledAt: new Date().toISOString(), cleaned: ['artifacts', 'generated'] }, null, 2)}\n`, { flag: 'wx' });
}

function runBuilder(command, options, context) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, options.args, options.spawnOptions);
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    context.setCancel(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function createCandidateController({
  store,
  applicationRoot,
  builderRoot = applicationRoot,
  buildAssetsRoot = applicationRoot,
  spawnBuilder = runBuilder,
  inspectAsar = inspectPackagedAsar,
  discoverArtifacts = discoverCandidateArtifacts,
  createManifest = createCandidateManifest,
  now = () => new Date(),
  randomHex = () => crypto.randomBytes(3).toString('hex'),
}) {
  async function build(projectId, input, context) {
    const project = store.loadProject(projectId);
    if (!project.product || !project.latestImport) throw candidateError('BUILD_NOT_READY', '请先完成成功导入和产品配置。');
    if (project.latestImport.authorizationStatus !== 'authorized') throw candidateError('DISTRIBUTION_NOT_AUTHORIZED', '当前素材不是 authorized；只能导出内部测试包，不能生成可分发候选。');
    const targets = Array.isArray(input?.targets) && input.targets.length ? input.targets : project.product.targets;
    if (!Array.isArray(targets) || targets.some((target) => !['mac', 'win'].includes(target)) || new Set(targets).size !== targets.length) throw candidateError('INVALID_BUILD_TARGET', '构建平台无效。');
    const packageArtifact = project.artifacts.find((artifact) => artifact.id === project.latestImport.artifactId);
    if (!packageArtifact) throw candidateError('BUILD_NOT_READY', '标准宠物包不存在。');
    const packageDirectory = store.resolveProjectPath(projectId, ...packageArtifact.relativePath.split('/'));
    const runId = `candidate-${now().toISOString().replace(/[-:.TZ]/g, '')}-${randomHex()}`;
    const runDirectory = store.resolveProjectPath(projectId, 'workspace', 'exports', runId);
    fs.mkdirSync(path.dirname(runDirectory), { recursive: true }); fs.mkdirSync(runDirectory);
    const generated = path.join(runDirectory, 'generated'); fs.mkdirSync(generated);
    const selector = 'workbench-project';
    const profile = { ...project.product, petPackagePath: 'local-pets/imported', build: { appId: project.product.appId, executableName: project.product.executableName, artifactName: project.product.artifactName, iconStrategy: 'electron-default-test', installScope: 'user' }, defaultScale: 0.75, messages: {} };
    const profileDirectory = path.join(generated, 'config', 'products');
    fs.mkdirSync(profileDirectory, { recursive: true });
    const profilePath = path.join(profileDirectory, `${selector}.json`);
    fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    const config = createBuilderConfiguration({ selector, profile, outputDirectory: runDirectory, targets });
    config.files = [
      { from: path.join(buildAssetsRoot, 'package.json'), to: 'package.json' },
      { from: path.join(buildAssetsRoot, 'src'), to: 'src' },
      { from: path.join(buildAssetsRoot, 'build'), to: 'build' },
      { from: path.join(generated, 'config'), to: 'config' },
      { from: packageDirectory, to: 'local-pets/imported' },
    ];
    const configPath = path.join(runDirectory, 'build-config.json'); fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    context.report(20, '装配单宠候选');
    const cli = path.join(builderRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
    const result = await spawnBuilder(process.execPath, { args: [cli, '--publish', 'never', '--config', configPath, ...targets.map((target) => `--${target}`)], spawnOptions: { cwd: buildAssetsRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_PUBLISH: 'never' }, stdio: ['ignore', 'pipe', 'pipe'] } }, context);
    fs.writeFileSync(path.join(runDirectory, 'builder.log'), `${result.stdout}${result.stderr}`);
    if (context.isCancelled()) { recordCancelledRun(runDirectory); throw candidateError('BUILD_CANCELLED', '候选构建已取消。'); }
    if (result.code !== 0) {
      fs.writeFileSync(path.join(runDirectory, 'build-failure.json'), `${JSON.stringify({ status: result.code, signal: result.signal || null }, null, 2)}\n`, { flag: 'wx' });
      throw candidateError('BUILD_FAILED', `候选构建失败，证据已保留：${runId}`);
    }
    context.report(85, '核对候选身份与哈希');
    const artifactPaths = discoverArtifacts(runDirectory);
    const asars = artifactPaths.filter((file) => path.basename(file) === 'app.asar').map((asarPath) => ({ path: path.relative(runDirectory, asarPath).replaceAll(path.sep, '/'), ...inspectAsar({ asarPath, selector }) }));
    const petManifest = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'pet.json'), 'utf8'));
    const manifest = createManifest({ runDirectory, profile, selector, targets, sourceAtlasPath: path.join(packageDirectory, petManifest.spritesheetPath), artifactPaths, packagedResources: asars, toolVersions: { node: process.versions.node, electron: process.versions.electron || 'external-node', electronBuilder: require(path.join(builderRoot, 'node_modules/electron-builder/package.json')).version } });
    fs.writeFileSync(path.join(runDirectory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const projectDirectory = path.dirname(store.resolveProjectPath(projectId, 'project.json'));
    const relativePath = path.relative(projectDirectory, runDirectory).replaceAll(path.sep, '/');
    const candidateArtifacts = targets.map((target) => ({ id: `${runId}-${target}`, kind: target === 'mac' ? 'macCandidate' : 'windowsCandidate', relativePath, createdAt: manifest.generatedAt, evidenceLevel: target === 'mac' ? 'packaged-runtime-unverified' : 'packaged-static-windows-installed-unverified' }));
    store.updateProject(projectId, (current) => ({ ...current, artifacts: [...current.artifacts, ...candidateArtifacts] }));
    return { artifactId: runId, evidenceLevel: manifest.acceptance };
  }
  return { build };
}

module.exports = { createCandidateController, recordCancelledRun };
