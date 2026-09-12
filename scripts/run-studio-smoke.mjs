import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

// Launch as an application, not a loose .cjs file: app.getVersion() must report
// the product version rather than Electron's version when exercising export.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const launcher = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-smoke-launcher-'));
try {
  await fs.writeFile(path.join(launcher, 'package.json'), JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    main: path.join(root, 'scripts/smoke-studio-workflow.cjs'),
  }));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [launcher], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  await fs.rm(launcher, { recursive: true, force: true });
}
