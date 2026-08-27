const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parseVerifyArguments(argv) {
  if (argv.length !== 2) throw new Error('run requires one --run value');
  if (argv[0] !== '--run') throw new Error(`Unknown argument: ${argv[0]}`);
  const runPath = argv[1]?.replaceAll('\\', '/');
  if (!runPath || path.isAbsolute(runPath) || runPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('run must be a safe project-relative path');
  }
  return { runPath };
}

function containsRuntimeEvidence(logText, productId, petId) {
  return logText.includes(`renderer-ready product=${productId} pet=${petId}`)
    && logText.includes(`runtime-ready product=${productId} pet=${petId}`)
    && logText.includes('app.asar/src/renderer.js');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readNewLog(logPath, initialSize) {
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath).subarray(initialSize).toString('utf8');
}

async function verifyMacCandidate({ projectRoot, argv, timeoutMs = 15000, spawn = childProcess.spawn }) {
  if (process.platform !== 'darwin') throw new Error('macOS candidate verification must run on macOS');
  const request = parseVerifyArguments(argv);
  const runDirectory = path.resolve(projectRoot, request.runPath);
  const manifestPath = path.join(runDirectory, 'candidate-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const executableArtifact = manifest.artifacts.find((artifact) => /\.app\/Contents\/MacOS\/[^/]+$/.test(artifact.path));
  if (!executableArtifact) throw new Error('candidate manifest has no macOS application executable');
  const petId = manifest.packagedResources?.[0]?.petId;
  if (!petId) throw new Error('candidate manifest has no packaged pet identity');
  const executablePath = path.join(runDirectory, executableArtifact.path);
  const logPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'DesktopPetWorkflow',
    manifest.product.productId,
    'app.log',
  );
  const initialSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const startedAt = new Date().toISOString();
  const child = spawn(executablePath, [], { cwd: projectRoot, env: process.env, stdio: 'ignore' });
  const deadline = Date.now() + timeoutMs;
  let newLog = '';
  while (Date.now() < deadline) {
    await wait(250);
    newLog = readNewLog(logPath, initialSize);
    if (containsRuntimeEvidence(newLog, manifest.product.productId, petId)) break;
    if (child.exitCode !== null) break;
  }
  const passed = containsRuntimeEvidence(newLog, manifest.product.productId, petId);
  if (child.exitCode === null) child.kill('SIGTERM');
  await wait(500);
  const evidence = {
    platform: process.platform,
    architecture: process.arch,
    startedAt,
    finishedAt: new Date().toISOString(),
    productId: manifest.product.productId,
    petId,
    executable: executableArtifact.path,
    passed,
    evidence: passed ? ['packaged renderer-ready', 'packaged runtime-ready'] : [],
    logExcerpt: newLog.trim().split('\n').filter((line) => line.includes(manifest.product.productId)).slice(-10),
  };
  const evidencePath = path.join(runDirectory, 'macos-runtime-verification.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (!passed) throw new Error(`macOS packaged candidate did not become ready; evidence kept at ${evidencePath}`);
  manifest.acceptance.macOS = {
    packagedApp: 'runtime-verified',
    architecture: process.arch,
    evidence: 'macos-runtime-verification.json',
  };
  const temporaryManifestPath = `${manifestPath}.tmp`;
  fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temporaryManifestPath, manifestPath);
  return { runDirectory, evidence };
}

module.exports = { containsRuntimeEvidence, parseVerifyArguments, verifyMacCandidate };
