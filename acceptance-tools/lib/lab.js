'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

function platformResult(operation, extra = {}) { return { operation, status: 'platform-unavailable', platform: process.platform, ...extra }; }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function cleanElectronEnv(env = process.env) {
  const result = { ...env }; delete result.ELECTRON_RUN_AS_NODE; delete result.NODE_OPTIONS;
  return result;
}
function run(command, args = [], options = {}) {
  return childProcess.spawnSync(command, args, { encoding: 'utf8', windowsHide: true, env: cleanElectronEnv(options.env), timeout: options.timeoutMs || 30000, ...options });
}
function processSnapshot() {
  if (process.platform !== 'win32') return platformResult('process-snapshot', { processes: [] });
  const result = run('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'], { timeoutMs: 15000 });
  if (result.status !== 0) return { operation: 'process-snapshot', status: 'operation-failed', stderr: result.stderr || null };
  let processes = []; try { processes = JSON.parse(result.stdout || '[]'); if (!Array.isArray(processes)) processes = [processes]; } catch (error) { return { operation: 'process-snapshot', status: 'operation-failed', error: error.message }; }
  return { operation: 'process-snapshot', status: 'ok', processes };
}
function displaySnapshot() {
  if (process.platform !== 'win32') return platformResult('display-snapshot');
  const command = 'Get-CimInstance Win32_DesktopMonitor | Select-Object DeviceID,ScreenWidth,ScreenHeight,PixelsPerXLogicalInch,PixelsPerYLogicalInch | ConvertTo-Json -Compress';
  const result = run('powershell.exe', ['-NoProfile', '-Command', command]);
  if (result.status !== 0) return { operation: 'display-snapshot', status: 'operation-failed', stderr: result.stderr || null };
  try { return { operation: 'display-snapshot', status: 'ok', monitors: JSON.parse(result.stdout || '[]') }; } catch (error) { return { operation: 'display-snapshot', status: 'operation-failed', error: error.message }; }
}
function captureScreenshot(outputPath, windowHandle = null) {
  if (process.platform !== 'win32') return platformResult('screenshot', { outputPath });
  const script = windowHandle ? `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds` : '$null';
  const result = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `if (-not (Test-Path -LiteralPath '${String(outputPath).replace(/'/g, "''")}')) { exit 2 }; ${script}`]);
  if (result.status !== 0) return { operation: 'screenshot', status: 'operation-failed', exitCode: result.status, stderr: result.stderr || null };
  return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0 ? { operation: 'screenshot', status: 'ok', outputPath, sha256: sha256File(outputPath) } : { operation: 'screenshot', status: 'operation-failed', error: 'screenshot file is missing or empty' };
}
function classifyDialogResult({ status, exitCode, timedOut = false, manual = false } = {}) {
  if (manual) return 'manual-continuation'; if (timedOut) return 'timeout'; if (status === 'platform-unavailable') return 'platform-unavailable'; if (exitCode === 0) return 'passed'; return 'operation-failed';
}
function validateEvidencePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || /^[A-Za-z]:[\\/]/.test(relativePath)) return false;
  const normalized = relativePath.replace(/\\/g, '/'); if (normalized.split('/').some((part) => !part || part === '..')) return false;
  const candidate = path.resolve(root, ...normalized.split('/')); const rootReal = fs.realpathSync(root);
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && fs.realpathSync(candidate).startsWith(`${rootReal}${path.sep}`); } catch { return false; }
}
function environmentFingerprint() { return `${process.platform}-${process.arch}-${os.release()}-node${process.versions.node}`; }

module.exports = { captureScreenshot, classifyDialogResult, cleanElectronEnv, displaySnapshot, environmentFingerprint, platformResult, processSnapshot, run, sha256File, validateEvidencePath };
