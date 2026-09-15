import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, Platform, Arch } from 'electron-builder';
import { runtimeSourceHash, readRuntimeTemplate } from '../src/main/runtime-template';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const destination = path.join(root, 'build-resources/runtime-template/win-x64.zip');
const sourceSha256 = await runtimeSourceHash(root);
try {
  await readRuntimeTemplate(destination, root, pkg.version);
  console.log('RUNTIME_TEMPLATE_CURRENT');
} catch {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-template-'));
  try {
    const appDir = path.join(work, 'app');
    await fs.cp(path.join(root, 'out-pet'), appDir, { recursive: true });
    await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
      name: 'pet-lite-pet', version: pkg.version, main: 'main/main.js', private: true,
      description: 'Pet Studio Lite exported pet runtime', author: 'Pet Studio',
    }));
    const artifacts = await build({
      targets: Platform.WINDOWS.createTarget(['zip'], Arch.x64),
      projectDir: work,
      config: {
        appId: 'com.petstudio.lite.pet', productName: 'PetLitePet', electronVersion,
        directories: { app: appDir, output: path.join(work, 'dist') },
        files: ['**/*'], asar: false, npmRebuild: false,
        electronLanguages: ['en-US', 'zh-CN'],
        win: { target: ['zip'], signAndEditExecutable: false },
        afterPack: path.join(root, 'scripts/after-pack.cjs'), artifactName: 'runtime-template.${ext}',
        electronDownload: { mirror: process.env.ELECTRON_MIRROR }, publish: null,
      },
      publish: 'never',
    });
    const built = artifacts.find(file => file.endsWith('.zip'));
    if (!built) throw new Error('Windows runtime template ZIP was not produced');
    const bytes = await fs.readFile(built);
    const metadata = {
      schemaVersion: 1, platform: 'win32', arch: 'x64', productVersion: pkg.version,
      electronVersion, sourceSha256, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
    // Validate the staged pair before replacing only this generated build cache.
    const staged = path.join(work, 'verified.zip');
    await fs.writeFile(staged, bytes);
    await fs.writeFile(staged + '.json', JSON.stringify(metadata, null, 2));
    await readRuntimeTemplate(staged, root, pkg.version);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(staged, destination);
    await fs.copyFile(staged + '.json', destination + '.json');
    console.log(`RUNTIME_TEMPLATE_READY ${metadata.sha256}`);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
