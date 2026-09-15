import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { extractFile, listPackage } from '@electron/asar';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';
import { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED } from '../src/shared/zip';

const dir = path.resolve(process.argv[2] ?? '');
const identity = JSON.parse(await fs.readFile(path.join(dir, 'candidate.json'), 'utf8'));
assert.equal(identity.platform, 'win32');
const zipArtifact = identity.files.find((file: {file:string}) => file.file.endsWith('.zip'));
assert.ok(zipArtifact);
const bytes = await fs.readFile(path.join(dir, zipArtifact.file));
const sha = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');
assert.equal(sha(bytes), zipArtifact.sha256);
const entries = inspectZip(bytes, ZIP_LIMITS_RELAXED).entries;
const read = async (name:string) => {
  const entry = entries.find(e => e.name === name);
  assert.ok(entry, `Missing ${name}`);
  return readZipEntry(bytes, entry, ZIP_LIMITS_RELAXED);
};
const exe = await read('Pet Studio Lite.exe');
assert.equal(exe.readUInt16LE(exe.readUInt32LE(0x3c) + 4), 0x8664, 'x64 PE executable');
const versions = Resource.VersionInfo.fromEntries(NtExecutableResource.from(NtExecutable.from(exe)).entries);
assert.ok(versions.length);
for (const version of versions) for (const language of version.getAllLanguagesForStringValues()) {
  assert.equal(version.getStringValues(language).ProductName, 'Pet Studio Lite');
  assert.equal(version.getStringValues(language).ProductVersion, identity.version);
}
const native = entries.find(e => /sharp-win32-x64\/lib\/sharp-.*\.node$/.test(e.name));
assert.ok(native, 'Windows x64 sharp native addon shipped');
assert.ok(entries.some(e => e.name.endsWith('/lib/libvips-42.dll')));
assert.ok(!entries.some(e => /sharp-darwin/.test(e.name)), 'No Mac native addon in Windows bundle');
const template = await read('resources/runtime-template/win-x64.zip');
const templateIdentity = JSON.parse((await read('resources/runtime-template/win-x64.zip.json')).toString());
assert.equal(sha(template), templateIdentity.sha256);
assert.equal(templateIdentity.productVersion, identity.version);
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-package-check-'));
try {
  const asar = path.join(work, 'app.asar');
  await fs.writeFile(asar, await read('resources/app.asar'));
  const pkg = JSON.parse(extractFile(asar, 'package.json').toString());
  assert.equal(pkg.name, 'pet-studio-lite');
  assert.equal(pkg.version, identity.version);
  const files = listPackage(asar, { isPack: false });
  for (const file of ['/out/main/index.js', '/out/preload/studio.js', '/out/renderer/index.html']) assert.ok(files.includes(file), file);
  assert.ok(!files.some(file => file.startsWith('/node_modules/electron-builder/')));
  const main = extractFile(asar, 'out/main/index.js').toString();
  assert.ok(main.includes('runtime-template/win-x64.zip'));
  assert.ok(!main.includes('electron-builder/cli.js'));
} finally { await fs.rm(work, {recursive:true,force:true}); }
console.log(JSON.stringify({ status:'pass', checks:['artifact SHA-256','x64 PE','product metadata','Windows sharp and libvips','no Mac addon','embedded runtime hash/version','packaged entrypoints','no external builder'], zipSha256:sha(bytes), exeSha256:sha(exe), nativeExecution:'not-tested' }, null, 2));
