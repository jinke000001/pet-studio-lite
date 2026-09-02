'use strict';
// Reproduces electron-builder's packaging write pattern: the extracted
// Electron dist template already contains default_app.asar, and the builder
// opens a WriteStream over it. With Electron's asar patch active (the default
// in ELECTRON_RUN_AS_NODE children) that open fails with "Invalid package".
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-asar-probe-'));
const target = path.join(root, 'Electron.app', 'Contents', 'Resources', 'default_app.asar');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, 'not-a-real-asar');
const stream = fs.createWriteStream(target);
stream.on('error', (error) => {
  process.stdout.write(`WRITE_FAIL ${error.message}\n`);
  process.exitCode = 1;
});
stream.on('open', () => {
  stream.end('x', () => process.stdout.write('WRITE_OK\n'));
});
