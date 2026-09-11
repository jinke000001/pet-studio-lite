import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_FILES = [
  'out-pet/main/main.js',
  'out-pet/preload/petwin.js',
  'out-pet/preload/sizeControl.js',
];
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const ALLOWED_EXTERNALS = new Set(['electron']);

export function findUnexpectedRuntimeRequires(source) {
  const unexpected = new Set();
  const requirePattern = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;
  for (const match of source.matchAll(requirePattern)) {
    const specifier = match[2];
    if (!specifier.startsWith('.') && !path.isAbsolute(specifier)
      && !BUILTINS.has(specifier) && !ALLOWED_EXTERNALS.has(specifier)) {
      unexpected.add(specifier);
    }
  }
  return [...unexpected].sort();
}

const failures = [];
for (const relativePath of RUNTIME_FILES) {
  const absolutePath = path.join(REPO, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: 文件不存在`);
    continue;
  }
  const unexpected = findUnexpectedRuntimeRequires(fs.readFileSync(absolutePath, 'utf8'));
  if (unexpected.length > 0) failures.push(`${relativePath}: ${unexpected.join(', ')}`);
}

if (failures.length > 0) {
  console.error('PET_RUNTIME_BUNDLE_FAIL');
  console.error('独立桌宠运行时仍引用未随包分发的外部模块：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PET_RUNTIME_BUNDLE_OK ${RUNTIME_FILES.length} files`);
