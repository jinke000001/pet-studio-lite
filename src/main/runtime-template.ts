import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectZip, ZIP_LIMITS_RELAXED } from '../shared/zip';

export const TEMPLATE_REQUIRED_FILES = [
  'PetLitePet.exe', 'resources/app/package.json', 'resources/app/main/main.js',
  'resources/app/preload/petwin.js', 'resources/app/preload/sizeControl.js',
  'resources/app/renderer/pet.html', 'resources/app/renderer/size-control.html',
  'icudtl.dat', 'resources.pak', 'v8_context_snapshot.bin',
];

/** Development exports must never silently use a template from older source. */
export async function runtimeSourceHash(root: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  async function visit(relative: string): Promise<void> {
    const full = path.join(root, relative);
    const stat = await fs.lstat(full);
    if (stat.isSymbolicLink()) throw new Error(`运行时源码不能是链接：${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(full)).sort()) await visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      hash.update(relative).update('\0').update(await fs.readFile(full)).update('\0');
    }
  }
  for (const entry of ['src', 'electron.vite.pet.config.ts', 'package.json', 'package-lock.json']) await visit(entry);
  return hash.digest('hex');
}

export async function readRuntimeTemplate(templatePath: string, repoRoot: string, version: string): Promise<Buffer> {
  let bytes: Buffer;
  let identity;
  try {
    [bytes, identity] = await Promise.all([
      fs.readFile(templatePath),
      fs.readFile(templatePath + '.json', 'utf8').then(JSON.parse),
    ]);
  } catch {
    throw new Error('Windows 运行时模板缺失或损坏，请重新安装完整工作台；源码模式请运行 npm run prepare:studio');
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (identity?.schemaVersion !== 1 || identity.platform !== 'win32' || identity.arch !== 'x64'
    || identity.productVersion !== version || identity.sha256 !== sha256) {
    throw new Error('Windows 运行时模板校验失败，请重新安装完整工作台；源码模式请运行 npm run prepare:studio');
  }
  const sourceExists = await fs.stat(path.join(repoRoot, 'src/pet/main.ts')).then(() => true, () => false);
  if (sourceExists && identity.sourceSha256 !== await runtimeSourceHash(repoRoot)) {
    throw new Error('运行时模板与当前源码不一致，请先运行 npm run prepare:studio 再导出');
  }
  const { entries } = inspectZip(bytes, ZIP_LIMITS_RELAXED);
  const names = new Set(entries.map(e => e.name));
  for (const name of TEMPLATE_REQUIRED_FILES) {
    if (!names.has(name)) throw new Error(`运行时模板不完整：缺少 ${name}`);
  }
  if (entries.some(e => e.name.startsWith('resources/petpack/') || e.name === 'manifest.json' || e.name === 'resources/manifest.json')) {
    throw new Error('运行时模板含有其他项目的数据，拒绝导出');
  }
  return bytes;
}
