import sharp from 'sharp';
import fs from 'node:fs/promises';
import { detectImageSize } from '../shared/petpack';

/**
 * 图集真实解码探针（PNG / WebP），供 Electron main 注入 validatePetPack，
 * 也直接被 Node 测试复用。
 *
 * 为什么不用 Electron nativeImage：nativeImage 只支持 PNG/JPEG，对完全合法
 * 的 WebP 也会返回空图（Petdex 真实包大量用 WebP）。sharp 基于 libvips，
 * 预编译 N-API 二进制在 Node 与 Electron（ABI 稳定的 Node-API）里都能直接
 * 加载，无需 Electron 重新编译，也不引入任何网络/命令行依赖。
 *
 * 这里做的是"真实全像素解码"，不是只读文件头：
 *   - 损坏 / 截断 / 伪造文件头的图会在 raw 解码阶段抛错 → 中文拒绝；
 *   - 解码出的实际尺寸再与文件头声称的尺寸交叉核对，防"头好身坏"。
 *   - limitInputPixels 限制像素总量，防解压炸弹拖垮进程。
 */
export async function sharpImageProbe(absPath: string, head: Buffer): Promise<string | null> {
  const declared = detectImageSize(head);
  try {
    // libvips may cache a file-backed WebP after decoding, keeping it locked on
    // Windows. readFile closes its handle before decoding; a Buffer gives the
    // decoder no source file to retain (also covers ZIP import/export snapshots).
    const bytes = await fs.readFile(absPath);
    const { info } = await sharp(bytes, { limitInputPixels: 64_000_000 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (declared && (info.width !== declared.width || info.height !== declared.height)) {
      return (
        `图集文件头声称 ${declared.width}×${declared.height}，但实际解码得到 ` +
        `${info.width}×${info.height}（文件不完整或已被篡改）`
      );
    }
    return null;
  } catch {
    return '图集无法解码：文件头看似合法，但内容不是可解码的图片（文件可能已损坏或被截断）';
  }
}
