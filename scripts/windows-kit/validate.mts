import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { validatePetPack } from '../../src/shared/petpack';
import { validatePetConfig } from '../../src/shared/config';
import { packFingerprint } from '../../src/shared/projects';
import { resolveDistribution } from '../../src/shared/manifest';

const hash = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
export async function inspectDelivery(root: string, copyTo?: string) {
  const files: { path: string; sha256: string; size: number }[] = [];
  // Only runtime directories; existing acceptance evidence is never copied or edited.
  async function visit(relative: string) {
    const absolute = path.join(root, relative);
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`不接受符号链接/reparse point: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) await visit(path.join(relative, name));
    } else if (stat.isFile()) {
      const bytes = await fs.readFile(absolute);
      files.push({ path: relative.split(path.sep).join('/'), sha256: hash(bytes), size: bytes.length });
      if (copyTo) {
        const destination = path.join(copyTo, relative);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes, { flag: 'wx' });
      }
    } else throw new Error(`不是普通文件: ${relative}`);
  }
  for (const name of (await fs.readdir(root)).sort()) {
    if (['resources', 'locales'].includes(name) || /\.(exe|dll|pak|bin|dat|json)$/i.test(name)) await visit(name);
  }
  const required = ['PetLitePet.exe', 'runtime-integrity.json', 'manifest.json', 'resources/manifest.json',
    'resources/app/package.json', 'resources/app/main/main.js', 'resources/app/preload/petwin.js',
    'resources/app/preload/sizeControl.js', 'resources/app/renderer/pet.html', 'resources/app/renderer/size-control.html',
    'resources/petpack/pet.json', 'resources/petpack/config.json', 'icudtl.dat', 'resources.pak',
    'chrome_100_percent.pak', 'chrome_200_percent.pak', 'v8_context_snapshot.bin', 'libEGL.dll', 'libGLESv2.dll'];
  for (const name of required) if (!files.some(f => f.path === name && f.size > 0)) throw new Error(`缺少交付文件: ${name}`);
  const verifiedRoot = copyTo ?? root;
  const read = (name: string) => fs.readFile(path.join(verifiedRoot, name));
  const json = async (name: string) => JSON.parse((await read(name)).toString('utf8'));
  const manifest = await json('manifest.json');
  const integrity = await json('runtime-integrity.json');
  const exe = files.find(f => f.path === 'PetLitePet.exe')!;
  if (integrity.schemaVersion !== 1 || integrity.executable?.path !== exe.path || integrity.executable?.sha256 !== exe.sha256 || integrity.manifestSha256 !== hash(await read('manifest.json'))) throw new Error('EXE/manifest 指纹不匹配');
  if (!(await read('manifest.json')).equals(await read('resources/manifest.json'))) throw new Error('内外 manifest 不一致');
  const app = await json('resources/app/package.json');
  if (manifest.platform !== 'win32' || manifest.arch !== 'x64' || typeof manifest.productVersion !== 'string' || manifest.productVersion !== app.version) throw new Error('成品版本/平台不一致');
  const pack = await validatePetPack(path.join(verifiedRoot, 'resources/petpack'));
  if (!pack.ok) throw new Error(pack.errors.join('\n'));
  if (manifest.hashes?.petJsonSha256 !== pack.pack.hashes.petJson || manifest.hashes?.spritesheetSha256 !== pack.pack.hashes.spritesheet || manifest.source?.fingerprint !== packFingerprint(pack.pack.hashes)) throw new Error('素材哈希与 manifest 导入指纹不一致');
  if (manifest.pet?.id !== pack.pack.id || manifest.pet?.petdexVersion !== pack.pack.version || manifest.sourceLicense !== pack.pack.license || manifest.distribution !== resolveDistribution(pack.pack.license, manifest.usageMode)) throw new Error('宠物身份/授权记录不一致');
  const config = validatePetConfig(await json('resources/petpack/config.json'));
  if (!config.ok) throw new Error(config.errors.join('；'));
  // Asset URLs come from the actual packaged HTML, not a source-build filename list.
  for (const page of ['pet.html', 'size-control.html']) {
    const html = (await read(`resources/app/renderer/${page}`)).toString('utf8');
    for (const match of html.matchAll(/(?:src|href)=["']\.\/([^"']+)["']/g)) {
      const entry = path.posix.normalize(`resources/app/renderer/${match[1]}`);
      if (!entry.startsWith('resources/app/renderer/') || !files.some(f => f.path === entry && f.size > 0)) throw new Error(`页面资源缺失: ${entry}`);
    }
  }
  return { manifest, executableSha256: exe.sha256, files, treeSha256: hash(JSON.stringify(files)),
    materialValidation: '共享结构/配置规则与 SHA-256；全像素解码和真实显示由本轮人工显示项确认' };
}
if (process.argv[2] === '--inspect') {
  const [, , , source, destination, report] = process.argv;
  inspectDelivery(source!, destination || undefined).then(result => fs.writeFile(report!, JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  });
}
