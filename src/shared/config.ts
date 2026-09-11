/**
 * 宠物运行时配置与制作台共用的校验逻辑（纯函数，Node 可测）。
 *
 * 同一份校验用于三处：制作台 UI 即时校验、main process IPC 入参校验、
 * 导出写入前的最终把关 —— 非法值在任何一层都不能进入状态或导出产物。
 */

/**
 * 桌宠尺寸契约：制作台与导出桌宠都使用 100%–300%、每档 5% 的连续
 * 滑杆。两处共用同一安全边界，避免配置与实际运行体验漂移。
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.05;
export const PET_NAME_MAX = 24;

/** 旧档位（50% / 75%）自动迁移为新的最小值 100%。 */
const LEGACY_ZOOM_PROMOTE: ReadonlyMap<number, number> = new Map([[0.5, 1], [0.75, 1]]);

/**
 * 缩放值规范化（滑杆步进契约 + 历史数据兼容的唯一入口）：
 * - 旧档位 0.5 / 0.75 → 1（迁移为小 100%）；
 * - 1–3 范围内、落在 5% 网格上的值原样保留；
 * - 非数字、非有限、不受支持的值 → null（调用方安全回落：持久化状态回落
 *   随包配置；配置校验与项目迁移回落默认 200%）。
 */
export function normalizeZoom(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const promoted = LEGACY_ZOOM_PROMOTE.get(raw);
  if (promoted !== undefined) return promoted;
  const percent = Math.round(raw * 100);
  if (Math.abs(raw * 100 - percent) > 1e-6) return null;
  const minPercent = Math.round(ZOOM_MIN * 100);
  const maxPercent = Math.round(ZOOM_MAX * 100);
  const stepPercent = Math.round(ZOOM_STEP * 100);
  if (percent < minPercent || percent > maxPercent || (percent - minPercent) % stepPercent !== 0) return null;
  return percent / 100;
}

export interface PetRuntimeConfig {
  /** 宠物显示名称（1–24 字符）。 */
  petName: string;
  /** 窗口缩放倍数（1–3、步进 0.05；旧档 0.5 / 0.75 迁移为 1）。 */
  zoom: number;
  /** 基础行为开关：闲置时自动游走。 */
  wanderEnabled: boolean;
}

export const DEFAULT_PET_CONFIG: PetRuntimeConfig = {
  petName: '桌宠',
  // 真实 Windows 反馈：系统缩放 100% 时，200% 是合适的默认标准大小。
  // 只影响"新项目/缺省配置"——已有项目保存过的 zoom 不会被覆盖。
  zoom: 2,
  wanderEnabled: true,
};

/** 校验并规范化一份配置；返回错误列表（空数组 = 合法）。 */
export function validatePetConfig(raw: unknown): { ok: true; config: PetRuntimeConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['配置必须是一个对象'] };
  }
  const o = raw as Record<string, unknown>;

  let petName = DEFAULT_PET_CONFIG.petName;
  if (o['petName'] !== undefined) {
    if (typeof o['petName'] !== 'string') {
      errors.push('宠物名必须是字符串');
    } else {
      const t = o['petName'].trim();
      if (t.length === 0) errors.push('宠物名不能为空');
      else if (t.length > PET_NAME_MAX) errors.push(`宠物名最长 ${PET_NAME_MAX} 个字符`);
      else petName = t;
    }
  }

  let zoom = DEFAULT_PET_CONFIG.zoom;
  if (o['zoom'] !== undefined) {
    // 滑杆步进契约：旧档静默迁移为 100%；非步进值/越界/非数字一律安全
    // 回落默认 200%（不报错——配置值永远合法，坏数据进不了状态与导出产物）。
    zoom = normalizeZoom(o['zoom']) ?? DEFAULT_PET_CONFIG.zoom;
  }

  let wanderEnabled = DEFAULT_PET_CONFIG.wanderEnabled;
  if (o['wanderEnabled'] !== undefined) {
    if (typeof o['wanderEnabled'] !== 'boolean') {
      errors.push('自动游走开关必须是布尔值');
    } else {
      wanderEnabled = o['wanderEnabled'];
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { petName, zoom, wanderEnabled } };
}
