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

function buildAcceptanceKit({ contract, contractSha256 = null, sourceZip, sourceCommit, candidateSha256 = null, now = new Date(), execFile }) {
  if (!contract || contract.schemaVersion !== 1 || !Array.isArray(contract.requiredGates) || contract.requiredGates.length === 0) {
    throw new Error('acceptance contract must declare requiredGates');
  }
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
  const rows = kit.requiredGates.map((gate) => `| ${gate.id} | ${gate.title} | ${gate.mode} | 未执行 | |`).join('\n');
  return `# Windows 桌宠制作台验收报告\n\n- 源码提交：${kit.source.sourceCommit || '<实际提交>'}\n- source ZIP SHA-256：${kit.source.zipSha256 || '<实际计算>'}\n- source ZIP 文件数：${kit.source.fileCount}\n- 候选 SHA-256：${kit.candidateSha256 || '未构建'}\n\n| 门 | 说明 | 模式 | 状态 | 耗时（ms） |\n| --- | --- | --- | --- | --- |\n${rows}\n\n结论必须三选一：Windows installed-mode 通过 / Windows 验收失败 / Windows 验收未完成。工具不可用单独记录为环境阻塞，不得改写成产品失败。`;
}

function renderPrompt(kit) {
  const gates = kit.requiredGates.map((gate) => `- ${gate.id}: ${gate.title}（${gate.mode}）`).join('\n');
  const tools = kit.toolPreflight.join('、');
  const externalFiles = kit.knownExternalAutomationFiles.map((file) => `- ${file}`).join('\n');
  return `# Windows 续验执行提示词\n\n先复核 source ZIP SHA-256=${kit.source.zipSha256 || '<由清单读取>'}、文件数=${kit.source.fileCount}、源码提交=${kit.source.sourceCommit || '<实际提交>'}；不得复用不同身份的旧通过证据。先做工具预检（${tools}），预检失败记录为 environment-blocked，不能伪造 GUI 结果。每个门记录 startedAt、endedAt、durationMs、退出码、截图和日志；原生文件对话框失败时可记录真实人工操作，但不得直接调用内部控制器。依赖缓存只能在 package-lock、Electron 版本和 source:preflight 完整性一致后复用，否则执行 npm ci。\n\n必需门：\n${gates}\n\n旧 Windows 自动化工具未回传到本机；若要复用，至少取回这些已在 RESUME 明确点名的文件（缺一则重建并重跑预检）：\n${externalFiles}\n\n暂停时写 overallStatus=paused、pauseReason、nextStep、acceptanceContractSha256 和 environmentFingerprint；暂停不是通过。返回目录只使用新时间戳目录，验证器输出放在 RETURN 外。验证器的 --required-gates 直接取 acceptance-checklist.json.requiredGates[].id，不手写门数。`;
}

function runToolPreflight({ checks = [], commandRunner = childProcess.spawnSync }) {
  return checks.map((name) => {
    const result = commandRunner(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    return { name, available: result.status === 0, classification: result.status === 0 ? 'available' : 'tool-unavailable' };
  });
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
  fs.writeFileSync(path.join(outputDirectory, 'tool-preflight.json'), `${JSON.stringify({ schemaVersion: 1, checks: kit.toolPreflight.map((name) => ({ name, status: 'not-executed', classification: null, evidencePaths: [] })) }, null, 2)}\n`, 'utf8');
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
  const [contractPath, sourceZip, outputDirectory, sourceCommit] = process.argv.slice(2);
  if (!contractPath || !sourceZip || !outputDirectory) {
    process.stderr.write('Usage: node scripts/workbench-acceptance-kit.js <contract.json> <source.zip> <new-output-dir> [sourceCommit]\n');
    process.exitCode = 2;
  } else {
    try { process.stdout.write(`${JSON.stringify(createKit({ contractPath, sourceZip, outputDirectory, sourceCommit }), null, 2)}\n`); }
    catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  }
}

module.exports = { buildAcceptanceKit, createKit, evaluateTestRun, listZipEntries, normalizeZipEntry, renderPrompt, renderReportTemplate, runToolPreflight, sha256File };
