import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build, Platform, Arch } from 'electron-builder';
import { readRuntimeTemplate } from '../src/main/runtime-template';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (target !== 'win' && target !== 'win-zip' && target !== 'mac') throw new Error('Usage: package-studio <win|win-zip|mac> [output-directory]');
if (target === 'mac' && process.platform !== 'darwin') throw new Error('macOS builds must run on macOS');
if (target === 'win' && process.platform !== 'win32') throw new Error('Windows 安装程序请在 Windows 上构建；当前平台请运行 npm run package:win:zip');
const windows = target !== 'mac';
const platform = windows ? 'win32' : 'darwin';
const arch = windows ? 'x64' : process.arch;
if (arch !== 'arm64' && arch !== 'x64') throw new Error(`Unsupported architecture: ${arch}`);
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(process.argv[3] ?? path.join(root, 'deliverables', `studio-${pkg.version}-${target}-${arch}-${stamp}`));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output); // Never overwrite an existing candidate.
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-package-'));
try {
  await readRuntimeTemplate(path.join(root, 'build-resources/runtime-template/win-x64.zip'), root, pkg.version);
  await fs.cp(path.join(root, 'out'), path.join(stage, 'out'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(root, file), path.join(stage, file));
  // Install only target-platform runtime dependencies into an isolated app directory.
  // Do not mutate the developer's node_modules when producing another platform.
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run packaging through npm run package:win or npm run package:mac');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', `--os=${platform}`, `--cpu=${arch}`], {
      cwd: stage, stdio: 'inherit', shell: false,
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Target dependency installation failed: ${code}`)));
  });
  const nativeModule = path.join(stage, `node_modules/@img/sharp-${platform}-${arch}/package.json`);
  await fs.access(nativeModule);
  const artifacts = await build({
    projectDir: root,
    targets: (windows ? Platform.WINDOWS : Platform.MAC).createTarget(target === 'win' ? ['nsis', 'zip'] : target === 'win-zip' ? ['zip'] : ['dmg'], arch === 'x64' ? Arch.x64 : Arch.arm64),
    config: {
      extends: path.join(root, 'electron-builder.yml'),
      directories: { app: stage, output: path.join(stage, 'dist'), buildResources: path.join(root, 'build-resources') },
      extraResources: [{ from: path.join(root, 'build-resources/runtime-template'), to: 'runtime-template', filter: ['win-x64.zip', 'win-x64.zip.json'] }],
      npmRebuild: false,
      electronVersion: JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version,
      win: { artifactName: '${productName}-${version}-${arch}.${ext}' },
      publish: null,
    }, publish: 'never',
  });
  const files = [];
  for (const file of artifacts) {
    if (file.endsWith('.blockmap')) continue;
    const name = path.basename(file);
    const destination = path.join(output, name);
    await fs.copyFile(file, destination, fs.constants.COPYFILE_EXCL);
    files.push({ file: name, sha256: crypto.createHash('sha256').update(await fs.readFile(destination)).digest('hex') });
  }
  await fs.writeFile(path.join(output, 'candidate.json'), JSON.stringify({
    product: 'Pet Studio Lite', version: pkg.version, platform, arch,
    builtAt: new Date().toISOString(), files, nativeAcceptance: 'pending',
    installer: target === 'win-zip' ? 'requires-windows-build' : 'built',
  }, null, 2));
  console.log(`STUDIO_CANDIDATE ${output}`);
} catch (error) {
  await fs.writeFile(path.join(output, 'build-failed.txt'), String(error));
  throw error;
} finally {
  await fs.rm(stage, { recursive: true, force: true });
}
