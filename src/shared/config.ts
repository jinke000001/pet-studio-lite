/**
 * 宠物运行时配置与制作台共用的校验逻辑（纯函数，Node 可测）。
 *
 * 同一份校验用于三处：制作台 UI 即时校验、main process IPC 入参校验、
 * 导出写入前的最终把关 —— 非法值在任何一层都不能进入状态或导出产物。
 */

/**
 * 全产品统一的三档缩放档位与标签（唯一事实来源）：
 * 小 125% / 中 150% / 大 200%（默认、推荐）。
 * 制作台配置页下拉与桌宠右键菜单都消费 ZOOM_OPTIONS，文案不会漂移。
 */
export const ZOOM_LEVELS = [1.25, 1.5, 2] as const;
export const ZOOM_OPTIONS: ReadonlyArray<{ zoom: number; label: string }> = [
  { zoom: 1.25, label: '小 125%' },
  { zoom: 1.5, label: '中 150%' },
  { zoom: 2, label: '大 200%（推荐）' },
];
export const PET_NAME_MAX = 24;

/** 旧档位（50% / 75% / 100%）自动迁移为"小 125%"。 */
const LEGACY_ZOOM_PROMOTE: ReadonlyMap<number, number> = new Map([[0.5, 1.25], [0.75, 1.25], [1, 1.25]]);

/**
 * 缩放值规范化（严格档位契约 + 历史数据兼容的唯一入口）：
 * - 旧档位 0.5 / 0.75 / 1 → 1.25（迁移为小 125%）；
 * - 仅 1.25 / 1.5 / 2 原样保留 —— 1.2、1.7 等任意中间值不受支持；
 * - 非数字、非有限、不受支持的值 → null（调用方安全回落：持久化状态回落
 *   随包配置；配置校验与项目迁移回落默认 200%）。
 */
export function normalizeZoom(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const promoted = LEGACY_ZOOM_PROMOTE.get(raw);
  if (promoted !== undefined) return promoted;
  return (ZOOM_LEVELS as readonly number[]).includes(raw) ? raw : null;
}

export interface PetRuntimeConfig {
  /** 宠物显示名称（1–24 字符）。 */
  petName: string;
  /** 窗口缩放倍数（严格三档：1.25 / 1.5 / 2；旧档 0.5 / 0.75 / 1 迁移为 1.25）。 */
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
    // 严格档位契约：旧档静默迁移为 125%；中间值/越界/非数字一律安全
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
