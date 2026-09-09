/**
 * 宠物运行时配置与制作台共用的校验逻辑（纯函数，Node 可测）。
 *
 * 同一份校验用于三处：制作台 UI 即时校验、main process IPC 入参校验、
 * 导出写入前的最终把关 —— 非法值在任何一层都不能进入状态或导出产物。
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2;
/** 全产品统一的三档缩放：小 100% / 中 150%（默认、推荐）/ 大 200%。 */
export const ZOOM_LEVELS = [1, 1.5, 2] as const;
export const PET_NAME_MAX = 24;

/** 旧档位（50% / 75%）自动提升为"小 100%"；100% / 150% / 200% 原样保留。 */
const LEGACY_ZOOM_PROMOTE: ReadonlyMap<number, number> = new Map([[0.5, 1], [0.75, 1]]);

/**
 * 缩放值规范化（历史数据兼容的唯一入口）：
 * - 旧档位 0.5 / 0.75 → 1（提升为小 100%）；
 * - 范围内的有限数字（1–2，含 100%/150%/200%）原样保留；
 * - 非数字、非有限、超范围 → null（调用方安全回落：状态回落随包配置 /
 *   配置校验报错回落默认值）。
 */
export function normalizeZoom(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const promoted = LEGACY_ZOOM_PROMOTE.get(raw);
  if (promoted !== undefined) return promoted;
  if (raw < ZOOM_MIN || raw > ZOOM_MAX) return null;
  return raw;
}

export interface PetRuntimeConfig {
  /** 宠物显示名称（1–24 字符）。 */
  petName: string;
  /** 窗口缩放倍数（三档：1 / 1.5 / 2；旧档 0.5 / 0.75 自动提升为 1）。 */
  zoom: number;
  /** 基础行为开关：闲置时自动游走。 */
  wanderEnabled: boolean;
}

export const DEFAULT_PET_CONFIG: PetRuntimeConfig = {
  petName: '桌宠',
  // 真实 Windows 反馈：100% 偏小，150% 是合适的默认标准大小。
  // 只影响"新项目/缺省配置"——已有项目保存过的 zoom 不会被覆盖。
  zoom: 1.5,
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
    if (typeof o['zoom'] !== 'number' || !Number.isFinite(o['zoom'])) {
      errors.push('缩放必须是有限数字');
    } else {
      // 旧档 0.5 / 0.75 静默提升为 1；其余越界值报错（调用方回落默认）。
      const normalized = normalizeZoom(o['zoom']);
      if (normalized === null) {
        errors.push(`缩放超出范围（${ZOOM_MIN}–${ZOOM_MAX}）`);
      } else {
        zoom = normalized;
      }
    }
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
