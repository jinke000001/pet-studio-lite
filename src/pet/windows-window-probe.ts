import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { screen } from 'electron';
import {
  normalizeWindowSnapshots,
  parseWindowProbePayload,
  type WindowProbePayload,
} from '../shared/shimeji/window-snapshot';
import type { DesktopWindowSnapshot } from '../shared/shimeji/desktop-terrain';

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/*
 * The probe is a fixed bundled string: no user input is interpolated and
 * execFile never invokes cmd.exe. DWM returns visible bounds in physical pixels.
 */
const WINDOW_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class PetStudioWindowProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint command);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

  const uint GW_OWNER = 4;
  const int GWL_EXSTYLE = -20;
  const long WS_EX_TOOLWINDOW = 0x80;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const int DWMWA_CLOAKED = 14;

  static long GetExStyle(IntPtr hWnd) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, GWL_EXSTYLE).ToInt64() : GetWindowLong32(hWnd, GWL_EXSTYLE);
  }

  public static object[] Capture() {
    var rows = new List<object>();
    EnumWindows((hWnd, _) => {
      bool visible = IsWindowVisible(hWnd);
      bool minimized = IsIconic(hWnd);
      if (!visible || minimized || GetWindow(hWnd, GW_OWNER) != IntPtr.Zero || (GetExStyle(hWnd) & WS_EX_TOOLWINDOW) != 0) return true;

      int cloakedValue = 0;
      bool cloaked = DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloakedValue, sizeof(int)) == 0 && cloakedValue != 0;
      RECT rect;
      if (DwmGetWindowAttribute(hWnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(hWnd, out rect)) return true;
      if (rect.Right <= rect.Left || rect.Bottom <= rect.Top) return true;

      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      rows.Add(new {
        id = hWnd.ToInt64().ToString(), pid = pid,
        left = rect.Left, top = rect.Top, right = rect.Right, bottom = rect.Bottom,
        visible = visible, minimized = minimized, cloaked = cloaked
      });
      return true;
    }, IntPtr.Zero);
    return rows.ToArray();
  }
}
'@
[ordered]@{
  version = 1
  coordinateSpace = 'physical'
  windows = @([PetStudioWindowProbe]::Capture())
} | ConvertTo-Json -Compress -Depth 4
`;

export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export async function capturePhysicalWindows(): Promise<WindowProbePayload> {
  if (process.platform !== 'win32') {
    return { version: 1, coordinateSpace: 'physical', windows: [] };
  }
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', encodePowerShellCommand(WINDOW_PROBE_SCRIPT),
  ], {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  return parseWindowProbePayload(stdout.trim());
}

export async function captureDesktopWindows(): Promise<DesktopWindowSnapshot[]> {
  const payload = await capturePhysicalWindows();
  return normalizeWindowSnapshots(payload, process.pid, (rect) => screen.screenToDipRect(null, rect));
}
