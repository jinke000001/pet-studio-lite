import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ProjectMeta } from '../shared/types';
import type { PetRuntimeConfig } from '../shared/config';
import { buildManifest, distributionNote, type ExportManifest } from '../shared/manifest';
import { appendToZip } from '../shared/zipw';
import { inspectZip, ZIP_LIMITS_RELAXED } from '../shared/zip';

/**
 * Windows x64 便携 ZIP 导出编排。
 *
 * 流程：准备导出临时目录（宠物运行时构建产物 + 宠物包副本 +
 * manifest + 启动说明）→ electron-builder 打 win zip → 把 manifest /
 * 启动说明并入 ZIP 顶层 → 复制到用户选择的目录（非覆盖命名）→
 * 静态核验 → 清理临时目录。产物性质由 resolveDistribution 决定：
 * 仅 authorized + general 生成 candidate，其余一律 internal-test-only。
 *
 * 任何一步失败都不留下"看似成功"的产物：临时目录整体删除，目标目录里
 * 只存在核验通过的最终 ZIP。
 */

export interface ExportDeps {
  repoRoot: string;
  productVersion: string;
  onProgress: (phase: string, message: string) => void;
}

export interface ExportOutcome {
  zipPath: string;
  sha256: string;
  manifest: ExportManifest;
}

export const PET_EXE_NAME = 'PetLitePet.exe';

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
    '  - 左键拖动：移动位置',
    '  - 单击：宠物回应你一句',
    '  - 右键：自动游走开关、缩放（小 125% / 中 150% / 大 200%（推荐））、回到屏幕右下角、关于、退出',
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
    } catch {
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

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`命令失败（exit ${code}）：${cmd} ${args.join(' ')}\n${out.slice(-2000)}`));
    });
  });
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
    // 2. 准备运行时构建产物（out-pet）
    deps.onProgress('prepare', '准备宠物运行时…');
    const outPet = path.join(deps.repoRoot, 'out-pet');
    try {
      await fs.stat(path.join(outPet, 'main', 'main.js'));
    } catch {
      deps.onProgress('prepare', '首次导出需要构建桌宠运行时（一次性）…');
      await run('npm', ['run', 'build:pet'], deps.repoRoot);
    }

    // 3. 组装 app 目录
    const appDir = path.join(staging, 'app');
    await fs.mkdir(appDir, { recursive: true });
    await fs.cp(outPet, appDir, { recursive: true });
    await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
      name: 'pet-lite-pet',
      version: deps.productVersion,
      description: 'Pet Studio Lite 导出的独立桌宠',
      main: 'main/main.js',
      private: true,
    }, null, 2), 'utf8');

    // 4. 宠物包副本 + manifest + 启动说明
    const extraDir = path.join(staging, 'extra');
    const packDir = path.join(extraDir, 'petpack');
    await fs.mkdir(packDir, { recursive: true });
    await fs.copyFile(path.join(projectDir, 'pet.json'), path.join(packDir, 'pet.json'));
    await fs.copyFile(path.join(projectDir, meta.spritesheetFile), path.join(packDir, meta.spritesheetFile));
    const configForRuntime = buildRuntimeConfig(meta.config);
    await fs.writeFile(path.join(packDir, 'config.json'), JSON.stringify(configForRuntime, null, 2), 'utf8');

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

    // 5. electron-builder 打 win x64 zip
    deps.onProgress('build-runtime', '打包 Windows 运行时（首次需下载 Electron 运行时，可能较慢）…');
    const builderConfig = {
      appId: 'com.petstudio.lite.pet',
      productName: 'PetLitePet',
      directories: { app: appDir, output: path.join(staging, 'dist') },
      files: ['**/*'],
      asar: false,
      // 只保留中英文 locale 资源（运行时 UI 文案是内置中文，其余 ~50 个
      // locale 是纯死重）。不改运行时、不引入在线依赖。
      electronLanguages: ['en-US', 'zh-CN'],
      win: { target: [{ target: 'zip', arch: ['x64'] }] },
      artifactName: 'petlite-pet-win-x64.${ext}',
      extraResources: [
        { from: path.join(extraDir, 'petpack'), to: 'petpack' },
        { from: path.join(extraDir, 'manifest.json'), to: 'manifest.json' },
      ],
      electronDownload: { mirror: process.env['ELECTRON_MIRROR'] ?? undefined },
      publish: null,
    };
    const builderConfigPath = path.join(staging, 'builder.json');
    await fs.writeFile(builderConfigPath, JSON.stringify(builderConfig, null, 2), 'utf8');
    // 用系统 node 跑 electron-builder（制作台由 npm 启动，node 必在 PATH）。
    // 不能用 process.execPath —— 那是 Electron 二进制，会把参数解析搞乱。
    await run(
      process.env['npm_node_execpath'] ?? 'node',
      [path.join(deps.repoRoot, 'node_modules', 'electron-builder', 'cli.js'), '--win', 'zip', '--x64', '--config', builderConfigPath],
      deps.repoRoot,
    );

    // 6. 把 manifest / 启动说明并入 ZIP 顶层
    deps.onProgress('assemble', '写入启动说明与 manifest…');
    const distDir = path.join(staging, 'dist');
    const zips = (await fs.readdir(distDir)).filter((f) => f.endsWith('.zip'));
    if (zips.length !== 1) throw new Error(`打包产物异常：dist 里应有且仅有一个 ZIP（实际 ${zips.length} 个）`);
    const builtZip = path.join(distDir, zips[0]!);
    const merged = await appendToZip(await fs.readFile(builtZip), [
      { name: '启动说明.txt', data: Buffer.from(readmeText(meta, manifest), 'utf8'), compress: false },
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), compress: false },
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
    const manifestEntry = entries.find((e) => e.name === 'manifest.json')!;
    void manifestEntry;

    // 8. 非覆盖复制到目标目录
    const baseName = `petlite-pet-${meta.slug}-win-x64-${timestampSlug()}`;
    const finalPath = await reserveOutputPath(outputDir, baseName);
    await fs.copyFile(builtZip, finalPath);
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(finalPath)).digest('hex');

    deps.onProgress('done', '导出完成');
    return { zipPath: finalPath, sha256, manifest };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
