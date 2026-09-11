export interface PointerVelocity {
  vx: number;
  vy: number;
}

interface PointerSample {
  x: number;
  y: number;
  timeMs: number;
}

const SAMPLE_WINDOW_MS = 120;
const MAX_SAMPLES = 8;
export const MAX_THROW_SPEED = 1_600;

function clampSpeed(value: number): number {
  return Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, value));
}

/** Estimates release velocity from a short, monotonic pointer history. */
export class PointerVelocityTracker {
  private samples: PointerSample[] = [];

  record(x: number, y: number, timeMs: number): void {
    if (![x, y, timeMs].every(Number.isFinite)) return;
    const previous = this.samples.at(-1);
    if (previous && timeMs < previous.timeMs) return;
    this.samples.push({ x, y, timeMs });
    const cutoff = timeMs - SAMPLE_WINDOW_MS;
    this.samples = this.samples.filter((sample) => sample.timeMs >= cutoff).slice(-MAX_SAMPLES);
  }

  velocity(): PointerVelocity {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (!first || !last || last.timeMs <= first.timeMs) return { vx: 0, vy: 0 };
    const seconds = (last.timeMs - first.timeMs) / 1_000;
    return {
      vx: clampSpeed((last.x - first.x) / seconds),
      vy: clampSpeed((last.y - first.y) / seconds),
    };
  }

  reset(): void {
    this.samples = [];
  }
}
