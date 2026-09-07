#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRun, finalizeRun, pauseRun, recordGate, resumeRun } = require('./lib/gates');
const { environmentFingerprint } = require('./lib/lab');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'run-config.json'), 'utf8'));
function usage() { process.stdout.write('Usage: node acceptance-tools/run.js <create|record|pause|resume|finalize> ...\n'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create') process.stdout.write(`${JSON.stringify(createRun({ ...config.identity, environmentFingerprint: config.identity.environmentFingerprint || environmentFingerprint(), requiredGates: config.requiredGates, evidenceRoot: args[0] || config.evidenceRoot }), null, 2)}\n`);
  else if (command === 'record') process.stdout.write(`${JSON.stringify(recordGate(args[0], readJson(args[1])), null, 2)}\n`);
  else if (command === 'pause') process.stdout.write(`${JSON.stringify(pauseRun(args[0], { pauseReason: args[1], nextStep: args[2] }), null, 2)}\n`);
  else if (command === 'resume') process.stdout.write(`${JSON.stringify(resumeRun(args[0], readJson(args[1])), null, 2)}\n`);
  else if (command === 'finalize') process.stdout.write(`${JSON.stringify(finalizeRun(args[0], readJson(args[1])), null, 2)}\n`);
  else usage();
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
