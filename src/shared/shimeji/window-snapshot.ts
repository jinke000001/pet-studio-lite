import type { DesktopRect, DesktopWindowSnapshot } from './desktop-terrain';

export const WINDOW_PROBE_PROTOCOL_VERSION = 1 as const;

export interface PhysicalWindowRecord {
  id: string;
  pid: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  visible: boolean;
  minimized: boolean;
  cloaked: boolean;
}

export interface WindowProbePayload {
  version: typeof WINDOW_PROBE_PROTOCOL_VERSION;
  coordinateSpace: 'physical';
  windows: PhysicalWindowRecord[];
}

export type PhysicalToDipRect = (rect: DesktopRect) => DesktopRect;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseWindowRecord(value: unknown): PhysicalWindowRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !/^\d+$/.test(value.id)) return null;
  if (!Number.isSafeInteger(value.pid) || (value.pid as number) <= 0) return null;
  if (!finiteNumber(value.left) || !finiteNumber(value.top)
    || !finiteNumber(value.right) || !finiteNumber(value.bottom)) return null;
  if (value.right <= value.left || value.bottom <= value.top) return null;
  if (typeof value.visible !== 'boolean' || typeof value.minimized !== 'boolean'
    || typeof value.cloaked !== 'boolean') return null;

  return {
    id: value.id,
    pid: value.pid as number,
    left: value.left,
    top: value.top,
    right: value.right,
    bottom: value.bottom,
    visible: value.visible,
    minimized: value.minimized,
    cloaked: value.cloaked,
  };
}

/** Parse untrusted native-helper output and discard malformed window rows. */
export function parseWindowProbePayload(json: string): WindowProbePayload {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Windows window probe returned invalid JSON');
  }
  if (!isRecord(value)
    || value.version !== WINDOW_PROBE_PROTOCOL_VERSION
    || value.coordinateSpace !== 'physical'
    || !Array.isArray(value.windows)) {
    throw new Error('Windows window probe returned an unsupported payload');
  }

  const seen = new Set<string>();
  const windows: PhysicalWindowRecord[] = [];
  for (const candidate of value.windows) {
    const parsed = parseWindowRecord(candidate);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    windows.push(parsed);
  }
  return { version: WINDOW_PROBE_PROTOCOL_VERSION, coordinateSpace: 'physical', windows };
}

/** Convert DWM physical screen rectangles to Electron DIP desktop rectangles. */
export function normalizeWindowSnapshots(
  payload: WindowProbePayload,
  ownProcessId: number,
  physicalToDip: PhysicalToDipRect,
): DesktopWindowSnapshot[] {
  const snapshots: DesktopWindowSnapshot[] = [];
  for (const win of payload.windows) {
    const physical = {
      x: win.left,
      y: win.top,
      width: win.right - win.left,
      height: win.bottom - win.top,
    };
    const dip = physicalToDip(physical);
    if (![dip.x, dip.y, dip.width, dip.height].every(Number.isFinite)
      || dip.width <= 0 || dip.height <= 0) continue;
    snapshots.push({
      id: win.id,
      x: Math.round(dip.x),
      y: Math.round(dip.y),
      width: Math.round(dip.width),
      height: Math.round(dip.height),
      visible: win.visible,
      minimized: win.minimized,
      cloaked: win.cloaked,
      own: win.pid === ownProcessId,
    });
  }
  return snapshots;
}
