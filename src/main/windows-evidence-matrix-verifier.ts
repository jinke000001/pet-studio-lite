import path from 'node:path';
import {
  loadWindowsEvidenceCandidate,
  verifyWindowsEvidenceRun,
  type WindowsEvidenceCandidateIdentity,
} from './windows-evidence-verifier';
import {
  evaluateWindowsEvidenceMatrix,
  type WindowsEvidenceMatrixResult,
  type WindowsEvidenceMatrixRun,
} from '../shared/windows-evidence-matrix';
import type { WindowsEvidenceValidation } from '../shared/windows-evidence';

export interface WindowsEvidenceMatrixRunVerification {
  id: string;
  evidencePath: string;
  summary: WindowsEvidenceValidation['summary'] | null;
  errors: string[];
}

export interface WindowsEvidenceMatrixVerification {
  candidate: WindowsEvidenceCandidateIdentity;
  runs: WindowsEvidenceMatrixRunVerification[];
  matrix: WindowsEvidenceMatrixResult;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export async function verifyWindowsEvidenceMatrixArtifacts(
  candidatePath: string,
  evidencePaths: readonly string[],
): Promise<WindowsEvidenceMatrixVerification> {
  const candidate = await loadWindowsEvidenceCandidate(candidatePath);
  const runs: WindowsEvidenceMatrixRunVerification[] = [];
  const matrixRuns: WindowsEvidenceMatrixRun[] = [];

  for (const suppliedPath of evidencePaths) {
    const evidencePath = path.resolve(suppliedPath);
    try {
      const initial = await verifyWindowsEvidenceRun(candidate, { evidencePath });
      const summary = initial.validation.summary;
      const strict = await verifyWindowsEvidenceRun(candidate, {
        evidencePath,
        expectedWindowsGeneration: summary.windowsGeneration ?? undefined,
        expectedDpiPercent: summary.dpiPercent === 100 || summary.dpiPercent === 125 || summary.dpiPercent === 150
          ? summary.dpiPercent
          : undefined,
        requiredManualProfile: summary.manualProfile === 'core' || summary.manualProfile === 'mixed'
          ? summary.manualProfile
          : undefined,
        minSoakMinutes: summary.soakMinutes >= 60 ? 60 : undefined,
      });
      const errors = unique([...strict.validation.errors, ...strict.artifactErrors]);
      runs.push({ id: evidencePath, evidencePath, summary: strict.validation.summary, errors });
      matrixRuns.push({
        id: evidencePath,
        ok: errors.length === 0,
        windowsGeneration: strict.validation.summary.windowsGeneration,
        dpiPercent: strict.validation.summary.dpiPercent,
        manualProfile: strict.validation.summary.manualProfile,
        soakMinutes: strict.validation.summary.soakMinutes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runs.push({ id: evidencePath, evidencePath, summary: null, errors: [message] });
      matrixRuns.push({
        id: evidencePath,
        ok: false,
        windowsGeneration: null,
        dpiPercent: null,
        manualProfile: null,
        soakMinutes: 0,
      });
    }
  }

  return { candidate, runs, matrix: evaluateWindowsEvidenceMatrix(matrixRuns) };
}
