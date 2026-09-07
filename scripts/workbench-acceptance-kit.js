#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { readZipEntries, readZipEntry } = require('./zip-reader');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeZipEntry(entry) {
  const normalized = entry.replace(/\\/g, '/').trim();
  if (!normalized || normalized.endsWith('/') || normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function listZipEntries(zipPath, execFile = null) {
  const rawEntries = execFile
    ? execFile('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split(/\r?\n/)
    : readZipEntries(zipPath).map(({ rawName }) => rawName);
  const entries = rawEntries.map(normalizeZipEntry).filter(Boolean);
  if (new Set(entries).size !== entries.length) throw new Error('source ZIP contains duplicate paths');
  return entries.sort();
}

function listFilesRecursive(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFilesRecursive(path.join(directory, entry.name), relativePath)
      : [relativePath];
  }).sort();
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`handoff refuses non-regular resource: ${from}`);
  }
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
  return `# Windows 续验执行提示词\n\n先复核 source ZIP SHA-256=${kit.source.zipSha256 || '<由清单读取>'}、文件数=${kit.source.fileCount}、源码提交=${kit.source.sourceCommit || '<实际提交>'}；不得复用不同身份的旧通过证据。先执行 “node workbench-acceptance-kit.js preflight acceptance-contract.json <evidence-root> tool-preflight.json” 做工具预检（${tools}）。每次执行都会在 <evidence-root> 下创建新的非覆盖运行目录，并通过环境变量 TOOL_PREFLIGHT_EVIDENCE_ROOT 传给每个驱动；驱动必须把本次要求的证据写入该目录（契约中的相对路径），预检只检查这个目录内的非空普通文件。预检只证明驱动可用且该次操作成功，不代替产品验收；工具未取回/不可访问/未实现必须保持 tool-unavailable 或 not-executed。每个门记录 startedAt、endedAt、durationMs、退出码和要求的截图/日志/进程证据；原生文件对话框失败时可记录真实人工选择为 manual-continuation，但不得直接调用内部控制器或记为预检成功。本轮自动测试必须重跑，不复用旧版本的通过结论。\n\n必需门：\n${gates}\n\n外部 Windows 自动化驱动未回传到本地交接；可取回的核心文件如下，调试辅助文件缺失不得强制重建已有有效驱动：\n${externalFiles}\n\n暂停时写 overallStatus=paused、pauseReason、nextStep、acceptanceContractSha256 和 environmentFingerprint；暂停不是通过。返回目录只使用新时间戳目录，验证器输出放在 RETURN 外。验证器的 --required-gates 直接取 acceptance-checklist.json.requiredGates[].id，不手写门数。候选未构建时 expectCandidateSha256 必须保持 null；实际候选门前必须计算安装包哈希并显式传入 --expect-candidate-sha256，不得留空后判通过。`;
}

const TOOL_PREFLIGHT_EVIDENCE_ENV = 'TOOL_PREFLIGHT_EVIDENCE_ROOT';

function resolveEvidencePath(evidenceRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) return null;
  const normalized = relativePath.replace(/\\/g, '/');
  if (path.win32.isAbsolute(normalized)) return null;
  if (normalized.split('/').some((part) => part === '..' || part.length === 0)) return null;
  const root = path.resolve(evidenceRoot);
  const candidate = path.resolve(root, ...normalized.split('/'));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return candidate;
}

function isValidEvidenceFile(evidenceRoot, relativePath) {
  const candidate = resolveEvidencePath(evidenceRoot, relativePath);
  if (!candidate) return false;
  let rootRealPath;
  let candidateRealPath;
  try {
    rootRealPath = fs.realpathSync(evidenceRoot);
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) return false;
    candidateRealPath = fs.realpathSync(candidate);
  } catch {
    return false;
  }
  return candidateRealPath === rootRealPath || candidateRealPath.startsWith(`${rootRealPath}${path.sep}`);
}

function runToolPreflight({ checks = [], commandRunner = childProcess.spawnSync, evidenceExists = fs.existsSync, driverExists = fs.existsSync, evidenceRoot = null, now = () => new Date() }) {
  return checks.map((check) => {
    if (check.method === 'manual') {
      return { id: check.id, method: 'manual', driverAvailable: null, operationSucceeded: null, classification: 'manual-continuation', reason: check.reason || null };
    }
    const startedAt = now();
    if (check.driver.path && !driverExists(check.driver.path, check)) {
      const endedAt = now();
      return {
        id: check.id, method: 'driver', driver: check.driver, driverAvailable: false,
        operationSucceeded: false, classification: 'tool-unavailable', exitCode: null, signal: null,
        startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationMs: endedAt - startedAt,
        requiredEvidence: check.requiredEvidence || [], missingEvidence: check.requiredEvidence || [],
        reason: `driver path is missing: ${check.driver.path}`,
      };
    }
    const result = commandRunner(check.driver.command, check.driver.args || [], {
      encoding: 'utf8', timeout: check.driver.timeoutMs, cwd: check.driver.cwd || undefined,
      ...(evidenceRoot ? {
        evidenceRoot,
        env: { ...process.env, ...(check.driver.env || {}), [TOOL_PREFLIGHT_EVIDENCE_ENV]: evidenceRoot },
      } : {}),
    });
    const endedAt = now();
    const requiredEvidence = check.requiredEvidence || [];
    const missingEvidence = requiredEvidence.filter((evidencePath) => evidenceRoot
      ? !isValidEvidenceFile(evidenceRoot, evidencePath)
      : !evidenceExists(evidencePath, check));
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
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const runEvidenceRoot = fs.mkdtempSync(path.join(path.resolve(evidenceRoot), 'run-'));
  const checks = runToolPreflight({
    checks: contract.toolPreflight || [],
    commandRunner,
    evidenceRoot: runEvidenceRoot,
    driverExists: (relativePath) => fs.existsSync(path.resolve(relativePath)),
  });
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), evidenceRoot: runEvidenceRoot, checks };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function verifyGitCommit(repoRoot, sourceCommit, execFile = childProcess.execFileSync) {
  if (!repoRoot || !sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error('repoRoot and a 40-character sourceCommit are required');
  }
  try {
    const resolved = execFile('git', ['-C', repoRoot, 'rev-parse', '--verify', `${sourceCommit}^{commit}`], { encoding: 'utf8' }).trim();
    if (resolved !== sourceCommit) throw new Error(`resolved commit ${resolved} does not match ${sourceCommit}`);
  } catch (error) {
    throw new Error(`source commit is not available: ${error.message}`);
  }
  return sourceCommit;
}

function createHandoff({ repoRoot, contractPath, outputDirectory, sourceCommit, sampleZip = null, execFile = childProcess.execFileSync }) {
  verifyGitCommit(repoRoot, sourceCommit, execFile);
  if (fs.existsSync(outputDirectory)) throw new Error(`output directory already exists: ${outputDirectory}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const sourceDirectory = path.join(outputDirectory, 'source');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  const shortCommit = sourceCommit.slice(0, 10);
  const sourceZip = path.join(sourceDirectory, `pet-workbench-source-${shortCommit}.zip`);
  const bundle = path.join(sourceDirectory, `pet-workbench-git-${shortCommit}.bundle`);
  const currentHead = execFile('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (currentHead !== sourceCommit) throw new Error(`sourceCommit must be the current HEAD (${currentHead})`);
  execFile('git', ['-C', repoRoot, 'archive', '--format=zip', `--prefix=pet-workbench-source-${shortCommit}/`, sourceCommit, '-o', sourceZip]);
  execFile('git', ['-C', repoRoot, 'bundle', 'create', bundle, 'HEAD']);
  if (sampleZip) {
    const sampleTarget = path.join(sourceDirectory, 'controlled-sample-pets.zip');
    fs.copyFileSync(sampleZip, sampleTarget);
    const sampleEntries = listZipEntries(sampleTarget).filter((entry) => !entry.endsWith('/'));
    const sampleHashes = sampleEntries.map((entry) => {
      const bytes = readZipEntry(sampleTarget, entry);
      return { entry, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    fs.writeFileSync(path.join(outputDirectory, 'SAMPLE-PETS.md'), `# 受控样本取得与核验\n\n- 本交接已内置 source/controlled-sample-pets.zip，SHA-256：\`${sha256File(sampleTarget)}\`。\n- 样本仅用于 internal-test，不产生对外授权结论。\n- Windows 本地复制后先校验 ZIP，再解压到新目录并核对：\n\n${sampleHashes.map(({ entry, sha256 }) => `- \`${entry}\`：\`${sha256}\``).join('\n')}\n`, 'utf8');
  }
  const contractCopy = path.join(outputDirectory, 'acceptance-contract.json');
  fs.copyFileSync(contractPath, contractCopy);
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'validate-windows-return.js'), path.join(outputDirectory, 'validate-windows-return.js'));
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'workbench-acceptance-kit.js'), path.join(outputDirectory, 'workbench-acceptance-kit.js'));
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'zip-reader.js'), path.join(outputDirectory, 'zip-reader.js'));
  const acceptanceToolsSource = path.join(repoRoot, 'acceptance-tools');
  if (!fs.existsSync(acceptanceToolsSource)) throw new Error(`acceptance-tools directory is missing: ${acceptanceToolsSource}`);
  copyDirectory(acceptanceToolsSource, path.join(outputDirectory, 'acceptance-tools'));
  const materialsRoot = path.join(repoRoot, 'release', 'handoff', 'phase-6-workbench-windows-recheck-20260902-02-materials-01', 'fixtures');
  fs.mkdirSync(path.join(outputDirectory, 'fixtures'), { recursive: true });
  if (fs.existsSync(materialsRoot)) copyDirectory(materialsRoot, path.join(outputDirectory, 'fixtures'));
  else if (fs.existsSync(path.join(repoRoot, 'local-pets', 'doraemon'))) copyDirectory(path.join(repoRoot, 'local-pets', 'doraemon'), path.join(outputDirectory, 'fixtures', 'doraemon-v1'));
  else copyDirectory(path.join(repoRoot, 'acceptance-tools', 'fixtures', 'doraemon-v1'), path.join(outputDirectory, 'fixtures', 'doraemon-v1'));
  fs.mkdirSync(path.join(outputDirectory, 'RETURN'));
  fs.writeFileSync(path.join(outputDirectory, 'fixtures', 'README.md'), '# 受控样本\n\n- v1/doraemon-v1：内部兼容测试样本。\n- v2/dai-v2.zip：内部兼容测试样本。\n- dangerous-traversal.zip：安全阻断夹具，禁止写出工作区。\n- 样本仅用于 internal-test，不代表对外授权。\n', 'utf8');
  const kit = buildAcceptanceKit({ contract: JSON.parse(fs.readFileSync(contractPath, 'utf8')), contractSha256: sha256File(contractPath), sourceZip, sourceCommit });
  const handoffRunConfigPath = path.join(outputDirectory, 'acceptance-tools', 'run-config.json');
  const handoffRunConfig = JSON.parse(fs.readFileSync(handoffRunConfigPath, 'utf8'));
  handoffRunConfig.identity = {
    sourceCommit,
    sourceZipSha256: kit.source.zipSha256,
    acceptanceContractSha256: kit.acceptanceContractSha256,
    environmentFingerprint: null,
    candidateSha256: null,
  };
  handoffRunConfig.requiredGates = kit.requiredGates.map(({ id }) => id);
  fs.writeFileSync(handoffRunConfigPath, `${JSON.stringify(handoffRunConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'acceptance-checklist.json'), `${JSON.stringify(kit, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'SOURCE-BASELINE.md'), `# Windows 复验源码基线\n\n- 权威源码提交：\`${sourceCommit}\`\n- source ZIP SHA-256：\`${sha256File(sourceZip)}\`\n- Git bundle SHA-256：\`${sha256File(bundle)}\`\n- 恢复必须使用 bundle 克隆并校验 HEAD；不得用临时 git init/commit 冒充。\n- 本交接只表示输入准备；Windows source/win-unpacked/installed mode、DPI、安装/卸载/重装仍待实机 RETURN。\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'HANDOFF.md'), `# Windows 验收新入口\n\n1. 先核对 checksums.sha256、source ZIP 和 bundle。\n2. 使用 source 目录的 bundle 克隆，确认 HEAD=${sourceCommit}且工作树干净；再与 ZIP 解压树比对。\n3. 在实际 Windows 环境中重跑 acceptance-checklist.json 的全部具体门；候选未生成时 expectCandidateSha256 保持 null，正式候选门前必须填入实测安装包哈希。\n4. 只写入本交接的 RETURN/<timestamp>；历史交接与 RETURN 仅作独立参考，不自动继承或拼接通过结论。\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'WINDOWS-WORKBENCH-REPORT.md'), `${renderReportTemplate(kit)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'WINDOWS-WORKBENCH-PROMPT.md'), `${renderPrompt(kit)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'validator-arguments.json'), `${JSON.stringify({ expectSourceCommit: sourceCommit, expectSourceZipSha256: kit.source.zipSha256, expectCandidateSha256: null, expectContractSha256: kit.acceptanceContractSha256, requiredGates: kit.requiredGates.map(({ id }) => id) }, null, 2)}\n`, 'utf8');
  const files = listFilesRecursive(outputDirectory).filter((relativePath) => relativePath !== 'checksums.sha256');
  fs.writeFileSync(path.join(outputDirectory, 'checksums.sha256'), `${files.map((relativePath) => `${sha256File(path.join(outputDirectory, ...relativePath.split('/')))}  ${relativePath}`).join('\n')}\n`, 'utf8');
  return { outputDirectory, sourceCommit, sourceZip, bundle, sourceZipSha256: kit.source.zipSha256, fileCount: files.length };
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
      if (!contractPath || !evidenceRoot || !outputPath) throw new Error('Usage: node workbench-acceptance-kit.js preflight <contract.json> <evidence-root> <new-output.json>');
      process.stdout.write(`${JSON.stringify(writeToolPreflight({ contractPath, evidenceRoot, outputPath }), null, 2)}\n`);
    } else if (args[0] === 'handoff') {
      const [, contractPath, outputDirectory, sourceCommit, sampleZip, repoRoot = process.cwd()] = args;
      if (!contractPath || !outputDirectory || !sourceCommit) throw new Error('Usage: node scripts/workbench-acceptance-kit.js handoff <contract.json> <new-output-dir> <sourceCommit> [sample.zip] [repoRoot]');
      process.stdout.write(`${JSON.stringify(createHandoff({ repoRoot, contractPath, outputDirectory, sourceCommit, sampleZip: sampleZip || null }), null, 2)}\n`);
    } else {
      const [contractPath, sourceZip, outputDirectory, sourceCommit] = args;
      if (!contractPath || !sourceZip || !outputDirectory) throw new Error('Usage: node scripts/workbench-acceptance-kit.js <contract.json> <source.zip> <new-output-dir> [sourceCommit]');
      process.stdout.write(`${JSON.stringify(createKit({ contractPath, sourceZip, outputDirectory, sourceCommit }), null, 2)}\n`);
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { buildAcceptanceKit, createHandoff, createKit, evaluateTestRun, listZipEntries, normalizeZipEntry, renderPrompt, renderReportTemplate, runToolPreflight, sha256File, validateContract, verifyGitCommit, writeToolPreflight };
