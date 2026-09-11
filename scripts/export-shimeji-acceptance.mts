import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { convertClassicShimejiDirectory } from '../src/main/classic-shimeji-import';
import { sharpImageProbe } from '../src/main/image-probe';
import { exportWindowsZip } from '../src/main/export-win';
import { validatePetPack } from '../src/shared/petpack';
import { ProjectsStore } from '../src/shared/projects';
import { appendToZip } from '../src/shared/zipw';
import { inspectZip, ZIP_LIMITS_RELAXED } from '../src/shared/zip';
import { ensureUtf8Bom } from '../src/shared/text-encoding';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shimeji-acceptance-export-'));
  try {
    const source = path.join(REPO, 'assets', 'fixtures', 'classic-shimeji-test');
    const converted = path.join(tempRoot, 'converted');
    await convertClassicShimejiDirectory(source, converted);
    const validated = await validatePetPack(converted, { probe: sharpImageProbe });
    if (!validated.ok) throw new Error(`测试宠物转换后校验失败：${validated.errors.join('；')}`);

    const store = new ProjectsStore(path.join(tempRoot, 'studio-data'));
    let meta = await store.importValidatedPack(validated.pack, { type: 'dir', path: source });
    meta = await store.updateConfig(meta.id, { petName: 'Shimeji 验收豆', zoom: 2, wanderEnabled: true });

    const outputDir = path.join(REPO, 'deliverables');
    await fs.mkdir(outputDir, { recursive: true });
    const outcome = await exportWindowsZip(meta, store.projectDir(meta.id), outputDir, {
      repoRoot: REPO,
      productVersion: '0.1.0-shimeji-test',
      onProgress: (phase, message) => console.log(`[${phase}] ${message}`),
    });

    const acceptanceScript = ensureUtf8Bom(
      await fs.readFile(path.join(REPO, 'scripts', 'windows-shimeji-acceptance.ps1')),
    );
    const acceptanceGuide = await fs.readFile(path.join(REPO, 'docs', 'acceptance', 'shimeji-windows.md'));
    const augmented = await appendToZip(await fs.readFile(outcome.zipPath), [
      { name: 'Windows统一验收.ps1', data: acceptanceScript, compress: false },
      { name: 'Shimeji-Windows-验收说明.md', data: acceptanceGuide, compress: false },
    ]);
    await fs.writeFile(outcome.zipPath, augmented);
    const names = inspectZip(augmented, ZIP_LIMITS_RELAXED).entries.map((entry) => entry.name);
    if (!names.includes('Windows统一验收.ps1') || !names.includes('Shimeji-Windows-验收说明.md')) {
      throw new Error('测试产物缺少 Windows 统一验收文件');
    }
    const sha256 = crypto.createHash('sha256').update(augmented).digest('hex');
    console.log('EXPORT_OK', outcome.zipPath);
    console.log('EXPORT_SHA256', sha256);
    console.log('MANIFEST_DIST', outcome.manifest.distribution);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('EXPORT_FAIL', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
