#!/usr/bin/env node
'use strict';

// Drives the installed product's real quit entry (petApi.quit → pet:quit →
// app.quit()) through the candidate's own Chromium remote-debugging endpoint
// and waits until the exact product process count reaches zero. The official
// uninstaller may only be started when this exits with code 0; any other exit
// code means the lifecycle failed and the uninstaller must never be started.
//
// Usage: node acceptance-tools/request-quit.js --cdp-port <port> --install-dir <dir> --executable-name <name> [--timeout-seconds 60]

const {
  QuitEntryError,
  createWindowsProductProcessEnumerator,
  requestProductQuit,
  runProductQuitLifecycle,
} = require('./lib/product-lifecycle');

function parseArgs(argv) {
  const options = { timeoutSeconds: 60 };
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1];
    if (argv[index] === '--cdp-port') options.cdpPort = Number(value);
    else if (argv[index] === '--install-dir') options.installDir = value;
    else if (argv[index] === '--executable-name') options.executableName = value;
    else if (argv[index] === '--timeout-seconds') options.timeoutSeconds = Number(value);
    else throw new QuitEntryError(`unknown argument: ${argv[index]}`, 'CONFIG');
  }
  if (!Number.isInteger(options.cdpPort) || options.cdpPort <= 0) throw new QuitEntryError('--cdp-port must be a positive integer', 'CONFIG');
  if (!options.installDir || !options.executableName) throw new QuitEntryError('--install-dir and --executable-name are required', 'CONFIG');
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0) throw new QuitEntryError('--timeout-seconds must be positive', 'CONFIG');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== 'win32') {
    process.stdout.write(`${JSON.stringify({ status: 'platform-unavailable', platform: process.platform, startUninstaller: false })}\n`);
    process.exitCode = 2;
    return;
  }
  const enumerate = createWindowsProductProcessEnumerator({ installDirectory: options.installDir, executableName: options.executableName });
  const result = await runProductQuitLifecycle({
    enumerate,
    requestQuit: () => requestProductQuit({ port: options.cdpPort, timeoutMs: Math.min(options.timeoutSeconds * 1000, 30000) }),
    timeoutMs: options.timeoutSeconds * 1000,
  });
  result.cdpPort = options.cdpPort;
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.startUninstaller ? 0 : 3;
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ status: 'lifecycle-failed', startUninstaller: false, requestError: { message: error.message, code: error.code || 'QUIT_DRIVER_ERROR' }, reason: `the quit driver itself failed; the official uninstaller was never started: ${error.message}` })}\n`);
    process.exitCode = error.code === 'CONFIG' ? 2 : 3;
  });
}

module.exports = { parseArgs };
