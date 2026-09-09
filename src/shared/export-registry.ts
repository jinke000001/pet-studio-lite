import path from 'node:path';
import { IpcValidationError } from './ipc-validate';

/**
 * 本次会话内导出产物的登记册 + "打开所在文件夹"目标校验（纯逻辑，Node 可测）。
 *
 * 安全模型：renderer 只能请求"打开导出结果所在文件夹"，绝不接受任意路径 ——
 * 目标必须 (1) 是 .zip，且 (2) 在本次会话确实由导出流程生成并登记。
 * 路径先归一化（path.resolve）再比较：等价的 ../ 写法指向同一文件是合法的，
 * 但"磁盘上真实存在、只是本次没导出过"的文件一律拒绝。
 */

export class ExportRegistry {
  private readonly paths = new Set<string>();

  /** 导出成功后登记最终 ZIP 的路径（归一化为绝对路径）。 */
  record(zipPath: string): void {
    this.paths.add(path.resolve(zipPath));
  }

  has(zipPath: string): boolean {
    return this.paths.has(path.resolve(zipPath));
  }
}

/**
 * 校验"打开所在文件夹"的目标；非法时抛 IpcValidationError（中文说明）。
 * 返回归一化后的绝对路径；调用方再做存在性检查（fs.stat）与
 * shell.showItemInFolder。
 */
export function resolveRevealTarget(raw: unknown, registry: ExportRegistry): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) {
    throw new IpcValidationError('路径必须是非空字符串');
  }
  if (!raw.toLowerCase().endsWith('.zip')) {
    throw new IpcValidationError('只允许打开导出产物 ZIP');
  }
  const target = path.resolve(raw);
  if (!registry.has(target)) {
    throw new IpcValidationError('只允许打开本次会话由导出生成的文件');
  }
  return target;
}
