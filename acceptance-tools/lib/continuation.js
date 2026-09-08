'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, createRun, loadRun } = require('./gates');

const HEX_64 = /^[0-9a-f]{64}$/;
const CHECKSUM_LINE = /^([0-9a-f]{64})  (\S+)$/;
const CONTINUABLE_PARENT_STATUSES = ['failed', 'environment-blocked'];
const IDENTITY_KEYS = ['sourceCommit', 'sourceZipSha256', 'acceptanceContractSha256', 'environmentFingerprint'];

function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

function readJsonFile(filePath, label) {
  let raw;
  try { raw = fs.readFileSync(filePath); } catch { throw new Error(`${label} is missing: ${filePath}`); }
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) throw new Error(`${label} must not have a UTF-8 BOM: ${filePath}`);
  try { return JSON.parse(raw.toString('utf8')); } catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function listFilesRecursive(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFilesRecursive(path.join(directory, entry.name), relativePath) : [relativePath];
  });
}

function verifyChecksumManifest(returnDir) {
  const manifestPath = path.join(returnDir, 'returned-checksums.sha256');
  if (!fs.existsSync(manifestPath)) throw new Error(`parent RETURN is missing returned-checksums.sha256: ${returnDir}`);
  const raw = fs.readFileSync(manifestPath);
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) throw new Error('parent returned-checksums.sha256 must not have a UTF-8 BOM');
  if (raw.includes(0x0d)) throw new Error('parent returned-checksums.sha256 must use LF line endings only');
  const lines = raw.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const entries = new Map();
  for (const [index, line] of lines.entries()) {
    const match = CHECKSUM_LINE.exec(line);
    if (!match) throw new Error(`parent returned-checksums.sha256 line ${index + 1} has an invalid format`);
    const relativePath = match[2].replace(/\\/g, '/');
    if (relativePath === 'returned-checksums.sha256') throw new Error('parent returned-checksums.sha256 must not list itself');
    if (entries.has(relativePath)) throw new Error(`parent returned-checksums.sha256 has a duplicate entry: ${relativePath}`);
    entries.set(relativePath, match[1]);
  }
  const actualFiles = listFilesRecursive(returnDir).filter((relativePath) => relativePath !== 'returned-checksums.sha256');
  const listed = [...entries.keys()];
  const missingEntries = actualFiles.filter((file) => !entries.has(file));
  const extraEntries = listed.filter((file) => !actualFiles.includes(file));
  if (missingEntries.length > 0 || extraEntries.length > 0) {
    throw new Error(`parent returned-checksums.sha256 coverage mismatch: missing=[${missingEntries.join(', ')}] extra=[${extraEntries.join(', ')}]`);
  }
  for (const [relativePath, expected] of entries) {
    const target = path.join(returnDir, ...relativePath.split('/'));
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`parent RETURN entry must be a regular file: ${relativePath}`);
    const actual = sha256File(target);
    if (actual !== expected) throw new Error(`parent RETURN evidence hash changed: ${relativePath}`);
  }
  if (!entries.has('acceptance-state.json')) throw new Error('parent returned-checksums.sha256 does not cover acceptance-state.json');
  return { entries, manifestSha256: sha256File(manifestPath) };
}

function findGateEvidenceFile(parentRoot, gate, suffix) {
  const match = (gate.evidencePaths || []).find((relativePath) => relativePath.replace(/\\/g, '/').endsWith(suffix));
  if (!match) return null;
  return path.join(parentRoot, ...match.replace(/\\/g, '/').split('/'));
}

function installerArtifactSha256(artifacts, label) {
  if (!Array.isArray(artifacts)) throw new Error(`${label} does not list build artifacts`);
  const installers = artifacts.filter((artifact) => artifact
    && typeof artifact.path === 'string' && /\.exe$/i.test(artifact.path) && !/win-unpacked/i.test(artifact.path.replace(/\\/g, '/')));
  if (installers.length !== 1) throw new Error(`${label} must contain exactly one NSIS installer artifact`);
  const sha256 = installers[0].sha256;
  if (typeof sha256 !== 'string' || !HEX_64.test(sha256)) throw new Error(`${label} installer artifact has no valid SHA-256`);
  return sha256;
}

function deriveCandidateSha256(parentState, parentRoot = null) {
  const gates = Array.isArray(parentState.gates) ? parentState.gates : [];
  const buildGate = gates.find((gate) => gate.id === 'G5-12-candidate-build-source' && gate.status === 'passed');
  const installGate = gates.find((gate) => gate.id === 'G7-01-install' && gate.status === 'passed');
  if (!buildGate || !installGate) throw new Error('cannot derive candidate SHA-256: passed G5-12 candidate build and G7-01 install gates are required');
  if (!parentRoot) throw new Error('cannot derive candidate SHA-256 without the parent RETURN directory');
  const manifestPath = findGateEvidenceFile(parentRoot, buildGate, 'candidate-manifest.json');
  const artifactsPath = findGateEvidenceFile(parentRoot, buildGate, 'build-artifacts.json');
  const preflightPath = findGateEvidenceFile(parentRoot, installGate, 'install-preflight.json');
  if (!manifestPath || !artifactsPath || !preflightPath) {
    throw new Error('cannot derive candidate SHA-256: candidate manifest, build-artifacts or install preflight evidence is missing');
  }
  const manifest = readJsonFile(manifestPath, 'candidate manifest');
  const buildArtifacts = readJsonFile(artifactsPath, 'build-artifacts');
  const preflight = readJsonFile(preflightPath, 'install preflight');
  const manifestSha256 = installerArtifactSha256(manifest.artifacts, 'candidate manifest');
  const artifactSha256 = installerArtifactSha256(buildArtifacts.files, 'build-artifacts');
  const installerSha256 = preflight.installerSha256;
  if (typeof installerSha256 !== 'string' || !HEX_64.test(installerSha256)) throw new Error('G7-01 install preflight has no valid installerSha256');
  if (manifestSha256 !== artifactSha256 || manifestSha256 !== installerSha256) {
    throw new Error(`candidate SHA-256 mismatch: manifest=${manifestSha256} artifacts=${artifactSha256} install=${installerSha256}`);
  }
  if (parentState.candidateSha256 != null && parentState.candidateSha256 !== manifestSha256) {
    throw new Error(`parent state candidateSha256 ${parentState.candidateSha256} disagrees with the derived candidate SHA-256 ${manifestSha256}`);
  }
  return manifestSha256;
}

function gateIdentityProblems(parentState, identity) {
  return IDENTITY_KEYS.filter((key) => identity[key] == null || identity[key] !== parentState[key]);
}

function isInheritableGate(gate, manifestEntries) {
  if (!gate || gate.status !== 'passed' || gate.exitCode !== 0) return false;
  if (!Number.isInteger(gate.attempt) || gate.attempt < 1) return false;
  const evidencePaths = Array.isArray(gate.evidencePaths) ? gate.evidencePaths : [];
  if (evidencePaths.length === 0) return false;
  const hashes = gate.evidenceSha256 && typeof gate.evidenceSha256 === 'object' ? gate.evidenceSha256 : {};
  return evidencePaths.every((relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/');
    return HEX_64.test(hashes[relativePath] || '') && manifestEntries.get(normalized) === hashes[relativePath];
  });
}

function loadVerifiedParent(parentReturnDir) {
  if (typeof parentReturnDir !== 'string' || parentReturnDir.length === 0) throw new Error('parent RETURN directory must be provided explicitly');
  const root = path.resolve(parentReturnDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`parent RETURN directory not found: ${root}`);
  const { entries, manifestSha256 } = verifyChecksumManifest(root);
  const state = readJsonFile(path.join(root, 'acceptance-state.json'), 'parent acceptance-state.json');
  return { root, state, manifestEntries: entries, parentReturnSha256: manifestSha256 };
}

function assertContinuableParent(parent) {
  const status = parent.state.overallStatus;
  if (status === 'paused') throw new Error('parent run is paused: use resumeRun with the full identity instead of a continuation');
  if (!CONTINUABLE_PARENT_STATUSES.includes(status)) {
    throw new Error(`parent run overallStatus=${status} cannot be continued: only failed or environment-blocked runs qualify`);
  }
  const missing = IDENTITY_KEYS.filter((key) => parent.state[key] == null);
  if (missing.length > 0) {
    throw new Error(`parent RETURN has an incomplete identity and cannot anchor a continuation: ${missing.join(', ')}`);
  }
}

function createContinuationRun({ parentReturnDir, evidenceRoot, runId, identity = {}, currentEnvironmentFingerprint = null } = {}) {
  if (!evidenceRoot) throw new Error('evidenceRoot is required');
  for (const key of [...IDENTITY_KEYS]) {
    if (identity[key] == null) throw new Error(`continuation identity is incomplete: ${key} is required`);
  }
  const parent = loadVerifiedParent(parentReturnDir);
  assertContinuableParent(parent);
  const mismatched = gateIdentityProblems(parent.state, identity);
  if (mismatched.length > 0) throw new Error(`continuation identity does not match the parent RETURN: ${mismatched.join(', ')}`);
  const expectedFingerprint = identity.environmentFingerprint;
  if (currentEnvironmentFingerprint != null && currentEnvironmentFingerprint !== expectedFingerprint) {
    throw new Error(`current environmentFingerprint ${currentEnvironmentFingerprint} does not match the expected ${expectedFingerprint}: continuation requires the same machine`);
  }
  const candidateSha256 = deriveCandidateSha256(parent.state, parent.root);
  if (identity.candidateSha256 != null && identity.candidateSha256 !== candidateSha256) {
    throw new Error(`candidateSha256 expectation ${identity.candidateSha256} does not match the derived candidate SHA-256 ${candidateSha256}`);
  }
  const parentGates = Array.isArray(parent.state.gates) ? parent.state.gates : [];
  const inherited = [];
  const notInheritedGates = [];
  for (const gate of parentGates) {
    if (isInheritableGate(gate, parent.manifestEntries)) {
      inherited.push({
        id: gate.id,
        status: 'passed',
        inherited: true,
        command: `inherited from parent run ${parent.state.runId} attempt ${gate.attempt}`,
        attempt: gate.attempt,
        startedAt: gate.startedAt,
        endedAt: gate.endedAt,
        durationMs: gate.durationMs ?? 0,
        exitCode: 0,
        evidencePaths: [],
        evidenceSha256: {},
        parentRunId: parent.state.runId,
        parentReturnSha256: parent.parentReturnSha256,
        parentEvidencePaths: gate.evidencePaths.map((entry) => entry.replace(/\\/g, '/')),
        parentEvidenceSha256: { ...gate.evidenceSha256 },
      });
    } else {
      notInheritedGates.push({ id: gate.id, status: gate.status, exitCode: gate.exitCode });
    }
  }
  if (parent.state.firstFailedGate && inherited.some((gate) => gate.id === parent.state.firstFailedGate)) {
    throw new Error(`parent firstFailedGate ${parent.state.firstFailedGate} must never be inherited as passed`);
  }
  const requiredGates = Array.isArray(parent.state.requiredGates) ? parent.state.requiredGates : null;
  const run = createRun({
    runId: runId || `run-${Date.now()}-continuation`,
    evidenceRoot,
    requiredGates,
    sourceCommit: parent.state.sourceCommit,
    sourceZipSha256: parent.state.sourceZipSha256,
    acceptanceContractSha256: parent.state.acceptanceContractSha256,
    environmentFingerprint: parent.state.environmentFingerprint,
    candidateSha256,
  });
  const state = {
    ...run.state,
    gates: inherited,
    continuation: {
      parentRunId: parent.state.runId,
      parentReturnDir: parent.root,
      parentReturnSha256: parent.parentReturnSha256,
      parentOverallStatus: parent.state.overallStatus,
      parentFirstFailedGate: parent.state.firstFailedGate || null,
      parentOriginalDisplayScale: parent.state.originalDisplayScale ?? null,
      inheritedGateIds: inherited.map((gate) => gate.id),
      notInheritedGates,
      candidateSha256,
      createdAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(path.join(run.root, 'acceptance-state.json'), state);
  return { root: run.root, state, inheritedGateIds: state.continuation.inheritedGateIds, notInheritedGates, parentReturnSha256: parent.parentReturnSha256, candidateSha256 };
}

function verifyContinuationBinding(state) {
  const continuation = state && state.continuation;
  if (!continuation || typeof continuation !== 'object') throw new Error('continuation binding is missing');
  if (typeof continuation.parentRunId !== 'string' || continuation.parentRunId.length === 0) throw new Error('continuation parentRunId is required');
  if (typeof continuation.parentReturnSha256 !== 'string' || !HEX_64.test(continuation.parentReturnSha256)) throw new Error('continuation parentReturnSha256 must be a 64 lowercase hex digest');
  if (typeof continuation.parentReturnDir !== 'string' || continuation.parentReturnDir.length === 0) throw new Error('continuation parentReturnDir is required');
  const parent = loadVerifiedParent(continuation.parentReturnDir);
  if (parent.parentReturnSha256 !== continuation.parentReturnSha256) throw new Error('parent RETURN checksum digest changed since the continuation was created');
  if (parent.state.runId !== continuation.parentRunId) throw new Error('parent RETURN runId changed since the continuation was created');
  const mismatched = gateIdentityProblems(parent.state, state);
  if (mismatched.length > 0) throw new Error(`parent RETURN identity no longer matches the continuation: ${mismatched.join(', ')}`);
  const derived = deriveCandidateSha256(parent.state, parent.root);
  if (derived !== continuation.candidateSha256) throw new Error('parent candidate evidence no longer matches the bound candidateSha256');
  const parentPassed = new Map((parent.state.gates || []).filter((gate) => isInheritableGate(gate, parent.manifestEntries)).map((gate) => [gate.id, gate]));
  for (const gate of state.gates || []) {
    if (gate.inherited !== true) continue;
    const parentGate = parentPassed.get(gate.id);
    if (!parentGate) throw new Error(`inherited gate ${gate.id} is not backed by a verified parent passed gate`);
    if (gate.attempt !== parentGate.attempt) throw new Error(`inherited gate ${gate.id} attempt does not match the parent record`);
    for (const [relativePath, hash] of Object.entries(gate.parentEvidenceSha256 || {})) {
      if (parentGate.evidenceSha256[relativePath] !== hash) throw new Error(`inherited gate ${gate.id} evidence hash drifted: ${relativePath}`);
    }
  }
  return parent;
}

function renderContinuationReportTemplate({ gates, inheritedGateIds, parentRunId, parentReturnSha256, parentFirstFailedGate = null, candidateSha256, originalDisplayScale = null } = {}) {
  if (!Array.isArray(gates) || gates.length === 0) throw new Error('continuation report requires the contract gate list');
  const gateIds = gates.map((gate) => gate && gate.id);
  if (gateIds.some((id) => typeof id !== 'string' || id.length === 0) || new Set(gateIds).size !== gateIds.length) {
    throw new Error('continuation report gate ids must be non-empty and unique');
  }
  if (!Array.isArray(inheritedGateIds)) throw new Error('continuation report requires inheritedGateIds');
  if (new Set(inheritedGateIds).size !== inheritedGateIds.length) throw new Error('continuation report inherited gates contain a duplicate');
  const unknown = inheritedGateIds.filter((id) => !gateIds.includes(id));
  if (unknown.length > 0) throw new Error(`continuation report references unknown inherited gate: ${unknown.join(', ')}`);
  const inherited = new Set(inheritedGateIds);
  const pendingCount = gateIds.length - inherited.size;
  const rows = gates.map((gate) => {
    const status = inherited.has(gate.id) ? 'inherited' : '待执行';
    return `| ${gate.id} | ${gate.mode} | ${gate.passCriteria} | ${status} | |`;
  }).join('\n');
  const scale = originalDisplayScale || '<填写>';
  return `# Windows 续验报告（continuation）

- 父 runId：\`${parentRunId}\`
- 父 RETURN checksum 摘要：\`${parentReturnSha256}\`
- 继承门（${inherited.size}，inherited passed，证据哈希经父 RETURN 全量复核）：见验证器 summary.inherited
- 从 \`${parentFirstFailedGate || '<首个待执行门>'}\` 开始重试；父失败记录保持 failed，不改写。
- 本轮实际执行门：见验证器 summary.executed（应为 ${pendingCount}）
- 候选 SHA-256：\`${candidateSha256}\`
- 未执行门：见验证器 summary.unexecuted（通过时必须为空）
- 缩放恢复：原始 ${scale} → 最终 <填写>；最终产品/工具进程数：<填写>

| 门 | 模式 | 通过条件 | 本轮状态（inherited/executed/not-executed/failed） | 备注 |
| --- | --- | --- | --- | --- |
${rows}

结论必须三选一：Windows installed-mode 通过 / Windows 验收失败 / Windows 验收未完成（continuation-rejected 属于未完成）。完整性（integrityValid）与验收结论（acceptancePassed）分别报告。`;
}

module.exports = { createContinuationRun, deriveCandidateSha256, isInheritableGate, loadVerifiedParent, renderContinuationReportTemplate, verifyChecksumManifest, verifyContinuationBinding };
