const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RELEVANT_ENVIRONMENT = [
  'ELECTRON_SKIP_BINARY_DOWNLOAD',
  'ELECTRON_OVERRIDE_DIST_PATH',
  'ELECTRON_GET_USE_PROXY',
  'ELECTRON_MIRROR',
];

function selectedEnvironment(environment) {
  return Object.fromEntries(RELEVANT_ENVIRONMENT
    .filter((name) => environment[name])
    .map((name) => [name, environment[name]]));
}

function inspectElectronInstallation(projectRoot, environment = process.env) {
  const electronRoot = path.join(projectRoot, 'node_modules', 'electron');
  const pathFile = path.join(electronRoot, 'path.txt');
  if (!fs.existsSync(pathFile)) {
    return {
      environment: selectedEnvironment(environment),
      ok: false,
      reason: 'electron path metadata is missing',
    };
  }
  const executableName = fs.readFileSync(pathFile, 'utf8').trim();
  const distributionRoot = environment.ELECTRON_OVERRIDE_DIST_PATH
    || path.join(electronRoot, 'dist');
  const executablePath = path.join(distributionRoot, executableName);
  if (!executableName || !fs.existsSync(executablePath)) {
    return {
      environment: selectedEnvironment(environment),
      executablePath,
      ok: false,
      reason: 'electron executable is missing',
    };
  }
  return { executablePath, ok: true };
}

function runPreflight(projectRoot = PROJECT_ROOT, environment = process.env) {
  const result = inspectElectronInstallation(projectRoot, environment);
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = runPreflight();

module.exports = { inspectElectronInstallation, runPreflight };
