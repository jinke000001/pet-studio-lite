'use strict';

function classifyUninstallSnapshot(snapshot = {}) {
  const problems = [];
  if (!Number.isInteger(snapshot.uninstallerExitCode)) problems.push('uninstaller exit code is not available');
  else if (snapshot.uninstallerExitCode !== 0) problems.push(`uninstaller exit code ${snapshot.uninstallerExitCode}`);
  if ((snapshot.registryViews || []).some((entry) => entry.exists)) problems.push('uninstall registry entry remains');
  if ((snapshot.installRegistryViews || []).some((entry) => entry.exists)) problems.push('install registry entry remains');
  if (snapshot.installDirectoryExists) problems.push('install directory remains');
  if ((snapshot.shortcutPaths || []).some((entry) => entry.exists)) problems.push('shortcut remains');
  if ((snapshot.productProcesses || []).length > 0) problems.push('product process remains');
  if ((snapshot.uninstallerProcesses || []).length > 0) problems.push('uninstaller process remains');
  if (Number.isInteger(snapshot.uninstallerExitCode) && snapshot.uninstallerExitCode !== 0) return { status: 'failed', problems };
  return { status: problems.length === 0 ? 'clean' : 'waiting', problems };
}

async function waitForUninstallCompletion(readSnapshot, {
  timeoutMs = 120000,
  intervalMs = 1000,
  stablePolls = 3,
  now = () => Date.now(),
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (typeof readSnapshot !== 'function') throw new Error('readSnapshot is required');
  if (!Number.isInteger(stablePolls) || stablePolls < 1) throw new Error('stablePolls must be a positive integer');
  const startedAt = now();
  let consecutiveClean = 0;
  let lastSnapshot = null;
  while (now() - startedAt <= timeoutMs) {
    lastSnapshot = await readSnapshot();
    const classification = classifyUninstallSnapshot(lastSnapshot);
    if (classification.status === 'failed') return { status: 'failed', stablePolls: 0, snapshot: lastSnapshot, problems: classification.problems };
    consecutiveClean = classification.status === 'clean' ? consecutiveClean + 1 : 0;
    if (consecutiveClean >= stablePolls) return { status: 'passed', stablePolls: consecutiveClean, snapshot: lastSnapshot, problems: [] };
    await delay(intervalMs);
  }
  const error = new Error('timed out waiting for stable official uninstall cleanup');
  error.code = 'TIMEOUT';
  error.lastSnapshot = lastSnapshot;
  throw error;
}

module.exports = { classifyUninstallSnapshot, waitForUninstallCompletion };
