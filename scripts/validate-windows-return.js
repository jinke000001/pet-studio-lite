#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'acceptance-state.json';
const CHECKSUMS_FILE = 'returned-checksums.sha256';

const OVERALL_STATUSES = ['passed', 'failed', 'environment-blocked', 'paused'];
const GATE_STATUSES = ['passed', 'failed', 'not-executed', 'environment-blocked'];
const CLEANUP_STATUSES = ['passed', 'failed'];
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const CHECKSUM_LINE = /^([0-9a-f]{64})  (\S+)$/;

const USAGE = [
  'Usage: node scripts/validate-windows-return.js <returnDir>',
  '  --expect-source-commit <hex40> --expect-source-zip-sha256 <hex64>',
  '  [--expect-candidate-sha256 <hex64>] --required-gates <id1,id2,...>',
  '  [--expect-contract-sha256 <hex64>]',
  '  [--expect-environment-fingerprint <value>]',
  '  [--expect-process-paths <path1,path2,...>] [--output <path>] [--json]',
  '',
  '--output writes the validator report to a derived file. The path must be',
  'outside <returnDir>: validator output is derived data and must never enter',
  'the RETURN checksum closure.',
].join('\n');

const FLAG_TARGETS = {
  '--expect-source-commit': 'expectSourceCommit',
  '--expect-source-zip-sha256': 'expectSourceZipSha256',
  '--expect-candidate-sha256': 'expectCandidateSha256',
  '--required-gates': 'requiredGatesCsv',
  '--expect-process-paths': 'expectProcessPathsCsv',
  '--expect-contract-sha256': 'expectContractSha256',
  '--expect-environment-fingerprint': 'expectEnvironmentFingerprint',
  '--output': 'outputPath',
};

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function isSafeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) return false;
  return !relativePath.split(/[\\/]+/).some((segment) => segment === '..' || segment.length === 0);
}

function resolveInside(returnDir, relativePath) {
  if (!isSafeRelativePath(relativePath)) return null;
  return path.join(returnDir, ...relativePath.split(/[\\/]+/));
}

function parseArguments(argv) {
  const options = {
    returnDir: null,
    expectSourceCommit: null,
    expectSourceZipSha256: null,
    expectCandidateSha256: null,
    expectContractSha256: null,
    expectEnvironmentFingerprint: null,
    requiredGates: [],
    expectProcessPaths: [],
    outputPath: null,
    json: false,
  };
  const raw = { requiredGatesCsv: null, expectProcessPathsCsv: null, expectContractSha256: null, expectEnvironmentFingerprint: null, outputPath: null };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (Object.hasOwn(FLAG_TARGETS, argument)) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`missing value for ${argument}`);
      raw[FLAG_TARGETS[argument]] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`unknown option: ${argument}`);
    positionals.push(argument);
  }
  if (positionals.length !== 1) throw new Error('exactly one RETURN directory argument is required');
  options.returnDir = positionals[0];
  if (!raw.expectSourceCommit || !HEX_40.test(raw.expectSourceCommit)) {
    throw new Error('--expect-source-commit must be 40 lowercase hex characters');
  }
  if (!raw.expectSourceZipSha256 || !HEX_64.test(raw.expectSourceZipSha256)) {
    throw new Error('--expect-source-zip-sha256 must be 64 lowercase hex characters');
  }
  if (raw.expectCandidateSha256 && !HEX_64.test(raw.expectCandidateSha256)) {
    throw new Error('--expect-candidate-sha256 must be 64 lowercase hex characters');
  }
  if (raw.expectContractSha256 && !HEX_64.test(raw.expectContractSha256)) {
    throw new Error('--expect-contract-sha256 must be 64 lowercase hex characters');
  }
  if (!raw.requiredGatesCsv) throw new Error('--required-gates is required');
  options.requiredGates = raw.requiredGatesCsv.split(',').map((gate) => gate.trim()).filter(Boolean);
  if (options.requiredGates.length === 0) throw new Error('--required-gates must list at least one gate id');
  options.expectSourceCommit = raw.expectSourceCommit;
  options.expectSourceZipSha256 = raw.expectSourceZipSha256;
  options.expectCandidateSha256 = raw.expectCandidateSha256 || null;
  options.expectContractSha256 = raw.expectContractSha256 || null;
  options.expectEnvironmentFingerprint = raw.expectEnvironmentFingerprint || null;
  options.expectProcessPaths = (raw.expectProcessPathsCsv || '')
    .split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!fs.existsSync(options.returnDir) || !fs.statSync(options.returnDir).isDirectory()) {
    throw new Error(`RETURN directory not found: ${options.returnDir}`);
  }
  if (raw.outputPath) {
    // Validator output is a derived result, never persistent RETURN evidence:
    // writing it inside the RETURN directory would either go un-hashed or
    // force checksum regeneration loops. Refuse that outright.
    const returnRoot = path.resolve(options.returnDir);
    const outputRoot = path.resolve(raw.outputPath);
    const relative = path.relative(returnRoot, outputRoot);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new Error(`--output must not be inside the RETURN directory: ${raw.outputPath}`);
    }
    options.outputPath = outputRoot;
  }
  return options;
}

function validateGateShape(gate, index) {
  const label = `gates[${index}]`;
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return [`${label} must be an object`];
  const problems = [];
  if (typeof gate.id !== 'string' || gate.id.length === 0) problems.push(`${label}.id must be a non-empty string`);
  if (!GATE_STATUSES.includes(gate.status)) {
    problems.push(`${label}.status must be one of ${GATE_STATUSES.join('|')}`);
  }
  if (typeof gate.command !== 'string') problems.push(`${label}.command must be a string`);
  if (!isIsoTimestamp(gate.startedAt)) problems.push(`${label}.startedAt must be an ISO8601 timestamp`);
  if (!isIsoTimestamp(gate.endedAt)) problems.push(`${label}.endedAt must be an ISO8601 timestamp`);
  if (!Number.isInteger(gate.exitCode)) problems.push(`${label}.exitCode must be an integer`);
  if (!Array.isArray(gate.evidencePaths) || gate.evidencePaths.some((entry) => typeof entry !== 'string')) {
    problems.push(`${label}.evidencePaths must be an array of strings`);
  }
  const hashes = gate.evidenceSha256;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)
    || Object.values(hashes).some((value) => typeof value !== 'string' || !HEX_64.test(value))) {
    problems.push(`${label}.evidenceSha256 must map paths to 64 lowercase hex digests`);
  }
  return problems;
}

function validateStateShape(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return [`${STATE_FILE} must contain a JSON object`];
  }
  const problems = [];
  if (typeof state.sourceCommit !== 'string' || !HEX_40.test(state.sourceCommit)) {
    problems.push('sourceCommit must be 40 lowercase hex characters');
  }
  if (typeof state.sourceZipSha256 !== 'string' || !HEX_64.test(state.sourceZipSha256)) {
    problems.push('sourceZipSha256 must be 64 lowercase hex characters');
  }
  if (state.candidateSha256 !== null
    && (typeof state.candidateSha256 !== 'string' || !HEX_64.test(state.candidateSha256))) {
    problems.push('candidateSha256 must be null or 64 lowercase hex characters');
  }
  if (state.overallStatus === 'paused') {
    if (typeof state.pauseReason !== 'string' || state.pauseReason.trim().length === 0) problems.push('pauseReason must be a non-empty string when overallStatus=paused');
    if (typeof state.nextStep !== 'string' || state.nextStep.trim().length === 0) problems.push('nextStep must be a non-empty string when overallStatus=paused');
    if (typeof state.acceptanceContractSha256 !== 'string' || !HEX_64.test(state.acceptanceContractSha256)) problems.push('acceptanceContractSha256 must be a 64 lowercase hex digest when overallStatus=paused');
    if (typeof state.environmentFingerprint !== 'string' || state.environmentFingerprint.trim().length === 0) problems.push('environmentFingerprint must be a non-empty string when overallStatus=paused');
  }
  if (!OVERALL_STATUSES.includes(state.overallStatus)) {
    problems.push(`overallStatus must be one of ${OVERALL_STATUSES.join('|')}`);
  }
  if (state.firstFailedGate !== null && typeof state.firstFailedGate !== 'string') {
    problems.push('firstFailedGate must be null or a gate id string');
  }
  if (typeof state.originalDisplayScale !== 'string' || state.originalDisplayScale.length === 0) {
    problems.push('originalDisplayScale must be a non-empty string');
  }
  if (typeof state.finalDisplayScale !== 'string' || state.finalDisplayScale.length === 0) {
    problems.push('finalDisplayScale must be a non-empty string');
  }
  if (!CLEANUP_STATUSES.includes(state.cleanupStatus)) {
    problems.push(`cleanupStatus must be one of ${CLEANUP_STATUSES.join('|')}`);
  }
  if (!Array.isArray(state.gates)) problems.push('gates must be an array');
  else state.gates.forEach((gate, index) => problems.push(...validateGateShape(gate, index)));
  if (!Array.isArray(state.evidenceFiles)
    || state.evidenceFiles.some((entry) => typeof entry !== 'string')) {
    problems.push('evidenceFiles must be an array of strings');
  }
  if (!Array.isArray(state.finalProcesses)) problems.push('finalProcesses must be an array');
  return problems;
}

function readAcceptanceState(returnDir, record) {
  const statePath = path.join(returnDir, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    record('acceptance-state:exists', false, `${STATE_FILE} is missing`);
    return null;
  }
  record('acceptance-state:exists', true);
  const raw = fs.readFileSync(statePath);
  if (hasUtf8Bom(raw)) {
    record('acceptance-state:encoding', false, 'UTF-8 BOM is not allowed');
    return null;
  }
  record('acceptance-state:encoding', true);
  let state;
  try {
    state = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    record('acceptance-state:parse', false, `invalid JSON: ${error.message}`);
    return null;
  }
  record('acceptance-state:parse', true);
  const problems = validateStateShape(state);
  if (problems.length > 0) {
    record('acceptance-state:schema', false, problems.join('; '));
    return null;
  }
  record('acceptance-state:schema', true);
  return state;
}

function checkIdentity(state, options, record) {
  record('identity:source-commit', state.sourceCommit === options.expectSourceCommit,
    `state=${state.sourceCommit} expected=${options.expectSourceCommit}`);
  record('identity:source-zip-sha256', state.sourceZipSha256 === options.expectSourceZipSha256,
    `state=${state.sourceZipSha256} expected=${options.expectSourceZipSha256}`);
  if (options.expectCandidateSha256) {
    record('identity:candidate-sha256', state.candidateSha256 === options.expectCandidateSha256,
      `state=${state.candidateSha256} expected=${options.expectCandidateSha256}`);
  }
  if (options.expectContractSha256 && state.overallStatus === 'paused') {
    record('identity:acceptance-contract-sha256', state.acceptanceContractSha256 === options.expectContractSha256,
      `state=${state.acceptanceContractSha256} expected=${options.expectContractSha256}`);
  }
  if (options.expectEnvironmentFingerprint && state.overallStatus === 'paused') {
    record('identity:environment-fingerprint', state.environmentFingerprint === options.expectEnvironmentFingerprint,
      `state=${state.environmentFingerprint} expected=${options.expectEnvironmentFingerprint}`);
  }
}

function checkEvidence(returnDir, state, record) {
  const referenced = new Set(state.evidenceFiles);
  for (const gate of state.gates) {
    for (const evidencePath of gate.evidencePaths) referenced.add(evidencePath);
  }
  const unsafe = [];
  const missing = [];
  for (const relativePath of referenced) {
    const absolutePath = resolveInside(returnDir, relativePath);
    if (!absolutePath) {
      unsafe.push(relativePath);
      continue;
    }
    if (!fs.existsSync(absolutePath)) missing.push(relativePath);
  }
  record('evidence:paths', unsafe.length === 0 && missing.length === 0, [
    unsafe.length > 0 ? `unsafe paths: ${unsafe.join(', ')}` : null,
    missing.length > 0 ? `missing files: ${missing.join(', ')}` : null,
  ].filter(Boolean).join('; '));

  const correspondenceProblems = [];
  for (const gate of state.gates) {
    const paths = new Set(gate.evidencePaths);
    const hashes = new Set(Object.keys(gate.evidenceSha256));
    for (const evidencePath of paths) if (!hashes.has(evidencePath)) correspondenceProblems.push(`${gate.id}: ${evidencePath} has no SHA-256`);
    for (const evidencePath of hashes) if (!paths.has(evidencePath)) correspondenceProblems.push(`${gate.id}: ${evidencePath} is not listed in evidencePaths`);
  }
  record('evidence:path-sha256-correspondence', correspondenceProblems.length === 0, correspondenceProblems.join('; '));

  const hashProblems = [];
  for (const gate of state.gates) {
    for (const [relativePath, expected] of Object.entries(gate.evidenceSha256)) {
      const absolutePath = resolveInside(returnDir, relativePath);
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        hashProblems.push(`${relativePath}: missing or unsafe path`);
        continue;
      }
      let stats;
      try { stats = fs.lstatSync(absolutePath); } catch (error) { hashProblems.push(`${relativePath}: ${error.message}`); continue; }
      if (!stats.isFile() || stats.isSymbolicLink()) {
        hashProblems.push(`${relativePath}: must be a regular file`);
        continue;
      }
      const actual = sha256File(absolutePath);
      if (actual !== expected) hashProblems.push(`${relativePath}: expected ${expected}, got ${actual}`);
    }
  }
  record('evidence:regular-files', hashProblems.every((problem) => !problem.includes('must be a regular file')), hashProblems.filter((problem) => problem.includes('must be a regular file')).join('; '));
  record('evidence:sha256', hashProblems.length === 0, hashProblems.join('; '));
}

function checkGateOutcomes(state, options, record) {
  const ids = state.gates.map((gate) => gate.id);
  record('gates:unique-ids', new Set(ids).size === ids.length, 'gate ids must be unique');
  state.gates.forEach((gate) => {
    const problems = [];
    if (gate.endedAt && gate.startedAt && Date.parse(gate.endedAt) < Date.parse(gate.startedAt)) problems.push('endedAt is before startedAt');
    if (gate.status === 'passed' && gate.exitCode !== 0) problems.push(`passed gate must have exitCode=0 (exitCode=${gate.exitCode})`);
    if (gate.status === 'passed' && gate.evidencePaths.length === 0) problems.push('passed gate must include evidencePaths');
    record(`gate:${gate.id}`, problems.length === 0, problems.join('; '));
  });
  if (state.overallStatus === 'passed') {
    record('status:all-gates-passed-on-pass', state.gates.every((gate) => gate.status === 'passed'), 'overallStatus=passed requires every gate to be passed');
    record('status:firstFailedGate-null-on-pass', state.firstFailedGate === null, 'overallStatus=passed requires firstFailedGate=null');
    for (const gateId of options.requiredGates) {
      const gate = state.gates.find((entry) => entry.id === gateId);
      if (!gate) {
        record(`gate:${gateId}`, false, 'required gate is missing from gates[]');
        continue;
      }
      record(`gate:${gateId}`, gate.status === 'passed',
        gate.status === 'passed' ? 'status=passed' : `required gate status=${gate.status}, expected passed`);
    }
    return;
  }
  if (state.overallStatus === 'failed') {
    const problems = [];
    const firstFailedIndex = state.firstFailedGate === null
      ? -1
      : state.gates.findIndex((gate) => gate.id === state.firstFailedGate);
    if (state.firstFailedGate === null) problems.push('firstFailedGate is null');
    else if (firstFailedIndex === -1) problems.push(`firstFailedGate ${state.firstFailedGate} is not in gates[]`);
    else {
      if (state.gates[firstFailedIndex].status !== 'failed') {
        problems.push(`gate ${state.firstFailedGate} status=${state.gates[firstFailedIndex].status}, expected failed`);
      }
      const earlierFailed = state.gates.slice(0, firstFailedIndex)
        .find((gate) => gate.status === 'failed');
      if (earlierFailed) {
        problems.push(`gate ${earlierFailed.id} failed before firstFailedGate ${state.firstFailedGate}`);
      }
      const laterExecuted = state.gates.slice(firstFailedIndex + 1)
        .filter((gate) => gate.status !== 'not-executed');
      if (laterExecuted.length > 0) {
        problems.push(`gates after firstFailedGate must be not-executed: ${laterExecuted.map((gate) => `${gate.id}=${gate.status}`).join(', ')}`);
      }
    }
    record('status:first-failed-gate', problems.length === 0, problems.join('; '));
    record('status:overall', false, 'overallStatus=failed: acceptance did not pass');
    return;
  }
  if (state.overallStatus === 'paused') {
    const executed = state.gates.filter((gate) => gate.status !== 'not-executed');
    const unexecuted = state.gates.filter((gate) => gate.status === 'not-executed');
    const failed = state.gates.filter((gate) => gate.status === 'failed');
    record('status:paused-no-failed-gates', failed.length === 0,
      failed.length > 0 ? `paused state cannot contain failed gates: ${failed.map((gate) => gate.id).join(', ')}` : null);
    record('status:paused-has-unexecuted-gates', unexecuted.length > 0,
      unexecuted.length > 0 ? `${unexecuted.length} gate(s) remain not-executed` : 'paused state must identify unfinished gates');
    record('status:overall', false, 'overallStatus=paused: acceptance is incomplete and must not pass');
    return;
  }
  const blockedGates = state.gates.filter((gate) => gate.status === 'environment-blocked');
  record('status:environment-blocked-gate', blockedGates.length > 0,
    blockedGates.length > 0
      ? `blocked gates: ${blockedGates.map((gate) => gate.id).join(', ')}`
      : 'no gate has status=environment-blocked');
  record('status:overall', false,
    'overallStatus=environment-blocked: acceptance was blocked by the environment, not passed');
}

function checkCleanup(state, options, record) {
  record('cleanup:status', state.cleanupStatus === 'passed', `cleanupStatus=${state.cleanupStatus}`);

  const shapeProblems = [];
  state.finalProcesses.forEach((processEntry, index) => {
    const label = `finalProcesses[${index}]`;
    if (!processEntry || typeof processEntry !== 'object' || Array.isArray(processEntry)) {
      shapeProblems.push(`${label} must be an object`);
      return;
    }
    if (typeof processEntry.Name !== 'string' || processEntry.Name.length === 0) {
      shapeProblems.push(`${label}.Name must be a non-empty string`);
    }
    if (!Number.isInteger(processEntry.ProcessId) || processEntry.ProcessId <= 0) {
      shapeProblems.push(`${label}.ProcessId must be a positive integer`);
    }
    if (typeof processEntry.ExecutablePath !== 'string' || processEntry.ExecutablePath.length === 0) {
      shapeProblems.push(`${label}.ExecutablePath must be a non-empty string`);
    }
    if (typeof processEntry.CommandLine !== 'string') {
      shapeProblems.push(`${label}.CommandLine must be a string`);
    }
  });
  record('cleanup:final-processes-shape', shapeProblems.length === 0, shapeProblems.join('; '));

  if (options.expectProcessPaths.length > 0) {
    const forbidden = new Set(options.expectProcessPaths.map((entry) => entry.toLowerCase()));
    const residual = state.finalProcesses.filter((processEntry) => processEntry
      && typeof processEntry.ExecutablePath === 'string'
      && forbidden.has(processEntry.ExecutablePath.toLowerCase()));
    record('cleanup:no-residual-processes', residual.length === 0,
      residual.length > 0
        ? `accepted product processes still running: ${residual.map((entry) => `${entry.Name} (pid ${entry.ProcessId}, ${entry.ExecutablePath})`).join(', ')}`
        : null);
  }

  const processGates = state.gates.filter((gate) => /process|cleanup/i.test(gate.id));
  const failedProcessGates = processGates.filter((gate) => gate.exitCode !== 0);
  record('cleanup:process-gate-exit-codes', failedProcessGates.length === 0,
    failedProcessGates.length > 0
      ? `process/cleanup gates with exitCode!=0: ${failedProcessGates.map((gate) => `${gate.id} exitCode=${gate.exitCode}`).join(', ')}`
      : null);
}

function checkReturnedChecksums(returnDir, record) {
  const checksumsPath = path.join(returnDir, CHECKSUMS_FILE);
  if (!fs.existsSync(checksumsPath)) {
    record('returned-checksums:exists', false, `${CHECKSUMS_FILE} is missing`);
    return;
  }
  record('returned-checksums:exists', true);

  const raw = fs.readFileSync(checksumsPath);
  const bom = hasUtf8Bom(raw);
  const hasCr = raw.includes(0x0d);
  record('returned-checksums:encoding', !bom && !hasCr, [
    bom ? 'UTF-8 BOM is not allowed' : null,
    hasCr ? 'CR byte found: only LF line endings are allowed' : null,
  ].filter(Boolean).join('; '));
  if (bom || hasCr) return;

  const lines = raw.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const formatProblems = [];
  const entries = [];
  lines.forEach((line, index) => {
    const match = CHECKSUM_LINE.exec(line);
    if (!match) {
      formatProblems.push(`line ${index + 1}: ${JSON.stringify(line)}`);
      return;
    }
    entries.push({ hash: match[1], relativePath: normalizeRelativePath(match[2]) });
  });
  record('returned-checksums:format', formatProblems.length === 0, formatProblems.join('; '));

  const selfEntries = entries.filter((entry) => entry.relativePath === CHECKSUMS_FILE);
  record('returned-checksums:no-self-entry', selfEntries.length === 0,
    selfEntries.length > 0 ? `${CHECKSUMS_FILE} must not list itself` : null);

  const hashProblems = [];
  const duplicatePaths = entries.map((entry) => entry.relativePath).filter((entry, index, all) => all.indexOf(entry) !== index);
  record('returned-checksums:no-duplicates', duplicatePaths.length === 0,
    duplicatePaths.length > 0 ? `duplicate entries: ${[...new Set(duplicatePaths)].join(', ')}` : null);
  for (const entry of entries) {
    if (entry.relativePath === CHECKSUMS_FILE) continue;
    const absolutePath = resolveInside(returnDir, entry.relativePath);
    if (!absolutePath) {
      hashProblems.push(`${entry.relativePath}: unsafe path`);
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      hashProblems.push(`${entry.relativePath}: file is missing`);
      continue;
    }
    let stats;
    try { stats = fs.lstatSync(absolutePath); } catch (error) { hashProblems.push(`${entry.relativePath}: ${error.message}`); continue; }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      hashProblems.push(`${entry.relativePath}: must be a regular file`);
      continue;
    }
    const actual = sha256File(absolutePath);
    if (actual !== entry.hash) {
      hashProblems.push(`${entry.relativePath}: expected ${entry.hash}, got ${actual}`);
    }
  }
  record('returned-checksums:hashes', hashProblems.length === 0, hashProblems.join('; '));

  const coversState = entries.some((entry) => entry.relativePath === STATE_FILE);
  record('returned-checksums:covers-acceptance-state', coversState,
    coversState ? null : `${STATE_FILE} is not covered by ${CHECKSUMS_FILE}`);

  const actualFiles = [];
  const walk = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relativePath === CHECKSUMS_FILE) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath, relativePath);
      else if (entry.isFile()) actualFiles.push(relativePath);
      else actualFiles.push(relativePath);
    }
  };
  walk(returnDir);
  const listedFiles = entries.map((entry) => entry.relativePath);
  const missingEntries = actualFiles.filter((file) => !listedFiles.includes(file));
  const extraEntries = listedFiles.filter((file) => !actualFiles.includes(file));
  record('returned-checksums:coverage', missingEntries.length === 0 && extraEntries.length === 0,
    [...(missingEntries.length ? [`missing: ${missingEntries.join(', ')}`] : []), ...(extraEntries.length ? [`extra: ${extraEntries.join(', ')}`] : [])].join('; '));
}

function validateReturnDirectory(returnDir, options) {
  const checks = [];
  const record = (rule, ok, detail) => {
    checks.push({ rule, ok, detail: detail || null });
    return ok;
  };

  const state = readAcceptanceState(returnDir, record);
  checkReturnedChecksums(returnDir, record);
  if (state) {
    checkIdentity(state, options, record);
    checkEvidence(returnDir, state, record);
    checkGateOutcomes(state, options, record);
    checkCleanup(state, options, record);
    record('display-scale:consistent', state.originalDisplayScale === state.finalDisplayScale,
      `originalDisplayScale=${state.originalDisplayScale} finalDisplayScale=${state.finalDisplayScale}`);
  } else {
    record('acceptance-state:dependent-checks', false,
      'identity, evidence, gate, cleanup and scale checks require a valid acceptance-state.json');
  }

  const ok = checks.every((check) => check.ok);
  const paused = state?.overallStatus === 'paused';
  const summary = state ? {
    completed: state.gates.filter((gate) => gate.status === 'passed').map((gate) => gate.id),
    unexecuted: state.gates.filter((gate) => gate.status === 'not-executed').map((gate) => gate.id),
    pauseReason: paused ? state.pauseReason : null,
    nextStep: paused ? state.nextStep : null,
  } : null;
  const evidenceValid = checks.every((check) => check.ok || (paused && check.rule === 'status:overall'));
  return { ok, acceptancePassed: ok && !paused, evidenceValid, status: paused ? 'paused' : (ok ? 'passed' : 'failed'), checks, summary };
}

function runValidator(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }

  let result;
  try {
    result = validateReturnDirectory(options.returnDir, options);
  } catch (error) {
    process.stderr.write(`validation error: ${error.message}\n`);
    return 1;
  }

  let report;
  if (options.json) {
    report = `${JSON.stringify({
      status: result.status,
      acceptancePassed: result.acceptancePassed,
      evidenceValid: result.evidenceValid,
      summary: result.summary,
      failures: result.checks.filter((check) => !check.ok),
      checks: result.checks,
    }, null, 2)}\n`;
  } else {
    const lines = result.checks.map((check) => {
      const suffix = check.detail ? ` - ${check.detail}` : '';
      return `${check.ok ? 'PASS' : 'FAIL'} ${check.rule}${suffix}`;
    });
    const failedCount = result.checks.filter((check) => !check.ok).length;
    lines.push(result.acceptancePassed
      ? 'RESULT PASS: all checks passed'
      : result.status === 'paused'
        ? `RESULT PAUSED: ${failedCount} check(s) failed; acceptance remains incomplete`
        : `RESULT FAIL: ${failedCount} check(s) failed`);
    report = `${lines.join('\n')}\n`;
  }
  process.stdout.write(report);
  if (options.outputPath) {
    fs.writeFileSync(options.outputPath, report, 'utf8');
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = runValidator(process.argv.slice(2));

module.exports = { parseArguments, validateReturnDirectory, runValidator };
