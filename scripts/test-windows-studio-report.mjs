import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Windows uses the same 5.1 engine as the acceptance entrypoint. Mac developers
// may point PETSTUDIO_PWSH at a portable pwsh; that is not a Windows-native pass.
const executable = process.platform === 'win32' ? 'powershell.exe' : process.env.PETSTUDIO_PWSH || 'pwsh';
const script = fileURLToPath(new URL('./test-windows-studio-report.ps1', import.meta.url));
const result = spawnSync(executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  shell: false, windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error || result.signal || result.status !== 0) {
  console.error(result.error?.message || `Report regression failed: ${result.signal || result.status}`);
  process.exitCode = 1;
}
