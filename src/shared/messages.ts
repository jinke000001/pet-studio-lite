/**
 * 制作台 UI 文案（纯函数、零 Node 依赖，渲染器与 Node 测试都可引用）。
 */

/**
 * 删除项目的确认文案。必须说清楚影响范围：
 * 只删工作区副本，不动原始 Petdex 包，不动已导出的 ZIP。
 */
export function removeConfirmMessage(displayName: string): string {
  return `确定删除制作台项目「${displayName}」吗？\n\n` +
    '只会删除制作台内部的工作区副本；不会删除原始 Petdex 宠物包，也不会删除已经导出的 ZIP。';
}
