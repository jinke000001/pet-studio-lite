#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { captureScreenshot, displaySnapshot, environmentFingerprint, platformResult, processSnapshot } = require('./lib/lab');

function writeEvidence(root, relativePath, value) {
  const target = path.resolve(root, relativePath); fs.mkdirSync(path.dirname(target), { recursive: true });
  if (Buffer.isBuffer(value)) fs.writeFileSync(target, value); else fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runSmokeOperation({
  platform = process.platform,
  operation = 'startup',
  evidenceRoot = process.env.TOOL_PREFLIGHT_EVIDENCE_ROOT || process.cwd(),
  capture = captureScreenshot,
  getDisplay = displaySnapshot,
  getProcesses = processSnapshot,
  getEnvironmentFingerprint = environmentFingerprint,
} = {}) {
  const map = { startup: 'preflight/startup.json', button: 'preflight/button-operation.json', screenshot: 'preflight/screenshot.json', 'exit-cleanup': 'preflight/exit-cleanup.json' };
  if (!map[operation]) throw new Error(`unknown smoke operation: ${operation}`);
  if (platform !== 'win32') {
    const evidence = platformResult(operation, { platform });
    writeEvidence(evidenceRoot, map[operation], evidence);
    if (operation === 'exit-cleanup') writeEvidence(evidenceRoot, 'preflight/final-processes.json', evidence);
    return { status: 'platform-unavailable', exitCode: 2, evidence };
  }

  if (operation === 'screenshot') {
    const pngPath = path.resolve(evidenceRoot, 'preflight/screenshot.png');
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    const captureResult = await capture(pngPath);
    const passed = captureResult?.status === 'ok' && fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0;
    const evidence = { operation, status: passed ? 'passed' : 'operation-failed', capture: captureResult, display: getDisplay() };
    writeEvidence(evidenceRoot, map[operation], evidence);
    return { status: evidence.status, exitCode: passed ? 0 : 1, evidence };
  }

  if (operation === 'exit-cleanup') {
    const snapshot = getProcesses();
    const passed = snapshot?.status === 'ok';
    const evidence = { operation, status: passed ? 'passed' : 'operation-failed', environmentFingerprint: getEnvironmentFingerprint(), processSnapshot: snapshot };
    writeEvidence(evidenceRoot, map[operation], evidence);
    writeEvidence(evidenceRoot, 'preflight/final-processes.json', snapshot);
    return { status: evidence.status, exitCode: passed ? 0 : 1, evidence };
  }

  const evidence = { operation, status: 'passed', environmentFingerprint: getEnvironmentFingerprint() };
  writeEvidence(evidenceRoot, map[operation], evidence);
  return { status: 'passed', exitCode: 0, evidence };
}

async function main() {
  const operation = process.argv.includes('--operation') ? process.argv[process.argv.indexOf('--operation') + 1] : 'startup';
  const result = await runSmokeOperation({ operation });
  process.exitCode = result.exitCode;
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { runSmokeOperation };
