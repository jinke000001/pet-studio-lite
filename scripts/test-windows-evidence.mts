import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyWindowsEvidenceArtifacts } from '../src/main/windows-evidence-verifier';
import { createZip } from '../src/shared/zipw';
import {
  CORE_MANUAL_CHECK_IDS,
  REQUIRED_AUTOMATIC_CHECKS,
  REQUIRED_SOAK_CHECKS,
  validateWindowsEvidence,
} from '../src/shared/windows-evidence';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const integrity = {
  schemaVersion: 1 as const,
  executable: { path: 'PetLitePet.exe', sha256: 'a'.repeat(64) },
  manifestSha256: 'b'.repeat(64),
};
const manifest = {
  platform: 'win32', arch: 'x64', distribution: 'internal-test-only',
  pet: { id: 'mario', instanceId: 'studio-mario' },
};
const acceptanceScriptSha256 = 'c'.repeat(64);

function automaticChecks(): Array<{ name: string; passed: boolean; detail: string }> {
  return REQUIRED_AUTOMATIC_CHECKS.map((name) => ({ name, passed: true, detail: 'ok' }));
}

function validResult(): Record<string, unknown> {
  const checks = automaticChecks();
  return {
    schemaVersion: 2,
    startedAt: '2026-09-11T10:00:00.000Z',
    finishedAt: '2026-09-11T10:01:00.000Z',
    runtimeExeSha256: integrity.executable.sha256,
    manifestSha256: integrity.manifestSha256,
    artifactIntegrity: integrity,
    acceptanceScriptSha256,
    manifest,
    dpi: 96,
    os: {
      caption: 'Microsoft Windows 11 Pro', version: '10.0.26100',
      buildNumber: 26100, architecture: '64-bit', generation: '11',
    },
    checks,
    passed: checks.length,
    failed: 0,
    manual: { profile: 'none', completedAt: null, checks: [] },
    soak: {
      requestedMinutes: 0, sampleSeconds: 30, lifecycleCycleMinutes: 5,
      lifecycleCycles: 0, samples: [],
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const expected = {
  expectedIntegrity: integrity,
  expectedManifest: manifest,
  expectedAcceptanceScriptSha256: acceptanceScriptSha256,
};

console.log('[Windows 验收证据契约]');
{
  const result = validateWindowsEvidence(validResult(), expected);
  check('合法自动证据通过', result.ok, result.errors.join('；'));
  check('未记录人工项时明确给出待办警告', result.warnings.some((item) => item.includes('人工')));
}
{
  const input = validResult();
  input.runtimeExeSha256 = 'c'.repeat(64);
  const result = validateWindowsEvidence(input, expected);
  check('实际运行 EXE 哈希与候选不一致时拒绝', !result.ok && result.errors.some((item) => item.includes('EXE')));
}
{
  const input = validResult();
  input.acceptanceScriptSha256 = 'd'.repeat(64);
  const result = validateWindowsEvidence(input, expected);
  check('Windows 使用的验收脚本与候选不一致时拒绝', !result.ok && result.errors.some((item) => item.includes('验收脚本')));
}
{
  const input = validResult();
  const checks = input.checks as Array<{ name: string; passed: boolean; detail: string }>;
  checks[0]!.passed = false;
  input.passed = checks.length - 1;
  input.failed = 1;
  const result = validateWindowsEvidence(input, expected);
  check('任何自动检查失败都会拒绝', !result.ok && result.errors.some((item) => item.includes(REQUIRED_AUTOMATIC_CHECKS[0]!)));
}
{
  const input = validResult();
  input.passed = 999;
  const result = validateWindowsEvidence(input, expected);
  check('汇总计数与逐项结果不一致时拒绝', !result.ok && result.errors.some((item) => item.includes('计数')));
}
{
  const input = validResult();
  (input.checks as unknown[]).pop();
  input.passed = (input.checks as unknown[]).length;
  const result = validateWindowsEvidence(input, expected);
  check('缺少必需自动检查时拒绝', !result.ok && result.errors.some((item) => item.includes('缺少自动检查')));
}
{
  const ok = validateWindowsEvidence(validResult(), { ...expected, expectedDpiPercent: 100 });
  const bad = validateWindowsEvidence(validResult(), { ...expected, expectedDpiPercent: 125 });
  check('DPI 档位可精确核对', ok.ok && !bad.ok && bad.errors.some((item) => item.includes('DPI')));
}
{
  const ok = validateWindowsEvidence(validResult(), { ...expected, expectedWindowsGeneration: '11' });
  const bad = validateWindowsEvidence(validResult(), { ...expected, expectedWindowsGeneration: '10' });
  check('Windows 10/11 代际可独立核对', ok.ok && !bad.ok && bad.errors.some((item) => item.includes('Windows 代际')));
}

console.log('\n[人工视觉证据]');
{
  const input = validResult();
  const manualChecks = CORE_MANUAL_CHECK_IDS.map((id) => ({ id, name: id, passed: true }));
  input.manual = { profile: 'core', completedAt: '2026-09-11T10:00:50.000Z', checks: manualChecks };
  const result = validateWindowsEvidence(input, { ...expected, requiredManualProfile: 'core' });
  check('核心人工项全部通过时可验证', result.ok, result.errors.join('；'));
}
{
  const input = validResult();
  const manualChecks = CORE_MANUAL_CHECK_IDS.map((id) => ({ id, name: id, passed: id !== 'edge-impact' }));
  input.manual = { profile: 'core', completedAt: '2026-09-11T10:00:50.000Z', checks: manualChecks };
  const result = validateWindowsEvidence(input, { ...expected, requiredManualProfile: 'core' });
  check('人工项失败时拒绝', !result.ok && result.errors.some((item) => item.includes('edge-impact')));
}
{
  const input = validResult();
  input.manual = {
    profile: 'core', completedAt: '2026-09-11T10:00:50.000Z',
    checks: CORE_MANUAL_CHECK_IDS.map((id) => ({ id, name: id, passed: true })),
  };
  const result = validateWindowsEvidence(input, { ...expected, requiredManualProfile: 'mixed' });
  check('混合 DPI 证据不能由 core 人工项替代', !result.ok && result.errors.some((item) => item.includes('mixed')));
}

console.log('\n[一小时长稳证据]');
function soakResult(): Record<string, unknown> {
  const input = clone(validResult());
  input.startedAt = '2026-09-11T10:00:00.000Z';
  input.finishedAt = '2026-09-11T11:00:05.000Z';
  const samples = Array.from({ length: 120 }, (_, index) => ({
    timestamp: new Date(Date.parse('2026-09-11T10:00:00.000Z') + index * 30_000).toISOString(),
    processCount: 1,
    visibleWindows: 2,
    responding: true,
    workingSetMb: 210 + index * 0.02,
    handleCount: 900 + index,
    probeChildren: 0,
  }));
  input.soak = {
    requestedMinutes: 60, sampleSeconds: 30, lifecycleCycleMinutes: 5,
    lifecycleCycles: 11, samples,
  };
  const checks = input.checks as Array<{ name: string; passed: boolean; detail: string }>;
  checks.push(...REQUIRED_SOAK_CHECKS.map((name) => ({ name, passed: true, detail: 'ok' })));
  input.passed = checks.length;
  return input;
}
{
  const result = validateWindowsEvidence(soakResult(), { ...expected, minSoakMinutes: 60 });
  check('足量且健康的一小时采样通过', result.ok, result.errors.join('；'));
}
{
  const input = soakResult();
  input.finishedAt = '2026-09-11T10:10:00.000Z';
  const result = validateWindowsEvidence(input, { ...expected, minSoakMinutes: 60 });
  check('仅声明 60 分钟但实际持续时间不足时拒绝', !result.ok && result.errors.some((item) => item.includes('持续时间')));
}
{
  const input = soakResult();
  const samples = (input.soak as { samples: Array<Record<string, unknown>> }).samples;
  samples[12]!.responding = false;
  const result = validateWindowsEvidence(input, { ...expected, minSoakMinutes: 60 });
  check('存在无响应采样时拒绝', !result.ok && result.errors.some((item) => item.includes('不健康')));
}
{
  const input = soakResult();
  (input.soak as { samples: unknown[] }).samples = (input.soak as { samples: unknown[] }).samples.slice(0, 10);
  const result = validateWindowsEvidence(input, { ...expected, minSoakMinutes: 60 });
  check('采样数量或时间覆盖不足时拒绝', !result.ok && result.errors.some((item) => item.includes('采样')));
}
{
  const input = soakResult();
  const checks = input.checks as Array<{ name: string; passed: boolean; detail: string }>;
  const index = checks.findIndex((item) => item.name === REQUIRED_SOAK_CHECKS[0]);
  checks.splice(index, 1);
  input.passed = checks.length;
  const result = validateWindowsEvidence(input, { ...expected, minSoakMinutes: 60 });
  check('缺少长稳专属自动检查时拒绝', !result.ok && result.errors.some((item) => item.includes('缺少长稳自动检查')));
}
{
  const input = soakResult();
  const samples = (input.soak as { samples: Array<Record<string, unknown>> }).samples;
  [samples[10]!.timestamp, samples[11]!.timestamp] = [samples[11]!.timestamp, samples[10]!.timestamp];
  const result = validateWindowsEvidence(input, { ...expected, minSoakMinutes: 60 });
  check('采样时间倒序时拒绝', !result.ok && result.errors.some((item) => item.includes('时间顺序')));
}
{
  const input = validResult();
  input.manifest = { ...manifest, pet: { id: 'other' } };
  const result = validateWindowsEvidence(input, expected);
  check('result 内 manifest 与候选不一致时拒绝', !result.ok && result.errors.some((item) => item.includes('manifest')));
}
{
  const result = validateWindowsEvidence(null, expected);
  check('非对象证据被安全拒绝', !result.ok);
}

console.log('\n[候选 ZIP 与证据目录联检]');
{
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'windows-evidence-test-'));
  try {
    const candidatePath = path.join(tempRoot, 'candidate.zip');
    const evidenceDir = path.join(tempRoot, 'acceptance-evidence-test');
    await fs.mkdir(evidenceDir);
    const executableBytes = Buffer.from('small deterministic windows executable fixture');
    const candidateManifest = { ...manifest, exportedAt: '2026-09-11T09:59:00.000Z' };
    const manifestBytes = Buffer.from(JSON.stringify(candidateManifest, null, 2), 'utf8');
    const candidateIntegrity = {
      schemaVersion: 1 as const,
      executable: {
        path: 'PetLitePet.exe',
        sha256: crypto.createHash('sha256').update(executableBytes).digest('hex'),
      },
      manifestSha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'),
    };
    const candidateAcceptanceScript = Buffer.from('candidate acceptance script fixture');
    const candidateAcceptanceScriptSha256 = crypto.createHash('sha256')
      .update(candidateAcceptanceScript).digest('hex');
    await fs.writeFile(candidatePath, createZip([
      { name: 'PetLitePet.exe', data: executableBytes, compress: false },
      { name: 'manifest.json', data: manifestBytes, compress: false },
      { name: 'runtime-integrity.json', data: Buffer.from(JSON.stringify(candidateIntegrity, null, 2)), compress: false },
      { name: 'Windows统一验收.ps1', data: candidateAcceptanceScript, compress: false },
    ]));
    const evidenceResult = validResult();
    evidenceResult.runtimeExeSha256 = candidateIntegrity.executable.sha256;
    evidenceResult.manifestSha256 = candidateIntegrity.manifestSha256;
    evidenceResult.artifactIntegrity = candidateIntegrity;
    evidenceResult.acceptanceScriptSha256 = candidateAcceptanceScriptSha256;
    evidenceResult.manifest = candidateManifest;
    await fs.writeFile(path.join(evidenceDir, 'result.json'), JSON.stringify(evidenceResult, null, 2));
    const fakePng = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(fakePng);
    for (const name of ['01-first-launch.png', '02-two-pets.png', '03-after-motion.png']) {
      await fs.writeFile(path.join(evidenceDir, name), fakePng);
    }

    const verified = await verifyWindowsEvidenceArtifacts({
      candidatePath, evidencePath: evidenceDir, expectedDpiPercent: 100,
    });
    check('真实文件联检可复算候选并接受完整证据目录',
      verified.validation.ok && verified.artifactErrors.length === 0,
      [...verified.validation.errors, ...verified.artifactErrors].join('；'));

    await fs.writeFile(path.join(evidenceDir, 'failure.txt'), 'simulated failure');
    const withFailureMarker = await verifyWindowsEvidenceArtifacts({ candidatePath, evidencePath: evidenceDir });
    check('证据目录存在 failure.txt 时拒绝',
      withFailureMarker.artifactErrors.some((item) => item.includes('failure.txt')));
    await fs.rm(path.join(evidenceDir, 'failure.txt'));
    await fs.rm(path.join(evidenceDir, '03-after-motion.png'));
    const missingScreenshot = await verifyWindowsEvidenceArtifacts({ candidatePath, evidencePath: evidenceDir });
    check('缺少必需截图时拒绝',
      missingScreenshot.artifactErrors.some((item) => item.includes('03-after-motion.png')));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
