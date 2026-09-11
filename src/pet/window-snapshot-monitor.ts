import type { DesktopWindowSnapshot } from '../shared/shimeji/desktop-terrain';

export type WindowSnapshotCapture = () => Promise<DesktopWindowSnapshot[]>;
export type WindowSnapshotListener = (windows: readonly DesktopWindowSnapshot[]) => void;

export interface WindowSnapshotMonitorOptions {
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Owns probe cadence and failure isolation. A slow probe is never overlapped by
 * another one; transient failures retain the last known good snapshot so an
 * attached pet does not fall merely because one native query timed out.
 */
export class WindowSnapshotMonitor {
  private readonly listeners = new Set<WindowSnapshotListener>();
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<readonly DesktopWindowSnapshot[]> | null = null;
  private latest: readonly DesktopWindowSnapshot[] = [];

  constructor(
    private readonly capture: WindowSnapshotCapture,
    private readonly options: WindowSnapshotMonitorOptions = {},
  ) {
    this.intervalMs = Math.max(250, Math.round(options.intervalMs ?? 1_000));
  }

  get snapshot(): readonly DesktopWindowSnapshot[] {
    return this.latest;
  }

  subscribe(listener: WindowSnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(): Promise<readonly DesktopWindowSnapshot[]> {
    if (this.inFlight) return this.inFlight;
    const request = this.capture()
      .then((windows) => {
        this.latest = windows.map((window) => ({ ...window }));
        for (const listener of this.listeners) listener(this.latest);
        return this.latest;
      })
      .catch((error: unknown) => {
        this.options.onError?.(error);
        return this.latest;
      })
      .finally(() => {
        if (this.inFlight === request) this.inFlight = null;
      });
    this.inFlight = request;
    return request;
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
