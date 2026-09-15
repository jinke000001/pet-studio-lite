import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { ProjectMeta } from '../shared/types';
import { prepareExportPack } from './export-pack';
import { readRuntimeTemplate } from './runtime-template';
import { sharpImageProbe } from './image-probe';
import type { PetRuntimeConfig } from '../shared/config';
import { buildManifest, distributionNote, type ExportManifest } from '../shared/manifest';
import { appendToZip } from '../shared/zipw';
import { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED } from '../shared/zip';

/**
 * Windows x64 便携 ZIP 导出编排。
 *
 * 流程：准备导出临时目录（宠物运行时构建产物 + 宠物包副本 +
 * manifest + 启动说明）→ 读取随包校验的 Windows 运行时模板 → 把 manifest /
 * 启动说明并入 ZIP 顶层 → 复制到用户选择的目录（非覆盖命名）→
 * 静态核验 → 清理临时目录。产物性质由 resolveDistribution 决定：
 * 仅 authorized + general 生成 candidate，其余一律 internal-test-only。
 *
 * 任何一步失败都不留下"看似成功"的产物：临时目录整体删除，目标目录里
 * 只存在核验通过的最终 ZIP。
 */

export interface ExportDeps {
  repoRoot: string;
  runtimeTemplatePath?: string;
  productVersion: string;
  onProgress: (phase: string, message: string) => void;
}

export interface ExportOutcome {
  zipPath: string;
  sha256: string;
  manifest: ExportManifest;
}

export interface ArtifactIntegrity {
  schemaVersion: 1;
  executable: { path: string; sha256: string };
  manifestSha256: string;
}

export const PET_EXE_NAME = 'PetLitePet.exe';

export function buildArtifactIntegrity(
  executablePath: string,
  executableBytes: Buffer,
  manifestBytes: Buffer,
): ArtifactIntegrity {
  const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    schemaVersion: 1,
    executable: { path: executablePath, sha256: sha256(executableBytes) },
    manifestSha256: sha256(manifestBytes),
  };
}

/** 导出写入 resources/petpack/config.json 的运行时配置（与制作台配置同义）。 */
export function buildRuntimeConfig(config: PetRuntimeConfig): PetRuntimeConfig {
  return {
    petName: config.petName,
    zoom: config.zoom,
    wanderEnabled: config.wanderEnabled,
  };
}

function readmeText(meta: ProjectMeta, manifest: ExportManifest): string {
  const internalNote = manifest.distribution === 'internal-test-only'
    ? `\n注意：${distributionNote(manifest.sourceLicense, manifest.usageMode)}\n`
    : '';
  return [
    '===========================',
    '  Pet Studio Lite 桌宠包',
    '===========================',
    '',
    `宠物：${meta.displayName}（${meta.petdexVersion}）`,
    `导出时间：${manifest.exportedAt}`,
    `原包授权状态：${manifest.sourceLicense}　项目使用方式：${manifest.usageMode}　产物性质：${manifest.distribution}`,
    internalNote,
    '如何使用：',
    `  1. 解压本 ZIP 到任意目录（比如桌面）。`,
    `  2. 双击 ${PET_EXE_NAME} 即可运行桌宠。`,
    '  3. 不需要安装 Node.js、Python 或任何其他软件；不需要联网。',
    '',
    '桌宠操作：',
    '  - 左键拖动并松手：移动宠物',
    '  - 单击：宠物回应你一句',
    '  - 自动行为：闲置时等待、思考和左右游走',
    '  - 右键：自动游走、召唤分身（最多 8 只）、调整尺寸（100%–300%）、回到屏幕右下角、关闭单只或退出全部',
    '',
    'manifest.json 记录了本包的版本、来源哈希与授权状态。',
    '',
  ].join('\n');
}

/** 非覆盖命名：目标已存在时追加 -2、-3…。 */
export async function reserveOutputPath(dir: string, baseName: string): Promise<string> {
  let candidate = path.join(dir, `${baseName}.zip`);
  let n = 2;
  while (true) {
    try {
      await fs.stat(candidate);
      candidate = path.join(dir, `${baseName}-${n}.zip`);
      n++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return candidate;
    }
  }
}

function timestampSlug(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
}

export async function exportWindowsZip(
  meta: ProjectMeta,
  projectDir: string,
  outputDir: string,
  deps: ExportDeps,
): Promise<ExportOutcome> {
  // 授权不再阻止导出：未声明授权的原包按「个人／内部体验」处理，
  // 产物标记 internal-test-only（见 manifest.distribution / distributionNote）。
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-export-'));
  try {
    const extraDir = path.join(staging, 'extra');
    const packDir = path.join(extraDir, 'petpack');
    await prepareExportPack(meta, projectDir, packDir, sharpImageProbe);

    deps.onProgress('prepare', '校验内置 Windows 运行时…');
    const templatePath = deps.runtimeTemplatePath ?? path.join(deps.repoRoot, 'build-resources/runtime-template/win-x64.zip');
    const builtBytes = await readRuntimeTemplate(templatePath, deps.repoRoot, deps.productVersion);

    // 4. 宠物包副本 + manifest + 启动说明
    const manifest = buildManifest({
      productVersion: deps.productVersion,
      pet: {
        id: meta.petId,
        slug: meta.slug,
        displayName: meta.displayName,
        petdexVersion: meta.petdexVersion,
        declaredVersion: meta.declaredVersion,
      },
      studioProjectId: meta.id,
      source: meta.source,
      hashes: { petJsonSha256: meta.hashes.petJson, spritesheetSha256: meta.hashes.spritesheet },
      sourceLicense: meta.license,
      usageMode: meta.usageMode,
    });
    await fs.writeFile(path.join(extraDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(path.join(extraDir, '启动说明.txt'), readmeText(meta, manifest), 'utf8');

    deps.onProgress('build-runtime', '组装 Windows 桌宠…');
    const builtZip = path.join(staging, 'pet.zip');
    const builtEntries = inspectZip(builtBytes, ZIP_LIMITS_RELAXED).entries;
    const executableEntries = builtEntries.filter((entry) => entry.name === PET_EXE_NAME);
    if (executableEntries.length !== 1) {
      throw new Error(`产物核验失败：ZIP 顶层应有且仅有一个 ${PET_EXE_NAME}（实际 ${executableEntries.length} 个）`);
    }
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const executableBytes = await readZipEntry(builtBytes, executableEntries[0]!, ZIP_LIMITS_RELAXED);
    const artifactIntegrity = buildArtifactIntegrity(PET_EXE_NAME, executableBytes, manifestBytes);
    const integrityBytes = Buffer.from(JSON.stringify(artifactIntegrity, null, 2), 'utf8');
    const merged = await appendToZip(builtBytes, [
      { name: 'resources/manifest.json', data: manifestBytes, compress: false },
      ...await Promise.all(['pet.json', meta.spritesheetFile, 'config.json'].map(async name => ({
        name: `resources/petpack/${name}`, data: await fs.readFile(path.join(packDir, name)),
      }))),
      { name: '启动说明.txt', data: Buffer.from(readmeText(meta, manifest), 'utf8'), compress: false },
      { name: 'manifest.json', data: manifestBytes, compress: false },
      { name: 'runtime-integrity.json', data: integrityBytes, compress: false },
    ]);
    await fs.writeFile(builtZip, merged);

    // 7. 静态核验（放宽限制：产物内含 ~186MB 的 Electron EXE 是合法的）
    deps.onProgress('verify', '核验产物…');
    const { entries } = inspectZip(merged, ZIP_LIMITS_RELAXED);
    const names = entries.map((e) => e.name);
    if (!names.some((n) => n.endsWith(PET_EXE_NAME))) {
      throw new Error(`产物核验失败：ZIP 里找不到 ${PET_EXE_NAME}`);
    }
    if (!names.includes('manifest.json')) {
      throw new Error('产物核验失败：ZIP 顶层缺少 manifest.json');
    }
    if (!names.includes('runtime-integrity.json')) {
      throw new Error('产物核验失败：ZIP 顶层缺少 runtime-integrity.json');
    }
    const manifestEntry = entries.find((e) => e.name === 'manifest.json')!;
    void manifestEntry;

    // 8. 非覆盖复制到目标目录
    const baseName = `petlite-pet-${meta.slug}-win-x64-${timestampSlug()}`;
    const finalPath = await reserveOutputPath(outputDir, baseName);
    await fs.copyFile(builtZip, finalPath, fs.constants.COPYFILE_EXCL);
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(finalPath)).digest('hex');

    deps.onProgress('done', '导出完成');
    return { zipPath: finalPath, sha256, manifest };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
