import type { MenuItemConstructorOptions } from 'electron';

/**
 * 桌宠右键菜单的纯构建函数（type-only 引用 electron，Node 可直接单测）。
 *
 * 菜单顺序（与产品约定一致）：
 *   自动游走（勾选开关）/ 可选的再召唤一只 / 调整宠物尺寸 /
 *   回到屏幕右下角 / 关于 / 关闭这只 / 可选的退出全部。
 * 工作室预览与导出运行时用同一份构建函数，差别只在 actions 注入
 * （预览不持久化，运行时持久化）与 closeLabel 文案。
 */

export interface PetMenuModel {
  /** 当前"自动游走"开关状态（checkbox 勾选）。 */
  wanderEnabled: boolean;
  /** 最后一个菜单项文案（运行时 = 退出；工作室预览 = 关闭预览）。 */
  closeLabel: string;
  /** 当前是否低于运行时宠物数量上限；仅提供 onSpawn 时显示。 */
  canSpawn?: boolean;
}

export interface PetMenuActions {
  /** 勾选状态变化（checkbox 点击后传新状态）。 */
  onToggleWander(enabled: boolean): void;
  /** 打开 100%–300% 连续尺寸滑杆面板。 */
  onOpenSizeControl(): void;
  /** 回到当前显示器 workArea 右下角。 */
  onGoHome(): void;
  onInfo(): void;
  /** 导出运行时提供；工作室预览不显示召唤入口。 */
  onSpawn?: () => void;
  onClose(): void;
  /** 多宠物运行时提供；关闭单只与退出全部保持不同语义。 */
  onQuit?: () => void;
}

export function buildPetContextMenu(model: PetMenuModel, actions: PetMenuActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    {
      label: '🐾  自动游走',
      type: 'checkbox',
      checked: model.wanderEnabled,
      click: (item) => actions.onToggleWander(item.checked),
    },
  ];
  if (actions.onSpawn) {
    items.push({
      label: '🐣  再召唤一只',
      enabled: model.canSpawn !== false,
      click: () => actions.onSpawn?.(),
    });
  }
  items.push(
    {
      label: '🔍  调整宠物尺寸…',
      click: () => actions.onOpenSizeControl(),
    },
    { type: 'separator' },
    { label: '📍  回到屏幕右下角', click: () => actions.onGoHome() },
    { label: 'ℹ️  关于这只宠物', click: () => actions.onInfo() },
    { type: 'separator' },
    { label: model.closeLabel, click: () => actions.onClose() },
  );
  if (actions.onQuit) {
    items.push({ label: '👋  退出全部宠物', accelerator: 'CmdOrCtrl+Q', click: () => actions.onQuit?.() });
  }
  return items;
}
