// 只更新已有 Windows 候选中的验收脚本与说明，不重建或覆盖原候选。
// 用法：npm run refresh:windows-acceptance -- <candidate.zip>

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWindowsEvidenceCandidate } from '../src/main/windows-evidence-verifier';
import { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED } from '../src/shared/zip';
import { appendToZip } from '../src/shared/zipw';
import { ensureCrLf, ensureUtf8Bom } from '../src/shared/text-encoding';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function timestamp(now = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`
    + `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

async function writeNonOverwriting(sourcePath: string, bytes: Buffer): Promise<string> {
  const parsed = path.parse(sourcePath);
  const base = `${parsed.name}-evidence-v3-${timestamp()}`;
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const filename = suffix === 1 ? `${base}.zip` : `${base}-${suffix}.zip`;
    const outputPath = path.join(parsed.dir, filename);
    try {
      await fs.writeFile(outputPath, bytes, { flag: 'wx' });
      return outputPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('无法分配非覆盖的候选文件名');
}

async function main(): Promise<void> {
  const candidateArg = process.argv[2];
  if (!candidateArg || process.argv.length !== 3) {
    throw new Error('用法：npm run refresh:windows-acceptance -- <candidate.zip>');
  }
  const sourcePath = path.resolve(candidateArg);
  const sourceIdentity = await loadWindowsEvidenceCandidate(sourcePath);
  const acceptanceScript = ensureUtf8Bom(
    await fs.readFile(path.join(REPO, 'scripts', 'windows-shimeji-acceptance.ps1')),
  );
  const stageOneLauncher = ensureCrLf(
    await fs.readFile(path.join(REPO, 'scripts', 'run-windows-stage1-100.cmd')),
  );
  const acceptanceGuide = await fs.readFile(
    path.join(REPO, 'docs', 'acceptance', 'shimeji-windows.md'),
  );
  if (!acceptanceScript.toString('utf8').includes('schemaVersion = 3')) {
    throw new Error('本地 Windows 验收脚本不是 schema v3');
  }

  const refreshed = await appendToZip(await fs.readFile(sourcePath), [
    { name: 'Windows统一验收.ps1', data: acceptanceScript, compress: false },
    { name: 'windows-acceptance.ps1', data: acceptanceScript, compress: false },
    { name: '01-run-stage1-100dpi.cmd', data: stageOneLauncher, compress: false },
    { name: 'Shimeji-Windows-验收说明.md', data: acceptanceGuide, compress: false },
  ]);
  const entries = inspectZip(refreshed, ZIP_LIMITS_RELAXED).entries;
  const expectedEntries = new Map<string, Buffer>([
    ['Windows统一验收.ps1', acceptanceScript],
    ['windows-acceptance.ps1', acceptanceScript],
    ['01-run-stage1-100dpi.cmd', stageOneLauncher],
    ['Shimeji-Windows-验收说明.md', acceptanceGuide],
  ]);
  for (const [expectedName, expectedBytes] of expectedEntries) {
    const matches = entries.filter((entry) => entry.name === expectedName);
    if (matches.length !== 1) throw new Error(`更新后应有且仅有一个 ${expectedName}`);
    const packagedBytes = await readZipEntry(refreshed, matches[0]!);
    if (!packagedBytes.equals(expectedBytes)) throw new Error(`包内 ${expectedName} 与本地版本不一致`);
  }

  const outputPath = await writeNonOverwriting(sourcePath, refreshed);
  try {
    const refreshedIdentity = await loadWindowsEvidenceCandidate(outputPath);
    if (JSON.stringify(refreshedIdentity.integrity) !== JSON.stringify(sourceIdentity.integrity)
      || JSON.stringify(refreshedIdentity.manifest) !== JSON.stringify(sourceIdentity.manifest)) {
      throw new Error('更新验收文件时改变了运行时或 manifest 身份');
    }
    console.log('REFRESH_OK', outputPath);
    console.log('ZIP_SHA256', refreshedIdentity.candidateZipSha256);
    console.log('ACCEPTANCE_SCRIPT_SHA256', refreshedIdentity.acceptanceScriptSha256);
  } catch (error) {
    await fs.unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error('REFRESH_FAIL', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
