#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { displaySnapshot, environmentFingerprint, platformResult, processSnapshot } = require('./lib/lab');

function writeEvidence(relativePath, value) {
  const root = process.env.TOOL_PREFLIGHT_EVIDENCE_ROOT || process.cwd();
  const target = path.resolve(root, relativePath); fs.mkdirSync(path.dirname(target), { recursive: true });
  if (Buffer.isBuffer(value)) fs.writeFileSync(target, value); else fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function main() {
  const operation = process.argv.includes('--operation') ? process.argv[process.argv.indexOf('--operation') + 1] : 'startup';
  const map = { startup: 'startup.json', button: 'button-operation.json', screenshot: 'screenshot.json', 'exit-cleanup': 'exit-cleanup.json' };
  if (!map[operation]) throw new Error(`unknown smoke operation: ${operation}`);
  if (operation === 'screenshot' && process.platform !== 'win32') {
    writeEvidence(map[operation], platformResult('screenshot')); return process.exitCode = 2;
  }
  const evidence = operation === 'exit-cleanup' ? { operation, environmentFingerprint: environmentFingerprint(), processSnapshot: processSnapshot() } : operation === 'button' ? { operation, status: process.platform === 'win32' ? 'probe-only' : 'platform-unavailable' } : { operation, status: process.platform === 'win32' ? 'probe-only' : 'platform-unavailable', display: displaySnapshot() };
  writeEvidence(map[operation], evidence);
  if (process.platform !== 'win32') process.exitCode = 2;
  if (operation === 'screenshot') process.exitCode = 2;
}
try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
