import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectDelivery } from './windows-kit/validate.mts';
import { validatePetPack } from '../src/shared/petpack';
import { buildManifest } from '../src/shared/manifest';
import { packFingerprint } from '../src/shared/projects';
import { DEFAULT_PET_CONFIG } from '../src/shared/config';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-fixture-'));
const hash = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
try {
  const product = path.join(root, '交付 成品');
  async function write(name: string, data: string | Buffer) {
    await fs.mkdir(path.dirname(path.join(product, name)), { recursive: true });
    await fs.writeFile(path.join(product, name), data);
  }
  const fixture = path.join(repo, 'assets/fixtures/pack-v2');
  const checked = await validatePetPack(fixture); assert.ok(checked.ok);
  await fs.cp(fixture, path.join(product, 'resources/petpack'), { recursive: true });
  await write('resources/petpack/config.json', JSON.stringify(DEFAULT_PET_CONFIG));
  const manifest = buildManifest({ productVersion: '0.1.0', pet: { id: checked.pack.id, slug: checked.pack.slug, displayName: checked.pack.displayName, petdexVersion: checked.pack.version, declaredVersion: checked.pack.declaredVersion }, studioProjectId: 'test', source: { type: 'dir', fingerprint: packFingerprint(checked.pack.hashes) }, hashes: { petJsonSha256: checked.pack.hashes.petJson, spritesheetSha256: checked.pack.hashes.spritesheet }, sourceLicense: checked.pack.license, usageMode: 'internal-test' });
  const text = JSON.stringify(manifest);
  await write('manifest.json', text); await write('resources/manifest.json', text);
  await write('PetLitePet.exe', 'independent test fixture; never executable');
  await write('runtime-integrity.json', JSON.stringify({ schemaVersion: 1, executable: { path: 'PetLitePet.exe', sha256: hash('independent test fixture; never executable') }, manifestSha256: hash(text) }));
  await write('resources/app/package.json', JSON.stringify({ version: '0.1.0' }));
  for (const file of ['resources/app/main/main.js', 'resources/app/preload/petwin.js', 'resources/app/preload/sizeControl.js', 'resources/app/renderer/assets/pet.js', 'icudtl.dat', 'resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'v8_context_snapshot.bin', 'libEGL.dll', 'libGLESv2.dll']) await write(file, 'fixture');
  for (const page of ['pet.html','size-control.html']) await write(`resources/app/renderer/${page}`, '<script src="./assets/pet.js"></script>');
  const good = await inspectDelivery(product, path.join(root, 'isolated-copy'));
  assert.equal(good.manifest.productVersion, '0.1.0'); assert.equal(good.treeSha256.length, 64);
  assert.ok(good.files.some(file => file.path === 'resources/petpack/config.json'));
  assert.equal((await inspectDelivery(product)).treeSha256, good.treeSha256);
  await write('resources/petpack/config.json', '{"wanderEnabled":"bad"}');
  await assert.rejects(inspectDelivery(product), /游走|名字|配置/);
  await write('resources/petpack/config.json', JSON.stringify(DEFAULT_PET_CONFIG));
  await fs.appendFile(path.join(product, 'resources/petpack/pet.json'), '\n');
  await assert.rejects(inspectDelivery(product), /素材哈希/);
  await fs.copyFile(path.join(fixture, 'pet.json'), path.join(product, 'resources/petpack/pet.json'));
  await fs.unlink(path.join(product, 'resources/app/renderer/assets/pet.js'));
  await assert.rejects(inspectDelivery(product), /页面资源缺失/);
  await write('resources/app/renderer/assets/pet.js', 'fixture');
  await write('resources/app/package.json', '{"version":"9.9.9"}');
  await assert.rejects(inspectDelivery(product), /版本/);
  await write('resources/app/package.json', '{"version":"0.1.0"}');
  await fs.symlink(fixture, path.join(product, 'resources', 'external'), 'junction');
  await assert.rejects(inspectDelivery(product), /符号链接/);
  await fs.unlink(path.join(product, 'resources/external'));
  await fs.unlink(path.join(product, 'libEGL.dll'));
  await assert.rejects(inspectDelivery(product), /缺少交付文件/);
  console.log('PASS: delivery/config/material regression, version, missing assets, links, independent copy and file fingerprints');
} finally { await fs.rm(root, { recursive: true, force: true }); }
