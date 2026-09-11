import type { ManualEvidenceProfile } from './windows-evidence';

export interface WindowsEvidenceMatrixRun {
  id: string;
  ok: boolean;
  windowsGeneration: '10' | '11' | null;
  dpiPercent: number | null;
  manualProfile: ManualEvidenceProfile | null;
  soakMinutes: number;
}

export interface WindowsEvidenceMatrixResult {
  ok: boolean;
  errors: string[];
  coverage: {
    core: Array<{
      windowsGeneration: '10' | '11';
      dpiPercent: 100 | 125 | 150;
      evidenceId: string;
    }>;
    mixedEvidenceIds: string[];
    soakEvidenceIds: string[];
  };
}

export const WINDOWS_CORE_MATRIX = [
  { windowsGeneration: '10', dpiPercent: 100 },
  { windowsGeneration: '10', dpiPercent: 125 },
  { windowsGeneration: '10', dpiPercent: 150 },
  { windowsGeneration: '11', dpiPercent: 100 },
  { windowsGeneration: '11', dpiPercent: 125 },
  { windowsGeneration: '11', dpiPercent: 150 },
] as const;

export function evaluateWindowsEvidenceMatrix(
  runs: readonly WindowsEvidenceMatrixRun[],
): WindowsEvidenceMatrixResult {
  const errors: string[] = [];
  const uniqueRuns: WindowsEvidenceMatrixRun[] = [];
  const seenIds = new Set<string>();

  for (const run of runs) {
    if (!run.id.trim()) {
      errors.push('存在没有证据 ID 的矩阵条目');
      continue;
    }
    if (seenIds.has(run.id)) {
      errors.push(`证据 ID 重复，不能重复计数：${run.id}`);
      continue;
    }
    seenIds.add(run.id);
    if (!run.ok) errors.push(`证据未通过单次复核：${run.id}`);
    if (run.windowsGeneration !== '10' && run.windowsGeneration !== '11') {
      errors.push(`证据缺少有效 Windows 10/11 代际：${run.id}`);
    }
    if (run.dpiPercent !== 100 && run.dpiPercent !== 125 && run.dpiPercent !== 150) {
      errors.push(`证据 DPI 不属于 100%/125%/150%：${run.id}`);
    }
    if (run.manualProfile !== 'core' && run.manualProfile !== 'mixed') {
      errors.push(`证据未完成 core/mixed 人工验收：${run.id}`);
    }
    if (!Number.isFinite(run.soakMinutes) || run.soakMinutes < 0) {
      errors.push(`证据长稳时长无效：${run.id}`);
    }
    uniqueRuns.push(run);
  }

  const eligibleRuns = uniqueRuns.filter((run) => run.ok
    && (run.windowsGeneration === '10' || run.windowsGeneration === '11')
    && (run.dpiPercent === 100 || run.dpiPercent === 125 || run.dpiPercent === 150)
    && (run.manualProfile === 'core' || run.manualProfile === 'mixed'));
  const core: WindowsEvidenceMatrixResult['coverage']['core'] = [];
  for (const requirement of WINDOWS_CORE_MATRIX) {
    const match = eligibleRuns.find((run) => run.windowsGeneration === requirement.windowsGeneration
      && run.dpiPercent === requirement.dpiPercent);
    if (match) {
      core.push({ ...requirement, evidenceId: match.id });
    } else {
      errors.push(`缺少核心证据：Windows ${requirement.windowsGeneration} / ${requirement.dpiPercent}%`);
    }
  }

  const mixedEvidenceIds = eligibleRuns
    .filter((run) => run.manualProfile === 'mixed')
    .map((run) => run.id);
  if (mixedEvidenceIds.length === 0) errors.push('缺少 mixed 混合 DPI 双屏人工证据');

  const soakEvidenceIds = eligibleRuns
    .filter((run) => run.soakMinutes >= 60)
    .map((run) => run.id);
  if (soakEvidenceIds.length === 0) errors.push('缺少真实 60 分钟长稳证据');

  return {
    ok: errors.length === 0,
    errors,
    coverage: { core, mixedEvidenceIds, soakEvidenceIds },
  };
}
