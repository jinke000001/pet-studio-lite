'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateEvidencePath } = require('./lab');

const STATUSES = ['running', 'paused', 'failed', 'passed'];
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function atomicWriteJson(filePath, value) { const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.renameSync(temporary, filePath); }
function createRun({ runId = `run-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`, sourceCommit, sourceZipSha256, acceptanceContractSha256, environmentFingerprint, candidateSha256 = null, evidenceRoot }) {
  if (!evidenceRoot) throw new Error('evidenceRoot is required');
  const root = path.resolve(evidenceRoot, runId); if (fs.existsSync(root)) throw new Error(`run root already exists: ${root}`); fs.mkdirSync(root, { recursive: true });
  const state = { schemaVersion: 1, runId, overallStatus: 'running', sourceCommit: sourceCommit || null, sourceZipSha256: sourceZipSha256 || null, acceptanceContractSha256: acceptanceContractSha256 || null, environmentFingerprint: environmentFingerprint || null, candidateSha256, gates: [], attempts: [], evidenceFiles: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  atomicWriteJson(path.join(root, 'acceptance-state.json'), state); return { root, state };
}
function loadRun(root) { const statePath = path.join(root, 'acceptance-state.json'); if (!fs.existsSync(statePath)) throw new Error('acceptance-state.json is missing'); return { root: path.resolve(root), state: JSON.parse(fs.readFileSync(statePath, 'utf8')) }; }
function assertTransition(from, to) { if (!STATUSES.includes(to)) throw new Error(`unknown state: ${to}`); if (from === 'passed' || from === 'failed') throw new Error(`terminal state ${from} cannot resume`); }
function updateRun(root, patch) { const run = loadRun(root); const nextStatus = patch.overallStatus || run.state.overallStatus; assertTransition(run.state.overallStatus, nextStatus); const next = { ...run.state, ...patch, overallStatus: nextStatus, updatedAt: new Date().toISOString() }; atomicWriteJson(path.join(run.root, 'acceptance-state.json'), next); return next; }
function recordGate(root, gate, { evidenceRoot = root } = {}) {
  const run = loadRun(root); if (run.state.overallStatus !== 'running') throw new Error('gates can only be recorded while running');
  if (!gate || typeof gate.id !== 'string' || !gate.id) throw new Error('gate id is required');
  const attempt = { id: gate.id, attempt: run.state.attempts.filter((entry) => entry.id === gate.id).length + 1, startedAt: gate.startedAt || new Date().toISOString(), endedAt: gate.endedAt || new Date().toISOString(), durationMs: gate.durationMs ?? 0, exitCode: Number.isInteger(gate.exitCode) ? gate.exitCode : 1, status: gate.status || 'failed', evidencePaths: gate.evidencePaths || [], evidenceSha256: {} };
  for (const relativePath of attempt.evidencePaths) { if (!validateEvidencePath(evidenceRoot, relativePath)) throw new Error(`invalid evidence path: ${relativePath}`); const filePath = path.join(evidenceRoot, ...relativePath.replace(/\\/g, '/').split('/')); attempt.evidenceSha256[relativePath] = digest(fs.readFileSync(filePath)); }
  const next = { ...run.state, gates: [...run.state.gates, attempt], attempts: [...run.state.attempts, attempt], evidenceFiles: [...new Set([...run.state.evidenceFiles, ...attempt.evidencePaths])], updatedAt: new Date().toISOString() }; atomicWriteJson(path.join(run.root, 'acceptance-state.json'), next); return attempt;
}
function pauseRun(root, { pauseReason, nextStep, unfinishedGates = [] } = {}) { if (!pauseReason || !nextStep) throw new Error('pauseReason and nextStep are required'); return updateRun(root, { overallStatus: 'paused', pauseReason, nextStep, unfinishedGates }); }
function resumeRun(root, identity) { const run = loadRun(root); if (run.state.overallStatus !== 'paused') throw new Error('only paused runs can resume'); for (const key of ['sourceCommit', 'sourceZipSha256', 'acceptanceContractSha256', 'environmentFingerprint', 'candidateSha256']) if (identity[key] !== undefined && identity[key] !== run.state[key]) throw new Error(`run identity changed: ${key}`); return updateRun(root, { overallStatus: 'running', pauseReason: null, nextStep: null }); }
function finalizeRun(root, { requiredGates, candidateSha256, finalDisplayScale, originalDisplayScale, cleanupStatus, finalProcesses = [] } = {}) {
  const run = loadRun(root); if (run.state.overallStatus !== 'running') throw new Error(`terminal state ${run.state.overallStatus} cannot finalize`); const gates = run.state.gates; const byId = new Map(gates.map((gate) => [gate.id, gate])); const missing = (requiredGates || []).filter((id) => !byId.has(id) || byId.get(id).status !== 'passed');
  if (!candidateSha256) throw new Error('candidateSha256 is required before finalize'); if (missing.length) throw new Error(`cannot finalize: required gates incomplete: ${missing.join(', ')}`); if (originalDisplayScale !== finalDisplayScale) throw new Error('display scale was not restored'); if (cleanupStatus !== 'passed' || finalProcesses.length) throw new Error('cleanup is incomplete');
  return updateRun(root, { overallStatus: 'passed', candidateSha256, originalDisplayScale, finalDisplayScale, cleanupStatus, finalProcesses, firstFailedGate: null });
}
module.exports = { STATUSES, atomicWriteJson, createRun, finalizeRun, loadRun, pauseRun, recordGate, resumeRun, updateRun };
