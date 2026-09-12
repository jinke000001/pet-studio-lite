import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparePetRuntime } from '../src/main/prepare-pet-runtime';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-runtime-build-'));
try {
  const entry = path.join(root, 'out-pet/main/main.js');
  await fs.mkdir(path.dirname(entry), { recursive: true });
  await fs.writeFile(entry, 'old runtime');
  let builds = 0;
  const build = async () => { builds++; await fs.writeFile(entry, 'fresh runtime'); };
  await preparePetRuntime(root, build);
  assert.equal(builds, 0, 'Packaged workbench uses its shipped runtime without npm');
  await fs.mkdir(path.join(root, 'src/pet'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/pet/main.ts'), 'changed source');
  await preparePetRuntime(root, build);
  assert.equal(builds, 1, 'Source workbench rebuilds even if an old runtime exists');
  assert.equal(await fs.readFile(entry, 'utf8'), 'fresh runtime');
  await assert.rejects(preparePetRuntime(root, async () => { throw new Error('broken build'); }), /broken build/);
  await fs.rm(entry);
  await assert.rejects(preparePetRuntime(root, async () => {}), /运行时/);
  await fs.rm(path.join(root, 'src'), { recursive: true });
  await assert.rejects(preparePetRuntime(root, build), /运行时/);
  assert.equal(builds, 1, 'An incomplete packaged workbench does not try to run npm');
  console.log('PASS: source rebuild, packaged runtime, failed build and missing output');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
