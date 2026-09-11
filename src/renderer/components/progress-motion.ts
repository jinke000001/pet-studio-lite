function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const ESTIMATED_PROGRESS_LIMIT = 0.92;

/**
 * Keep long-running phases visibly alive without ever implying completion.
 * Real checkpoints are caught quickly; between them the estimate advances slowly
 * toward a 92% ceiling until the exporter reports that it is actually done.
 */
export function advanceEstimatedProgress(
  current: number,
  checkpoint: number,
  elapsedMs: number,
): number {
  const start = clampProgress(current);
  if (elapsedMs <= 0 || start >= ESTIMATED_PROGRESS_LIMIT) return start;

  const realCheckpoint = Math.min(ESTIMATED_PROGRESS_LIMIT, clampProgress(checkpoint));
  const catchingUp = start < realCheckpoint;
  const destination = catchingUp ? realCheckpoint : ESTIMATED_PROGRESS_LIMIT;
  const timeConstantMs = catchingUp ? 180 : 12_000;
  const factor = 1 - Math.exp(-elapsedMs / timeConstantMs);
  return Math.min(ESTIMATED_PROGRESS_LIMIT, start + (destination - start) * factor);
}

/**
 * Ease a displayed progress value toward the latest real checkpoint.
 * The displayed value never runs ahead of the checkpoint and never moves backward.
 */
export function interpolateProgress(
  from: number,
  target: number,
  elapsedMs: number,
  durationMs: number,
): number {
  const start = clampProgress(from);
  const end = Math.max(start, clampProgress(target));
  if (end === start) return start;
  if (durationMs <= 0 || elapsedMs >= durationMs) return end;

  const time = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const eased = 1 - Math.pow(1 - time, 3);
  return start + (end - start) * eased;
}
