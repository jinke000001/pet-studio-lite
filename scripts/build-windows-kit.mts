import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createZip } from '../src/shared/zipw';
import { inspectZip, readZipEntry } from '../src/shared/zip';
import { ensureUtf8Bom } from '../src/shared/text-encoding';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await fs.mkdtemp(path.join(repo, 'deliverables', `windows-light-kit-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-`));
const files: { name: string; data: Buffer }[] = [];
for (const name of ['accept.ps1', 'core.ps1', 'native.ps1']) {
  files.push({ name, data: ensureUtf8Bom(await fs.readFile(path.join(repo, 'scripts/windows-kit', name))) });
}
const bundle = await build({ entryPoints: [path.join(repo, 'scripts/windows-kit/validate.mts')], bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false });
files.push({ name: 'validate.cjs', data: Buffer.from(bundle.outputFiles![0]!.contents) });
files.push({ name: 'README.md', data: Buffer.from(await fs.readFile(path.join(repo, 'docs/acceptance/windows-light-kit.md'), 'utf8')) });
for (const file of files) await fs.writeFile(path.join(output, file.name), file.data, { flag: 'wx' });
const bytes = createZip(files);
const entries = inspectZip(bytes).entries;
for (const file of files) {
  const entry = entries.find(e => e.name === file.name)!;
  if (!(await readZipEntry(bytes, entry)).equals(file.data)) throw new Error(`工具包核验失败: ${file.name}`);
}
await fs.writeFile(`${output}.zip`, bytes, { flag: 'wx' });
console.log('KIT', output);
console.log('ZIP', `${output}.zip`);
console.log('SHA256', crypto.createHash('sha256').update(bytes).digest('hex'));
