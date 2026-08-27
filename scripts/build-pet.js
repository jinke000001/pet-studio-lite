#!/usr/bin/env node

const path = require('node:path');

const { runProductBuild } = require('../src/build/build-runner');

try {
  const result = runProductBuild({ projectRoot: path.resolve(__dirname, '..'), argv: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify({ status: 'built', runDirectory: result.runDirectory }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
