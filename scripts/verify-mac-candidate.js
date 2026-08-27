#!/usr/bin/env node

const path = require('node:path');

const { verifyMacCandidate } = require('../src/build/mac-verifier');

verifyMacCandidate({ projectRoot: path.resolve(__dirname, '..'), argv: process.argv.slice(2) })
  .then((result) => process.stdout.write(`${JSON.stringify({
    status: 'verified',
    runDirectory: result.runDirectory,
    productId: result.evidence.productId,
    petId: result.evidence.petId,
  }, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
