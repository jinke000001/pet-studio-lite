// 用法：npm run check:windows-evidence -- <candidate.zip> <result.json|evidence-dir> --windows 10|11 [--dpi 100|125|150] [--manual core|mixed] [--soak 60]

import path from 'node:path';
import { verifyWindowsEvidenceArtifacts } from '../src/main/windows-evidence-verifier';
import type { ManualEvidenceProfile } from '../src/shared/windows-evidence';

type RequiredManualProfile = Exclude<ManualEvidenceProfile, 'none'>;

function usage(): never {
  throw new Error(
    '用法：npm run check:windows-evidence -- <candidate.zip> <result.json|evidence-dir> '
    + '--windows 10|11 [--dpi 100|125|150] [--manual core|mixed] [--soak 60]',
  );
}

function parseArgs(argv: string[]): {
  candidatePath: string;
  evidencePath: string;
  expectedWindowsGeneration: '10' | '11';
  expectedDpiPercent?: 100 | 125 | 150;
  requiredManualProfile?: RequiredManualProfile;
  minSoakMinutes?: number;
} {
  const positional: string[] = [];
  let expectedDpiPercent: 100 | 125 | 150 | undefined;
  let expectedWindowsGeneration: '10' | '11' | undefined;
  let requiredManualProfile: RequiredManualProfile | undefined;
  let minSoakMinutes: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) usage();
    index += 1;
    if (arg === '--windows') {
      if (value !== '10' && value !== '11') usage();
      expectedWindowsGeneration = value;
    } else if (arg === '--dpi') {
      const parsed = Number(value);
      if (parsed !== 100 && parsed !== 125 && parsed !== 150) usage();
      expectedDpiPercent = parsed;
    } else if (arg === '--manual') {
      if (value !== 'core' && value !== 'mixed') usage();
      requiredManualProfile = value;
    } else if (arg === '--soak') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) usage();
      minSoakMinutes = parsed;
    } else {
      usage();
    }
  }
  if (positional.length !== 2 || expectedWindowsGeneration === undefined) usage();
  return {
    candidatePath: path.resolve(positional[0]!),
    evidencePath: path.resolve(positional[1]!),
    expectedWindowsGeneration,
    expectedDpiPercent,
    requiredManualProfile,
    minSoakMinutes,
  };
}

async function main(): Promise<void> {
  const verification = await verifyWindowsEvidenceArtifacts(parseArgs(process.argv.slice(2)));
  const { validation } = verification;
  console.log(`候选 ZIP SHA-256：${verification.candidateZipSha256}`);
  console.log(`运行时 EXE SHA-256：${verification.integrity.executable.sha256}`);
  console.log(`验收脚本 SHA-256：${verification.acceptanceScriptSha256}`);
  console.log(`Windows 代际：${validation.summary.windowsGeneration ?? '未知'}`);
  console.log(`证据 DPI：${validation.summary.dpiPercent ?? '未知'}%`);
  console.log(`逐项检查：${validation.summary.automaticPassed} 通过，${validation.summary.automaticFailed} 失败`);
  console.log(`人工档位：${validation.summary.manualProfile ?? '缺失'}`);
  console.log(`长稳采样：${validation.summary.sampleCount} 条 / 请求 ${validation.summary.soakMinutes} 分钟`);
  for (const warning of validation.warnings) console.warn(`警告：${warning}`);
  const allErrors = [...validation.errors, ...verification.artifactErrors];
  if (allErrors.length > 0) {
    for (const error of allErrors) console.error(`失败：${error}`);
    process.exitCode = 1;
  } else {
    console.log('WINDOWS_EVIDENCE_OK');
  }
}

main().catch((error) => {
  console.error('WINDOWS_EVIDENCE_FAIL', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
