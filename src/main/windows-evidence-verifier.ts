import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectZip, readZipEntry, ZIP_LIMITS_RELAXED, type ZipEntry } from '../shared/zip';
import {
  validateWindowsEvidence,
  type ArtifactIntegrityExpectation,
  type ManualEvidenceProfile,
  type WindowsEvidenceValidation,
} from '../shared/windows-evidence';

export interface WindowsEvidenceArtifactOptions {
  candidatePath: string;
  evidencePath: string;
  expectedWindowsGeneration?: '10' | '11';
  expectedDpiPercent?: 100 | 125 | 150;
  requiredManualProfile?: Exclude<ManualEvidenceProfile, 'none'>;
  minSoakMinutes?: number;
}

export interface WindowsEvidenceArtifactVerification {
  candidateZipSha256: string;
  integrity: ArtifactIntegrityExpectation;
  acceptanceScriptSha256: string;
  validation: WindowsEvidenceValidation;
  artifactErrors: string[];
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!isRecord(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
  };
  return JSON.stringify(normalize(value));
}

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactEntry(entries: ZipEntry[], name: string): ZipEntry {
  const matches = entries.filter((entry) => entry.name === name);
  if (matches.length !== 1) throw new Error(`候选 ZIP 应有且仅有一个 ${name}（实际 ${matches.length}）`);
  return matches[0]!;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(() => true, () => false);
}

async function validPng(filePath: string): Promise<boolean> {
  try {
    const bytes = await fs.readFile(filePath);
    return bytes.length >= 64
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } catch {
    return false;
  }
}

export async function verifyWindowsEvidenceArtifacts(
  options: WindowsEvidenceArtifactOptions,
): Promise<WindowsEvidenceArtifactVerification> {
  const candidateBytes = await fs.readFile(options.candidatePath).catch(() => {
    throw new Error(`找不到候选 ZIP：${options.candidatePath}`);
  });
  const entries = inspectZip(candidateBytes, ZIP_LIMITS_RELAXED).entries;
  const integrityBytes = await readZipEntry(candidateBytes, exactEntry(entries, 'runtime-integrity.json'));
  const manifestBytes = await readZipEntry(candidateBytes, exactEntry(entries, 'manifest.json'));
  const acceptanceScriptBytes = await readZipEntry(
    candidateBytes,
    exactEntry(entries, 'Windows统一验收.ps1'),
  );
  const integrity = parseJson(integrityBytes, 'runtime-integrity.json');
  const manifest = parseJson(manifestBytes, 'manifest.json');
  if (!isRecord(integrity) || integrity.schemaVersion !== 1 || !isRecord(integrity.executable)
    || integrity.executable.path !== 'PetLitePet.exe'
    || typeof integrity.executable.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(integrity.executable.sha256)
    || typeof integrity.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(integrity.manifestSha256)) {
    throw new Error('候选 runtime-integrity.json 格式无效');
  }
  const expectedIntegrity = integrity as unknown as ArtifactIntegrityExpectation;
  const executableBytes = await readZipEntry(
    candidateBytes,
    exactEntry(entries, expectedIntegrity.executable.path),
    ZIP_LIMITS_RELAXED,
  );
  if (sha256(executableBytes) !== expectedIntegrity.executable.sha256.toLowerCase()) {
    throw new Error('候选 ZIP 内实际 EXE 与 runtime-integrity.json 不一致');
  }
  if (sha256(manifestBytes) !== expectedIntegrity.manifestSha256.toLowerCase()) {
    throw new Error('候选 ZIP 内实际 manifest 与 runtime-integrity.json 不一致');
  }

  const evidenceStat = await fs.stat(options.evidencePath).catch(() => null);
  if (!evidenceStat) throw new Error(`找不到 Windows 证据路径：${options.evidencePath}`);
  const resultPath = evidenceStat.isDirectory()
    ? path.join(options.evidencePath, 'result.json')
    : options.evidencePath;
  const evidenceDir = path.dirname(resultPath);
  const resultBytes = await fs.readFile(resultPath).catch(() => {
    throw new Error(`找不到 Windows result.json：${resultPath}`);
  });
  const result = parseJson(resultBytes, 'result.json');
  const acceptanceScriptSha256 = sha256(acceptanceScriptBytes);
  const validation = validateWindowsEvidence(result, {
    expectedIntegrity,
    expectedManifest: manifest,
    expectedAcceptanceScriptSha256: acceptanceScriptSha256,
    expectedWindowsGeneration: options.expectedWindowsGeneration,
    expectedDpiPercent: options.expectedDpiPercent,
    requiredManualProfile: options.requiredManualProfile,
    minSoakMinutes: options.minSoakMinutes,
  });

  const artifactErrors: string[] = [];
  if (await exists(path.join(evidenceDir, 'failure.txt'))) {
    artifactErrors.push('证据目录包含 failure.txt，说明脚本曾异常终止');
  }
  const requiredScreenshots = ['01-first-launch.png', '02-two-pets.png', '03-after-motion.png'];
  if (isRecord(result) && isRecord(result.soak)
    && typeof result.soak.requestedMinutes === 'number' && result.soak.requestedMinutes > 0) {
    requiredScreenshots.push('04-after-soak.png');
    const soakSamplesPath = path.join(evidenceDir, 'soak-samples.json');
    if (!(await exists(soakSamplesPath))) {
      artifactErrors.push('长稳证据缺少 soak-samples.json');
    } else {
      const externalSamples = parseJson(await fs.readFile(soakSamplesPath), 'soak-samples.json');
      if (stableJson(externalSamples) !== stableJson(result.soak.samples)) {
        artifactErrors.push('soak-samples.json 与 result.json 内采样不一致');
      }
    }
  }
  if (isRecord(result) && isRecord(result.manual) && Array.isArray(result.manual.checks)) {
    for (const item of result.manual.checks) {
      if (!isRecord(item) || typeof item.screenshot !== 'string'
        || !/^manual-[a-z0-9-]+\.png$/.test(item.screenshot)) {
        artifactErrors.push('人工验收截图路径缺失或格式无效');
      } else {
        requiredScreenshots.push(item.screenshot);
      }
    }
  }
  for (const filename of new Set(requiredScreenshots)) {
    if (!(await validPng(path.join(evidenceDir, filename)))) {
      artifactErrors.push(`缺少或损坏的 PNG 截图：${filename}`);
    }
  }

  return {
    candidateZipSha256: sha256(candidateBytes),
    integrity: expectedIntegrity,
    acceptanceScriptSha256,
    validation,
    artifactErrors,
  };
}
