export type ManualEvidenceProfile = 'none' | 'core' | 'mixed';

export interface ArtifactIntegrityExpectation {
  schemaVersion: 1;
  executable: { path: string; sha256: string };
  manifestSha256: string;
}

export interface WindowsEvidenceExpectations {
  expectedIntegrity: ArtifactIntegrityExpectation;
  expectedManifest: unknown;
  expectedAcceptanceScriptSha256?: string;
  expectedWindowsGeneration?: '10' | '11';
  expectedDpiPercent?: 100 | 125 | 150;
  minSoakMinutes?: number;
  requiredManualProfile?: Exclude<ManualEvidenceProfile, 'none'>;
}

export interface WindowsEvidenceValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    dpiPercent: number | null;
    windowsGeneration: '10' | '11' | null;
    automaticPassed: number;
    automaticFailed: number;
    manualProfile: ManualEvidenceProfile | null;
    soakMinutes: number;
    sampleCount: number;
  };
}

export const REQUIRED_AUTOMATIC_CHECKS = [
  '验收前没有同名运行时残留',
  'ZIP 已完整解压且 manifest 存在',
  '产物为 Windows x64 内测包',
  '运行时完整性记录存在',
  '实际运行的 EXE 与 manifest 身份匹配候选记录',
  '验收脚本身份已记录',
  '记录 Windows 版本与架构',
  '首次启动出现一只可见宠物窗口',
  '首只宠物窗口与虚拟桌面有效相交',
  '记录当前 Windows DPI',
  '再次启动由单实例进程召唤第二只宠物',
  '自动游走触发可观察的位置变化',
  '关闭其中一只不会退出另一只',
  '关闭最后一只后运行时完全退出',
] as const;

export const REQUIRED_SOAK_CHECKS = [
  '长稳期间进程、窗口与响应状态持续正常',
  '长稳期间反复召唤并关闭宠物',
  'PowerShell 窗口探测子进程没有持续堆积',
  '长稳工作集没有明显持续增长',
  '长稳句柄数没有明显持续增长',
] as const;

export const CORE_MANUAL_CHECK_IDS = [
  'transparent-background',
  'continuous-motion',
  'edge-impact',
  'visible-boundary',
  'notepad-interaction',
  'menu-and-size',
] as const;

export const MIXED_MANUAL_CHECK_IDS = [
  ...CORE_MANUAL_CHECK_IDS,
  'mixed-dpi-anchor',
] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!isRecord(item)) return item;
    return Object.fromEntries(
      Object.keys(item).sort().map((key) => [key, normalize(item[key])]),
    );
  };
  return JSON.stringify(normalize(value));
}

function validDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameHash(actual: unknown, expected: string): boolean {
  return typeof actual === 'string' && actual.toLowerCase() === expected.toLowerCase();
}

export function validateWindowsEvidence(
  input: unknown,
  expectations: WindowsEvidenceExpectations,
): WindowsEvidenceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary: WindowsEvidenceValidation['summary'] = {
    dpiPercent: null,
    windowsGeneration: null,
    automaticPassed: 0,
    automaticFailed: 0,
    manualProfile: null,
    soakMinutes: 0,
    sampleCount: 0,
  };

  if (!isRecord(input)) {
    return { ok: false, errors: ['result.json 顶层必须是对象'], warnings, summary };
  }

  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    errors.push('result.json schemaVersion 不受支持');
  }

  const startedAt = validDate(input.startedAt);
  const finishedAt = validDate(input.finishedAt);
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
    errors.push('验收开始/结束时间无效');
  }

  const expectedIntegrity = expectations.expectedIntegrity;
  if (!sameHash(input.runtimeExeSha256, expectedIntegrity.executable.sha256)) {
    errors.push('Windows 实际运行 EXE 的 SHA-256 与候选不一致');
  }
  if (!sameHash(input.manifestSha256, expectedIntegrity.manifestSha256)) {
    errors.push('Windows 实际 manifest 的 SHA-256 与候选不一致');
  }
  if (stableJson(input.artifactIntegrity) !== stableJson(expectedIntegrity)) {
    errors.push('result.json 内 artifactIntegrity 与候选不一致');
  }
  if (stableJson(input.manifest) !== stableJson(expectations.expectedManifest)) {
    errors.push('result.json 内 manifest 与候选不一致');
  }
  if (expectations.expectedAcceptanceScriptSha256 !== undefined
    && !sameHash(input.acceptanceScriptSha256, expectations.expectedAcceptanceScriptSha256)) {
    errors.push('Windows 实际使用的验收脚本 SHA-256 与候选不一致');
  }

  const os = isRecord(input.os) ? input.os : null;
  const windowsGeneration = os?.generation;
  const buildNumber = finiteNumber(os?.buildNumber);
  const architecture = os?.architecture;
  if ((windowsGeneration !== '10' && windowsGeneration !== '11')
    || buildNumber === null || buildNumber < 10240
    || typeof architecture !== 'string' || !architecture.includes('64')) {
    errors.push('Windows 版本或 64 位架构记录无效');
  } else {
    summary.windowsGeneration = windowsGeneration;
    if (expectations.expectedWindowsGeneration !== undefined
      && windowsGeneration !== expectations.expectedWindowsGeneration) {
      errors.push(`Windows 代际不符：期望 Windows ${expectations.expectedWindowsGeneration}，实际 Windows ${windowsGeneration}`);
    }
  }

  const dpi = finiteNumber(input.dpi);
  if (dpi === null || dpi <= 0) {
    errors.push('Windows DPI 记录无效');
  } else {
    summary.dpiPercent = Math.round((dpi / 96) * 100);
    if (expectations.expectedDpiPercent !== undefined
      && summary.dpiPercent !== expectations.expectedDpiPercent) {
      errors.push(`Windows DPI 档位不符：期望 ${expectations.expectedDpiPercent}%，实际 ${summary.dpiPercent}%`);
    }
  }

  const checks = Array.isArray(input.checks) ? input.checks : [];
  if (!Array.isArray(input.checks)) errors.push('result.json checks 必须是数组');
  const checkNames = new Set<string>();
  let observedPassed = 0;
  let observedFailed = 0;
  for (const item of checks) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.passed !== 'boolean') {
      errors.push('自动检查条目格式无效');
      continue;
    }
    if (checkNames.has(item.name)) errors.push(`自动检查名称重复：${item.name}`);
    checkNames.add(item.name);
    if (item.passed) observedPassed += 1;
    else {
      observedFailed += 1;
      errors.push(`检查未通过：${item.name}`);
    }
  }
  summary.automaticPassed = observedPassed;
  summary.automaticFailed = observedFailed;
  for (const name of REQUIRED_AUTOMATIC_CHECKS) {
    if (!checkNames.has(name)) errors.push(`缺少自动检查：${name}`);
  }
  if (finiteNumber(input.passed) !== observedPassed || finiteNumber(input.failed) !== observedFailed) {
    errors.push(`自动检查汇总计数不一致：逐项 ${observedPassed}/${observedFailed}`);
  }
  if (observedFailed > 0) errors.push(`自动验收存在 ${observedFailed} 个失败项`);

  const manual = isRecord(input.manual) ? input.manual : null;
  const profile = manual?.profile;
  if (profile === 'none' || profile === 'core' || profile === 'mixed') {
    summary.manualProfile = profile;
  } else if (input.schemaVersion === 2 || expectations.requiredManualProfile) {
    errors.push('人工验收记录缺失或 profile 无效');
  }
  const manualChecks = manual && Array.isArray(manual.checks) ? manual.checks : [];
  const manualById = new Map<string, boolean>();
  for (const item of manualChecks) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.passed !== 'boolean') {
      errors.push('人工验收条目格式无效');
      continue;
    }
    if (manualById.has(item.id)) errors.push(`人工验收条目重复：${item.id}`);
    manualById.set(item.id, item.passed);
  }
  if (expectations.requiredManualProfile) {
    const requiredIds = expectations.requiredManualProfile === 'mixed'
      ? MIXED_MANUAL_CHECK_IDS
      : CORE_MANUAL_CHECK_IDS;
    if (expectations.requiredManualProfile === 'mixed' && profile !== 'mixed') {
      errors.push('需要 mixed 人工验收，core 记录不能替代混合 DPI 双屏证据');
    }
    if (expectations.requiredManualProfile === 'core' && profile !== 'core' && profile !== 'mixed') {
      errors.push('需要 core 人工验收记录');
    }
    if (validDate(manual?.completedAt) === null) errors.push('人工验收完成时间无效');
    for (const id of requiredIds) {
      if (!manualById.has(id)) errors.push(`缺少人工验收项：${id}`);
      else if (!manualById.get(id)) errors.push(`人工验收未通过：${id}`);
    }
  } else if (!manual || profile === 'none') {
    warnings.push('尚未记录人工视觉验收；自动证据不能替代实际动画、贴边和攀爬观察');
  }

  const soak = isRecord(input.soak) ? input.soak : null;
  const requestedMinutes = finiteNumber(soak?.requestedMinutes) ?? 0;
  const sampleSeconds = finiteNumber(soak?.sampleSeconds) ?? 0;
  const lifecycleCycleMinutes = finiteNumber(soak?.lifecycleCycleMinutes) ?? 0;
  const lifecycleCycles = finiteNumber(soak?.lifecycleCycles) ?? 0;
  const samples = soak && Array.isArray(soak.samples) ? soak.samples : [];
  summary.soakMinutes = requestedMinutes;
  summary.sampleCount = samples.length;

  const minSoakMinutes = expectations.minSoakMinutes ?? (requestedMinutes > 0 ? requestedMinutes : 0);
  if (minSoakMinutes > 0) {
    if (!soak) errors.push('缺少长稳 soak 记录');
    if (requestedMinutes < minSoakMinutes) {
      errors.push(`长稳请求时长不足：期望至少 ${minSoakMinutes} 分钟，实际 ${requestedMinutes} 分钟`);
    }
    if (sampleSeconds < 5 || sampleSeconds > 300) errors.push('长稳采样间隔无效');
    const allowedTimeShortfallSeconds = Math.max(90, sampleSeconds * 2);
    if (startedAt !== null && finishedAt !== null
      && (finishedAt - startedAt) / 1000 < minSoakMinutes * 60 - allowedTimeShortfallSeconds) {
      errors.push(`长稳实际持续时间不足 ${minSoakMinutes} 分钟`);
    }
    const expectedSamples = sampleSeconds > 0
      ? Math.max(1, Math.floor((minSoakMinutes * 60 / sampleSeconds) * 0.9))
      : 1;
    if (samples.length < expectedSamples) {
      errors.push(`长稳采样数量不足：期望至少 ${expectedSamples}，实际 ${samples.length}`);
    }
    for (const name of REQUIRED_SOAK_CHECKS) {
      if (!checkNames.has(name)) errors.push(`缺少长稳自动检查：${name}`);
    }

    const sampleTimes: number[] = [];
    let unhealthySamples = 0;
    let invalidSampleTimes = 0;
    let outOfOrderSamples = 0;
    let previousSampleTime: number | null = null;
    for (const sample of samples) {
      if (!isRecord(sample)) {
        unhealthySamples += 1;
        continue;
      }
      const timestamp = validDate(sample.timestamp);
      if (timestamp !== null) {
        sampleTimes.push(timestamp);
        if (previousSampleTime !== null && timestamp < previousSampleTime) outOfOrderSamples += 1;
        if ((startedAt !== null && timestamp < startedAt - 60_000)
          || (finishedAt !== null && timestamp > finishedAt + 60_000)) {
          invalidSampleTimes += 1;
        }
        previousSampleTime = timestamp;
      } else {
        invalidSampleTimes += 1;
      }
      const processCount = finiteNumber(sample.processCount);
      const visibleWindows = finiteNumber(sample.visibleWindows);
      const probeChildren = finiteNumber(sample.probeChildren);
      const workingSetMb = finiteNumber(sample.workingSetMb);
      const handleCount = finiteNumber(sample.handleCount);
      if (sample.responding !== true || processCount === null || processCount < 1
        || visibleWindows === null || visibleWindows < 1
        || probeChildren === null || probeChildren < 0 || probeChildren > 2
        || workingSetMb === null || workingSetMb < 0
        || handleCount === null || handleCount < 0) {
        unhealthySamples += 1;
      }
    }
    if (unhealthySamples > 0) errors.push(`长稳采样存在 ${unhealthySamples} 个不健康条目`);
    if (invalidSampleTimes > 0) errors.push(`长稳采样存在 ${invalidSampleTimes} 个无效或越界时间戳`);
    if (outOfOrderSamples > 0) errors.push(`长稳采样时间顺序错误：${outOfOrderSamples} 处`);
    sampleTimes.sort((a, b) => a - b);
    if (sampleTimes.length >= 2) {
      const coverageSeconds = (sampleTimes[sampleTimes.length - 1]! - sampleTimes[0]!) / 1000;
      if (coverageSeconds < minSoakMinutes * 60 - allowedTimeShortfallSeconds) {
        errors.push(`长稳采样时间覆盖不足：${Math.round(coverageSeconds)} 秒`);
      }
    } else {
      errors.push('长稳采样时间戳不足');
    }
    const expectedCycles = lifecycleCycleMinutes > 0
      ? Math.max(0, Math.ceil(minSoakMinutes / lifecycleCycleMinutes) - 1)
      : Number.POSITIVE_INFINITY;
    if (lifecycleCycles < expectedCycles) {
      errors.push(`长稳生命周期循环不足：期望至少 ${expectedCycles}，实际 ${lifecycleCycles}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, summary };
}
