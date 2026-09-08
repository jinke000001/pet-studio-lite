'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateEvidencePath } = require('./lab');
const STATUSES = ['running', 'paused', 'failed', 'passed'];
const IDENTITY_KEYS = ['sourceCommit', 'sourceZipSha256', 'acceptanceContractSha256', 'environmentFingerprint', 'candidateSha256'];
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function atomicWriteJson(filePath, value) { const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.renameSync(temporary, filePath); }
function createRun(input = {}) {
  const { runId = `run-${Date.now()}`, evidenceRoot, requiredGates = null, ...identity } = input;
  if (!evidenceRoot) throw new Error('evidenceRoot is required');
  if (identity.sourceCommit == null || identity.sourceZipSha256 == null || identity.acceptanceContractSha256 == null || identity.environmentFingerprint == null) throw new Error('complete run identity is required');
  const root = path.resolve(evidenceRoot, runId); if (fs.existsSync(root)) throw new Error(`run root already exists: ${root}`); fs.mkdirSync(root, { recursive: true });
  const state = { schemaVersion: 2, runId, overallStatus: 'running', ...Object.fromEntries(IDENTITY_KEYS.map((k) => [k, identity[k] ?? null])), requiredGates, gates: [], attempts: [], evidenceFiles: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  atomicWriteJson(path.join(root, 'acceptance-state.json'), state); return { root, state };
}
function loadRun(root) { const statePath = path.join(root, 'acceptance-state.json'); if (!fs.existsSync(statePath)) throw new Error('acceptance-state.json is missing'); return { root: path.resolve(root), state: JSON.parse(fs.readFileSync(statePath, 'utf8')) }; }
function assertTransition(from, to) { if (!STATUSES.includes(to)) throw new Error(`unknown state: ${to}`); if (from === 'passed' || from === 'failed') throw new Error(`terminal state ${from} cannot resume`); }
function updateRun(root, patch) { const run = loadRun(root); const nextStatus = patch.overallStatus || run.state.overallStatus; assertTransition(run.state.overallStatus, nextStatus); const next = { ...run.state, ...patch, overallStatus: nextStatus, updatedAt: new Date().toISOString() }; atomicWriteJson(path.join(run.root, 'acceptance-state.json'), next); return next; }
function recordGate(root, gate, { evidenceRoot = root } = {}) {
  const run = loadRun(root); if (run.state.overallStatus !== 'running') throw new Error('gates can only be recorded while running');
  if (!gate || typeof gate.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(gate.id)) throw new Error('gate id is required and must be path-safe');
  const attemptNumber = run.state.attempts.filter((entry) => entry.id === gate.id).length + 1; const attemptDir = path.join(run.root, 'attempts', gate.id, String(attemptNumber));
  if (fs.existsSync(attemptDir)) throw new Error(`attempt directory already exists: ${attemptDir}`);
  const sourcePaths = (gate.evidencePaths || []).map((sourceRelative) => {
    if (!validateEvidencePath(evidenceRoot, sourceRelative)) throw new Error(`invalid evidence path: ${sourceRelative}`);
    return { sourceRelative, normalized: sourceRelative.replace(/\\/g, '/') };
  });
  const stagingDir = `${attemptDir}.tmp-${process.pid}-${Date.now()}`; fs.mkdirSync(stagingDir, { recursive: true });
  try {
    for (const { normalized } of sourcePaths) { const target = path.join(stagingDir, ...normalized.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(evidenceRoot, ...normalized.split('/')), target); }
    fs.renameSync(stagingDir, attemptDir);
  } catch (error) { fs.rmSync(stagingDir, { recursive: true, force: true }); throw error; }
  const evidencePaths = sourcePaths.map(({ normalized }) => path.relative(run.root, path.join(attemptDir, ...normalized.split('/'))).replace(/\\/g, '/'));
  const attempt = { id: gate.id, attempt: attemptNumber, startedAt: gate.startedAt || new Date().toISOString(), endedAt: gate.endedAt || new Date().toISOString(), durationMs: gate.durationMs ?? 0, exitCode: Number.isInteger(gate.exitCode) ? gate.exitCode : 1, status: gate.status || 'failed', command: typeof gate.command === 'string' ? gate.command : '', evidencePaths, evidenceSha256: {}, evidenceMeta: {} };
  for (const relativePath of evidencePaths) { const filePath = path.join(run.root, relativePath.split('/').join(path.sep)); const stat = fs.statSync(filePath); attempt.evidenceSha256[relativePath] = digest(fs.readFileSync(filePath)); attempt.evidenceMeta[relativePath] = { size: stat.size, recordedAt: new Date().toISOString() }; }
  const next = { ...run.state, gates: run.state.gates.filter((entry) => entry.id !== attempt.id).concat(attempt), attempts: [...run.state.attempts, attempt], evidenceFiles: [...new Set([...run.state.evidenceFiles, ...evidencePaths])], firstFailedGate: attempt.status === 'failed' ? (run.state.firstFailedGate || attempt.id) : (run.state.firstFailedGate || null), updatedAt: new Date().toISOString() }; atomicWriteJson(path.join(run.root, 'acceptance-state.json'), next); return attempt;
}
function pauseRun(root, { pauseReason, nextStep, unfinishedGates = [] } = {}) { if (!pauseReason || !nextStep || !Array.isArray(unfinishedGates)) throw new Error('pauseReason, nextStep and unfinishedGates are required'); return updateRun(root, { overallStatus: 'paused', pauseReason, nextStep, unfinishedGates }); }
function verifyEvidence(run) { for (const gate of run.state.attempts || []) for (const file of gate.evidencePaths || []) { const target = path.join(run.root, file.split('/').join(path.sep)); if (!fs.existsSync(target) || digest(fs.readFileSync(target)) !== gate.evidenceSha256[file]) throw new Error(`evidence hash changed: ${file}`); } }
function resumeRun(root, identity = {}) { const run = loadRun(root); if (run.state.overallStatus !== 'paused') throw new Error('only paused runs can resume'); for (const key of IDENTITY_KEYS) if (!Object.prototype.hasOwnProperty.call(identity, key) || identity[key] !== run.state[key]) throw new Error(`run identity is incomplete or changed: ${key}`); verifyEvidence(run); return updateRun(root, { overallStatus: 'running', pauseReason: null, nextStep: null }); }
function finalizeRun(root, options = {}) {
  const run = loadRun(root); if (run.state.overallStatus !== 'running') throw new Error(`terminal state ${run.state.overallStatus} cannot finalize`); verifyEvidence(run);
  if (!/^[0-9a-f]{64}$/.test(options.candidateSha256 || '')) throw new Error('candidateSha256 is required before finalize');
  const requiredGates = run.state.requiredGates || options.requiredGates; if (!Array.isArray(requiredGates) || requiredGates.length < 60) throw new Error('authoritative required gates must contain at least 60 gates');
  const ids = requiredGates.map((g) => typeof g === 'string' ? g : g.id); if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('authoritative required gates must be unique named gates');
  const byId = new Map(run.state.gates.map((gate) => [gate.id, gate])); const missing = ids.filter((id) => !byId.has(id) || byId.get(id).status !== 'passed' || byId.get(id).exitCode !== 0); if (missing.length) throw new Error(`cannot finalize: required gates incomplete: ${missing.join(', ')}`);
  if (options.originalDisplayScale !== options.finalDisplayScale) throw new Error('display scale was not restored'); if (options.cleanupStatus !== 'passed' || options.finalProcesses?.length) throw new Error('cleanup is incomplete');
  if (run.state.continuation) {
    const continuation = run.state.continuation;
    if (continuation.candidateSha256 !== options.candidateSha256 || run.state.candidateSha256 !== options.candidateSha256) throw new Error('candidateSha256 does not match the bound continuation candidate');
    for (const gate of run.state.gates) {
      if (gate.inherited !== true) continue;
      if (gate.parentRunId !== continuation.parentRunId || gate.parentReturnSha256 !== continuation.parentReturnSha256) throw new Error(`inherited gate ${gate.id} does not match the continuation parent binding`);
      if (!Number.isInteger(gate.attempt) || gate.attempt < 1) throw new Error(`inherited gate ${gate.id} must record the original parent attempt`);
      if (!Array.isArray(gate.parentEvidencePaths) || gate.parentEvidencePaths.length === 0) throw new Error(`inherited gate ${gate.id} must record parent evidence paths`);
    }
    require('./continuation').verifyContinuationBinding(run.state);
  }
  const next = { ...run.state, overallStatus: 'passed', candidateSha256: options.candidateSha256, originalDisplayScale: options.originalDisplayScale, finalDisplayScale: options.finalDisplayScale, cleanupStatus: options.cleanupStatus, finalProcesses: options.finalProcesses || [], firstFailedGate: null, updatedAt: new Date().toISOString() };
  atomicWriteJson(path.join(run.root, 'acceptance-state.json'), next);
  atomicWriteJson(path.join(run.root, 'final-report.json'), { runId: next.runId, overallStatus: 'passed', gateCount: ids.length, candidateSha256: next.candidateSha256, generatedAt: new Date().toISOString() });
  const files = []; const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => { const rel = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) walk(path.join(dir, entry.name), rel); else if (rel !== 'returned-checksums.sha256') files.push(rel); }); walk(run.root);
  fs.writeFileSync(path.join(run.root, 'returned-checksums.sha256'), `${files.sort().map((file) => `${digest(fs.readFileSync(path.join(run.root, file.split('/').join(path.sep))))}  ${file}`).join('\n')}\n`, 'utf8');
  return next;
}
module.exports = { STATUSES, atomicWriteJson, createRun, finalizeRun, loadRun, pauseRun, recordGate, resumeRun, updateRun, verifyEvidence };
