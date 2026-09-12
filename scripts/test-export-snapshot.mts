import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectsStore } from '../src/shared/projects';
import { validatePetPack } from '../src/shared/petpack';
import { exportWindowsZip } from '../src/main/export-win';
import { prepareExportPack } from '../src/main/export-pack';
import { sharpImageProbe } from '../src/main/image-probe';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'export-regression-'));
try {
  const pack = await validatePetPack(path.join(repo, 'assets/fixtures/pack-v2'), { probe: sharpImageProbe });
  assert.ok(pack.ok);
  const store = new ProjectsStore(path.join(root, 'store'));
  const meta = await store.importValidatedPack(pack.pack, { type: 'dir', path: pack.pack.rootDir });
  const project = store.projectDir(meta.id);
  const json = await fs.readFile(path.join(project, 'pet.json'));
  await fs.appendFile(path.join(project, 'pet.json'), '\n');
  await assert.rejects(exportWindowsZip(meta, project, root, {
    repoRoot: path.join(root, 'no-build-tools'), productVersion: '0.1.0', onProgress() {},
  }), /素材.*变化|指纹|哈希/);
  await fs.writeFile(path.join(project, 'pet.json'), json);
  const snapshot = path.join(root, 'snapshot');
  await prepareExportPack(meta, project, snapshot, sharpImageProbe);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(snapshot, 'config.json'), 'utf8')), meta.config);
  assert.deepEqual(await fs.readFile(path.join(snapshot, 'pet.json')), json);
  await assert.rejects(prepareExportPack({ ...meta, config: { ...meta.config, petName: '' } }, project, path.join(root, 'bad-config'), sharpImageProbe));
  const sheetPath = path.join(project, meta.spritesheetFile);
  const sheet = await fs.readFile(sheetPath);
  await fs.writeFile(sheetPath, sheet.subarray(0, 40));
  await assert.rejects(prepareExportPack(meta, project, path.join(root, 'truncated'), sharpImageProbe), /解码|损坏|截断/);
  await fs.writeFile(sheetPath, sheet);
  await assert.rejects(prepareExportPack(meta, project, path.join(root, 'race'), async (file, head) => {
    const error = await sharpImageProbe(file, head);
    if (path.dirname(file) === await fs.realpath(project)) await fs.appendFile(path.join(project, 'pet.json'), '\n');
    return error;
  }), /哈希/);
  console.log('PASS: changed assets rejected before invoking build tools');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
