const path = require('node:path');
const { spawn } = require('node:child_process');

const electronPath = require('electron');
const { resolveProductProfile } = require('../src/core/profile-selector');

const projectRoot = path.resolve(__dirname, '..');
const product = process.argv[2] || 'wukong';

try {
  resolveProductProfile(projectRoot, product);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
  return;
}

const child = spawn(electronPath, ['.'], {
  cwd: projectRoot,
  env: { ...process.env, PET_PRODUCT: product },
  stdio: 'inherit',
});

child.on('error', (error) => {
  process.stderr.write(`Unable to start ${product}: ${error.message}\n`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
