// 用法：npm run check:windows-matrix -- <candidate.zip> <evidence-dir> [evidence-dir...]

import path from 'node:path';
import { verifyWindowsEvidenceMatrixArtifacts } from '../src/main/windows-evidence-matrix-verifier';

async function main(): Promise<void> {
  const [candidateArg, ...evidenceArgs] = process.argv.slice(2);
  if (!candidateArg || evidenceArgs.length === 0) {
    throw new Error('用法：npm run check:windows-matrix -- <candidate.zip> <evidence-dir> [evidence-dir...]');
  }
  const verification = await verifyWindowsEvidenceMatrixArtifacts(
    path.resolve(candidateArg),
    evidenceArgs.map((item) => path.resolve(item)),
  );
  console.log(`候选 ZIP SHA-256：${verification.candidate.candidateZipSha256}`);
  for (const run of verification.runs) {
    const summary = run.summary;
    const label = summary
      ? `Windows ${summary.windowsGeneration ?? '?'} / ${summary.dpiPercent ?? '?'}% / ${summary.manualProfile ?? '?'} / soak ${summary.soakMinutes}m`
      : '无法读取';
    console.log(`${run.errors.length === 0 ? '✓' : '✗'} ${label} — ${run.evidencePath}`);
    for (const error of run.errors) console.error(`  失败：${error}`);
  }
  console.log(`核心组合：${verification.matrix.coverage.core.length}/6`);
  console.log(`mixed 双屏证据：${verification.matrix.coverage.mixedEvidenceIds.length}`);
  console.log(`60 分钟长稳证据：${verification.matrix.coverage.soakEvidenceIds.length}`);
  if (!verification.matrix.ok) {
    for (const error of verification.matrix.errors) console.error(`矩阵缺口：${error}`);
    process.exitCode = 1;
  } else {
    console.log('WINDOWS_MATRIX_OK');
  }
}

main().catch((error) => {
  console.error('WINDOWS_MATRIX_FAIL', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
