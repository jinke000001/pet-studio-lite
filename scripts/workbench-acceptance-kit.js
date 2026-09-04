#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeZipEntry(entry) {
  const normalized = entry.replace(/\\/g, '/').trim();
  if (!normalized || normalized.endsWith('/') || normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function listZipEntries(zipPath, execFile = childProcess.execFileSync) {
  const output = execFile('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  const entries = output.split(/\r?\n/).map(normalizeZipEntry).filter(Boolean);
  if (new Set(entries).size !== entries.length) throw new Error('source ZIP contains duplicate paths');
  return entries.sort();
}

function validateContract(contract) {
  if (!contract || contract.schemaVersion !== 2) {
    throw new Error('acceptance contract schemaVersion must be 2');
  }
  if (!Array.isArray(contract.requiredGates) || contract.requiredGates.length === 0) {
    throw new Error('acceptance contract must declare requiredGates');
  }
  const gateIds = contract.requiredGates.map((gate) => gate?.id);
  if (gateIds.some((id) => typeof id !== 'string' || id.length === 0) || new Set(gateIds).size !== gateIds.length) {
    throw new Error('acceptance contract gate ids must be non-empty and unique');
  }
  for (const gate of contract.requiredGates) {
    if (typeof gate.title !== 'string' || typeof gate.mode !== 'string' || typeof gate.check !== 'string'
      || typeof gate.passCriteria !== 'string' || !Array.isArray(gate.evidence) || gate.evidence.length === 0) {
      throw new Error(`acceptance contract gate ${gate.id} must define title, mode, check, passCriteria and evidence`);
    }
  }
  if (!Array.isArray(contract.coverageGroups) || contract.coverageGroups.length === 0) {
    throw new Error('acceptance contract must declare coverageGroups');
  }
  const coveredIds = contract.coverageGroups.flatMap((group) => Array.isArray(group.gateIds) ? group.gateIds : []);
  const unknown = coveredIds.filter((id) => !gateIds.includes(id));
  const missing = gateIds.filter((id) => !coveredIds.includes(id));
  const duplicates = coveredIds.filter((id, index) => coveredIds.indexOf(id) !== index);
  if (unknown.length > 0) throw new Error(`coverage references unknown gate: ${unknown.join(', ')}`);
  if (missing.length > 0) throw new Error(`coverage missing required gate: ${missing.join(', ')}`);
  if (duplicates.length > 0) throw new Error(`coverage contains duplicate gate: ${[...new Set(duplicates)].join(', ')}`);
  return contract;
}

function buildAcceptanceKit({ contract, contractSha256 = null, sourceZip, sourceCommit, candidateSha256 = null, now = new Date(), execFile }) {
  validateContract(contract);
  if (sourceCommit && !/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('sourceCommit must be 40 lowercase hex characters');
  if (candidateSha256 && !/^[0-9a-f]{64}$/.test(candidateSha256)) throw new Error('candidateSha256 must be 64 lowercase hex characters');
  const gateIds = contract.requiredGates.map((gate) => gate.id);
  if (gateIds.some((id) => typeof id !== 'string' || id.length === 0) || new Set(gateIds).size !== gateIds.length) {
    throw new Error('acceptance contract gate ids must be non-empty and unique');
  }
  const entries = sourceZip ? listZipEntries(sourceZip, execFile) : [];
  const requiredGates = contract.requiredGates.map((gate) => ({ ...gate }));
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    acceptanceContractSha256: contractSha256,
    source: {
      zipPath: sourceZip ? path.resolve(sourceZip) : null,
      zipSha256: sourceZip ? sha256File(sourceZip) : null,
      fileCount: entries.length,
      sourceCommit: sourceCommit || null,
    },
    candidateSha256,
    requiredGates,
    toolPreflight: contract.toolPreflight || [],
    knownExternalAutomationFiles: contract.knownExternalAutomationFiles || [],
    timingFields: ['startedAt', 'endedAt', 'durationMs'],
  };
}

function evaluateTestRun({ exitCode, summary, expectedFiles = [], coveredFiles = [] }) {
  const missingCoverage = expectedFiles.filter((file) => !coveredFiles.includes(file));
  const problems = [];
  if (exitCode !== 0) problems.push(`exitCode=${exitCode}`);
  if (!summary || !Number.isInteger(summary.tests) || summary.tests <= 0) problems.push('tests must be a positive integer');
  if (summary && summary.fail !== 0) problems.push(`fail=${summary.fail}`);
  if (summary && summary.skipped !== 0) problems.push(`skipped=${summary.skipped}`);
  if (summary && summary.cancelled !== 0) problems.push(`cancelled=${summary.cancelled}`);
  if (missingCoverage.length > 0) problems.push(`missing expected coverage: ${missingCoverage.join(', ')}`);
  return { ok: problems.length === 0, problems, missingCoverage };
}

function renderReportTemplate(kit) {
  const rows = kit.requiredGates.map((gate) => `| ${gate.id} | ${gate.mode} | ${gate.check} | ${gate.passCriteria} | ${gate.evidence.join('、')} | 未执行 | |`).join('\n');
  return `# Windows 桌宠制作台验收报告\n\n- 源码提交：${kit.source.sourceCommit || '<实际提交>'}\n- source ZIP SHA-256：${kit.source.zipSha256 || '<实际计算>'}\n- source ZIP 文件数：${kit.source.fileCount}\n- 候选 SHA-256：${kit.candidateSha256 || '待 Windows 实际构建后绑定'}\n\n| 门 | 模式 | 检查 | 通过条件 | 必需证据 | 状态 | 耗时（ms） |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n结论必须三选一：Windows installed-mode 通过 / Windows 验收失败 / Windows 验收未完成。工具不可用单独记录为环境阻塞，不得改写成产品失败。`;
}

function renderPrompt(kit) {
  const gates = kit.requiredGates.map((gate) => `- ${gate.id}: ${gate.title}（${gate.mode}）；${gate.check}；通过=${gate.passCriteria}；证据=${gate.evidence.join('、')}`).join('\n');
  const tools = kit.toolPreflight.map((check) => check.id).join('、');
  const externalFiles = kit.knownExternalAutomationFiles.map((file) => `- ${file}`).join('\n');
  return `# Windows 续验执行提示词\n\n先复核 source ZIP SHA-256=${kit.source.zipSha256 || '<由清单读取>'}、文件数=${kit.source.fileCount}、源码提交=${kit.source.sourceCommit || '<实际提交>'}；不得复用不同身份的旧通过证据。先执行 “node scripts\\workbench-acceptance-kit.js preflight acceptance-contract.json <evidence-root> tool-preflight.json” 做工具预检（${tools}）。预检只证明驱动可用且该次操作成功，不代替产品验收；工具未取回/不可访问/未实现必须保持 tool-unavailable 或 not-executed。每个门记录 startedAt、endedAt、durationMs、退出码和要求的截图/日志/进程证据；原生文件对话框失败时可记录真实人工选择为 manual-continuation，但不得直接调用内部控制器或记为预检成功。本轮自动测试必须重跑，不复用旧版本的通过结论。\n\n必需门：\n${gates}\n\n外部 Windows 自动化驱动未回传到本地交接；可取回的核心文件如下，调试辅助文件缺失不得强制重建已有有效驱动：\n${externalFiles}\n\n暂停时写 overallStatus=paused、pauseReason、nextStep、acceptanceContractSha256 和 environmentFingerprint；暂停不是通过。返回目录只使用新时间戳目录，验证器输出放在 RETURN 外。验证器的 --required-gates 直接取 acceptance-checklist.json.requiredGates[].id，不手写门数。候选未构建时 expectCandidateSha256 必须保持 null；实际候选门前必须计算安装包哈希并显式传入 --expect-candidate-sha256，不得留空后判通过。`;
}

function runToolPreflight({ checks = [], commandRunner = childProcess.spawnSync, evidenceExists = fs.existsSync, now = () => new Date() }) {
  return checks.map((check) => {
    if (check.method === 'manual') {
      return { id: check.id, method: 'manual', driverAvailable: null, operationSucceeded: null, classification: 'manual-continuation', reason: check.reason || null };
    }
    const startedAt = now();
    const result = commandRunner(check.driver.command, check.driver.args || [], {
      encoding: 'utf8', timeout: check.driver.timeoutMs, cwd: check.driver.cwd || undefined,
    });
    const endedAt = now();
    const requiredEvidence = check.requiredEvidence || [];
    const missingEvidence = requiredEvidence.filter((evidencePath) => !evidenceExists(evidencePath, check));
    const commandMissing = result?.error?.code === 'ENOENT';
    const timedOut = result?.error?.code === 'ETIMEDOUT';
    let classification = 'operation-failed';
    if (commandMissing) classification = 'tool-unavailable';
    else if (timedOut) classification = 'timeout';
    else if (result?.status === 0 && missingEvidence.length > 0) classification = 'evidence-missing';
    else if (result?.status === 0) classification = 'passed';
    return {
      id: check.id,
      method: 'driver',
      driver: { command: check.driver.command, args: check.driver.args || [], timeoutMs: check.driver.timeoutMs },
      driverAvailable: !commandMissing,
      operationSucceeded: classification === 'passed',
      classification,
      exitCode: Number.isInteger(result?.status) ? result.status : null,
      signal: result?.signal || null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      requiredEvidence,
      missingEvidence,
      reason: result?.error?.message || result?.stderr || null,
    };
  });
}

function writeToolPreflight({ contractPath, evidenceRoot, outputPath, commandRunner }) {
  const contract = validateContract(JSON.parse(fs.readFileSync(contractPath, 'utf8')));
  if (fs.existsSync(outputPath)) throw new Error(`preflight output already exists: ${outputPath}`);
  const checks = runToolPreflight({
    checks: contract.toolPreflight || [],
    commandRunner,
    evidenceExists: (relativePath) => fs.existsSync(path.join(evidenceRoot, ...relativePath.split('/'))),
  });
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), evidenceRoot: path.resolve(evidenceRoot), checks };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function createKit({ contractPath, sourceZip, sourceCommit, candidateSha256, outputDirectory }) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  if (fs.existsSync(outputDirectory)) throw new Error(`output directory already exists: ${outputDirectory}`);
  const kit = buildAcceptanceKit({ contract, contractSha256: sha256File(contractPath), sourceZip, sourceCommit, candidateSha256 });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'acceptance-checklist.json'), `${JSON.stringify(kit, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'WINDOWS-WORKBENCH-REPORT.md'), `${renderReportTemplate(kit)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'WINDOWS-WORKBENCH-PROMPT.md'), `${renderPrompt(kit)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'timings.json'), `${JSON.stringify({ schemaVersion: 1, gates: kit.requiredGates.map(({ id }) => ({ id, startedAt: null, endedAt: null, durationMs: null })) }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'tool-preflight.json'), `${JSON.stringify({ schemaVersion: 1, checks: kit.toolPreflight.map(({ id, driver, requiredEvidence }) => ({ id, driver, requiredEvidence, status: 'not-executed', classification: null })) }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'validator-arguments.json'), `${JSON.stringify({
    expectSourceCommit: kit.source.sourceCommit,
    expectSourceZipSha256: kit.source.zipSha256,
    expectCandidateSha256: kit.candidateSha256,
    expectContractSha256: kit.acceptanceContractSha256,
    requiredGates: kit.requiredGates.map(({ id }) => id),
  }, null, 2)}\n`, 'utf8');
  return kit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === 'preflight') {
      const [, contractPath, evidenceRoot, outputPath] = args;
      if (!contractPath || !evidenceRoot || !outputPath) throw new Error('Usage: node scripts/workbench-acceptance-kit.js preflight <contract.json> <evidence-root> <new-output.json>');
      process.stdout.write(`${JSON.stringify(writeToolPreflight({ contractPath, evidenceRoot, outputPath }), null, 2)}\n`);
    } else {
      const [contractPath, sourceZip, outputDirectory, sourceCommit] = args;
      if (!contractPath || !sourceZip || !outputDirectory) throw new Error('Usage: node scripts/workbench-acceptance-kit.js <contract.json> <source.zip> <new-output-dir> [sourceCommit]');
      process.stdout.write(`${JSON.stringify(createKit({ contractPath, sourceZip, outputDirectory, sourceCommit }), null, 2)}\n`);
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { buildAcceptanceKit, createKit, evaluateTestRun, listZipEntries, normalizeZipEntry, renderPrompt, renderReportTemplate, runToolPreflight, sha256File, validateContract, writeToolPreflight };
