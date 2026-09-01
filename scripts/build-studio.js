#!/usr/bin/env node
const path = require('node:path');
const { buildStudioCandidate } = require('../src/workbench/candidate-builder');
try { const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['mac']; const result = buildStudioCandidate({ projectRoot: path.resolve(__dirname, '..'), targets }); process.stdout.write(`${JSON.stringify({ status: 'built', runDirectory: result.runDirectory }, null, 2)}\n`); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
