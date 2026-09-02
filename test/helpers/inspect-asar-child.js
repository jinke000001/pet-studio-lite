'use strict';
// Child probe: runs inspectPackagedAsar inside a real Electron process
// (ELECTRON_RUN_AS_NODE or packaged main), where Electron's asar fs patch is
// active, and prints the outcome.
const { inspectPackagedAsar } = require('../../src/build/asar-inspector');

try {
  const result = inspectPackagedAsar({ asarPath: process.argv[2], selector: 'sample' });
  process.stdout.write(`INSPECT_OK ${result.productId}\n`);
} catch (error) {
  process.stdout.write(`INSPECT_FAIL ${error.message}\n`);
  process.exitCode = 1;
}
