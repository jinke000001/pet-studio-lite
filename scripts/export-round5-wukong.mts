// 生成第五轮 Windows x64 候选 ZIP（小修复轮：状态写入竞态修复——单一内存
// 状态 + 串行原子写盘；关闭前 flush 待写位置——复位/拖动后立刻退出不丢位置；
// 气泡 box-sizing: border-box——小缩放下气泡总宽不越窗）。
// 与前几轮相同：直接使用「没有 license 的真实 Petdex Wukong WebP 包」
// （~/.petdex/pets/wukong-6），不修改 pet.json 一个字节 —— 导入时自动成为
// usageMode=internal-test，产物 distribution=internal-test-only。
// 走与制作台完全相同的导入 + 导出代码路径（validatePetPack → ProjectsStore →
// exportWindowsZip），非覆盖命名，不覆盖历史 ZIP。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePetPack } from '../src/shared/petpack';
import { sharpImageProbe } from '../src/main/image-probe';
import { ProjectsStore } from '../src/shared/projects';
import { exportWindowsZip } from '../src/main/export-win';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sha256File(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-export5-'));

  // 1. 真实来源：Petdex 安装的 wukong（无 license 字段，WebP 图集）。全程只读。
  const src = path.join(os.homedir(), '.petdex', 'pets', 'wukong-6');
  const srcJsonHash = await sha256File(path.join(src, 'pet.json'));
  console.log('源包 pet.json SHA-256（导出前）：', srcJsonHash);

  // 2. 与制作台一致的导入（复制进临时 studio-data，源目录绝不被修改）
  const store = new ProjectsStore(path.join(tmp, 'studio-data'));
  const validated = await validatePetPack(src, { probe: sharpImageProbe });
  if (!validated.ok) throw new Error('校验失败：' + validated.errors.join('；'));
  const meta = await store.importValidatedPack(validated.pack, { type: 'dir', path: src });
  console.log('导入成功：', meta.petId, meta.petdexVersion,
    `sourceLicense=${meta.license}`, `usageMode=${meta.usageMode}`, 'zoom=', meta.config.zoom);

  // 3. 与制作台一致的导出（不覆盖已有 ZIP，目标目录 deliverables/ 已被 gitignore）
  const outcome = await exportWindowsZip(meta, store.projectDir(meta.id), path.join(REPO, 'deliverables'), {
    repoRoot: REPO,
    productVersion: '0.1.0',
    onProgress: (phase, message) => console.log(`[${phase}] ${message}`),
  });
  console.log('EXPORT_OK', outcome.zipPath);
  console.log('EXPORT_SHA256', outcome.sha256);
  console.log('MANIFEST_DIST', outcome.manifest.distribution,
    `sourceLicense=${outcome.manifest.sourceLicense}`, `usageMode=${outcome.manifest.usageMode}`);

  // 4. 证明原始 pet.json 未被触碰
  const srcJsonHashAfter = await sha256File(path.join(src, 'pet.json'));
  console.log('源包 pet.json SHA-256（导出后）：', srcJsonHashAfter,
    srcJsonHash === srcJsonHashAfter ? '（未变）' : '（已变！）');
  if (srcJsonHash !== srcJsonHashAfter) throw new Error('原始 pet.json 被修改，违反只读约束');

  await fs.rm(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('EXPORT_FAIL', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
