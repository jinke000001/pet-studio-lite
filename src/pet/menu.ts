import type { MenuItemConstructorOptions } from 'electron';

/**
 * 桌宠右键菜单的纯构建函数（type-only 引用 electron，Node 可直接单测）。
 *
 * 菜单顺序（与产品约定一致）：
 *   自动游走（勾选开关）/ 调整宠物尺寸 / 回到屏幕右下角 / 关于 / 退出。
 * 工作室预览与导出运行时用同一份构建函数，差别只在 actions 注入
 * （预览不持久化，运行时持久化）与 closeLabel 文案。
 */

export interface PetMenuModel {
  /** 当前"自动游走"开关状态（checkbox 勾选）。 */
  wanderEnabled: boolean;
  /** 最后一个菜单项文案（运行时 = 退出；工作室预览 = 关闭预览）。 */
  closeLabel: string;
}

export interface PetMenuActions {
  /** 勾选状态变化（checkbox 点击后传新状态）。 */
  onToggleWander(enabled: boolean): void;
  /** 打开 100%–300% 连续尺寸滑杆面板。 */
  onOpenSizeControl(): void;
  /** 回到当前显示器 workArea 右下角。 */
  onGoHome(): void;
  onInfo(): void;
  onClose(): void;
}

export function buildPetContextMenu(model: PetMenuModel, actions: PetMenuActions): MenuItemConstructorOptions[] {
  return [
    {
      label: '🐾  自动游走',
      type: 'checkbox',
      checked: model.wanderEnabled,
      click: (item) => actions.onToggleWander(item.checked),
    },
    {
      label: '🔍  调整宠物尺寸…',
      click: () => actions.onOpenSizeControl(),
    },
    { type: 'separator' },
    { label: '📍  回到屏幕右下角', click: () => actions.onGoHome() },
    { label: 'ℹ️  关于这只宠物', click: () => actions.onInfo() },
    { type: 'separator' },
    { label: model.closeLabel, accelerator: 'CmdOrCtrl+Q', click: () => actions.onClose() },
  ];
}
