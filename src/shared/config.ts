/**
 * 宠物运行时配置与制作台共用的校验逻辑（纯函数，Node 可测）。
 *
 * 同一份校验用于三处：制作台 UI 即时校验、main process IPC 入参校验、
 * 导出写入前的最终把关 —— 非法值在任何一层都不能进入状态或导出产物。
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2] as const;
export const PET_NAME_MAX = 24;

export interface PetRuntimeConfig {
  /** 宠物显示名称（1–24 字符）。 */
  petName: string;
  /** 窗口缩放倍数（0.5–2）。 */
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
    } else if (o['zoom'] < ZOOM_MIN || o['zoom'] > ZOOM_MAX) {
      errors.push(`缩放超出范围（${ZOOM_MIN}–${ZOOM_MAX}）`);
    } else {
      zoom = o['zoom'];
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
