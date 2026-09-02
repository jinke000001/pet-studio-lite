'use strict';
// electron-builder CLI launcher for workbench candidate builds.
//
// The workbench runs inside Electron, so candidate builds spawn the Electron
// binary with ELECTRON_RUN_AS_NODE=1 instead of relying on a system Node.
// yargs@17 hideBin() decides how many argv entries to skip from the process
// shape: when process.versions.electron is set and process.defaultApp is not
// — the exact shape of an ELECTRON_RUN_AS_NODE child — it strips only
// argv[0], as if this were a bundled Electron app. A plain
// [execPath, cli, ...args] argv would then keep the cli path as a bogus
// positional and electron-builder aborts with "Unknown argument: .../cli.js".
// This launcher rewrites process.argv so yargs' slice leaves exactly the
// builder arguments, then loads the controlled electron-builder cli entry.

const path = require('node:path');

const BUILDER_ROOT_ENV = 'DESKTOP_PET_BUILDER_ROOT';
const CLI_SEGMENTS = ['node_modules', 'electron-builder', 'out', 'cli', 'cli.js'];

function expectedCliPath(builderRoot) {
  return path.join(path.resolve(builderRoot), ...CLI_SEGMENTS);
}

// Mirrors yargs@17 hideBin(): bundled-Electron-shaped processes skip one argv
// entry, plain Node processes skip two (execPath + script path). Kept pure for
// tests; the integration tests pin it against the real Electron binary and the
// real yargs singleton.
function normalizeBuilderArgv({ execPath, cliPath, args, electron, defaultApp }) {
  const skip = electron && !defaultApp ? 1 : 2;
  return skip === 1 ? [execPath, ...args] : [execPath, cliPath, ...args];
}

function launch(argv, env) {
  const builderRoot = env[BUILDER_ROOT_ENV];
  if (!builderRoot || !path.isAbsolute(builderRoot)) {
    throw new Error(`${BUILDER_ROOT_ENV} must be the absolute controlled builder root`);
  }
  const [cliPath, ...args] = argv.slice(2);
  if (!cliPath) throw new Error('missing electron-builder cli path');
  const expected = expectedCliPath(builderRoot);
  if (path.resolve(cliPath) !== expected) {
    throw new Error(`electron-builder cli must be the controlled entry inside the builder root: ${expected}`);
  }
  process.argv = normalizeBuilderArgv({
    execPath: argv[0],
    cliPath: expected,
    args,
    electron: Boolean(process.versions.electron),
    defaultApp: process.defaultApp,
  });
  require(expected);
}

if (require.main === module) {
  try {
    launch(process.argv, process.env);
  } catch (error) {
    process.stderr.write(`builder-launcher: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { BUILDER_ROOT_ENV, expectedCliPath, launch, normalizeBuilderArgv };
