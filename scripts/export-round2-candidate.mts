// 生成第二轮 Windows x64 候选 ZIP：使用 wukong 的副本（加 internal-test 授权标记，
// 原始宠物包不修改），走与制作台完全相同的导入 + 导出代码路径。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePetPack } from '../src/shared/petpack';
import { sharpImageProbe } from '../src/main/image-probe';
import { ProjectsStore } from '../src/shared/projects';
import { exportWindowsZip } from '../src/main/export-win';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-export2-'));

  // 1. 复制 wukong 到临时目录并标记 internal-test（原始目录只读，不动）
  const src = '/Users/jinke00001/Desktop/pet/local-pets/wukong';
  const copy = path.join(tmp, 'wukong');
  await fs.mkdir(copy, { recursive: true });
  const petJson = JSON.parse(await fs.readFile(path.join(src, 'pet.json'), 'utf8'));
  petJson.license = 'internal-test';
  await fs.writeFile(path.join(copy, 'pet.json'), JSON.stringify(petJson, null, 2));
  await fs.copyFile(path.join(src, 'spritesheet.webp'), path.join(copy, 'spritesheet.webp'));

  // 2. 与制作台一致的导入
  const store = new ProjectsStore(path.join(tmp, 'studio-data'));
  const validated = await validatePetPack(copy, { probe: sharpImageProbe });
  if (!validated.ok) throw new Error('校验失败：' + validated.errors.join('；'));
  const meta = await store.importValidatedPack(validated.pack, { type: 'dir', path: copy });
  console.log('导入成功：', meta.petId, meta.petdexVersion, 'zoom=', meta.config.zoom);

  // 3. 与制作台一致的导出
  const outcome = await exportWindowsZip(meta, store.projectDir(meta.id), path.join(REPO, 'deliverables'), {
    repoRoot: REPO,
    productVersion: '0.1.0',
    onProgress: (phase, message) => console.log(`[${phase}] ${message}`),
  });
  console.log('EXPORT_OK', outcome.zipPath);
  console.log('EXPORT_SHA256', outcome.sha256);

  await fs.rm(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('EXPORT_FAIL', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
