import type { LicenseStatus, PetdexVersion } from './petpack';
import type { ProjectSource } from './projects';

/**
 * 导出产物内的 manifest.json（放在便携包 resources/ 与 ZIP 顶层各一份，内容一致）。
 * 所有字段在导出时由制作台生成，纯函数可测。
 *
 * 身份区分：
 *   - pet.id            真实宠物 ID（pet.json 的 id 字段）
 *   - pet.slug          目录名 slug
 *   - studioProjectId   制作台内部项目实例 ID（带时间戳，仅追溯用）
 * 来源追溯：
 *   - source.type        dir / zip
 *   - source.fingerprint 内容指纹 = sha256("petdex-pack:"+petJsonSha256+":"+spritesheetSha256)
 *   - source.zipSha256   ZIP 导入时额外记录的原始 ZIP 哈希
 * manifest 绝不包含用户机器上的绝对路径。
 */
export interface ExportManifest {
  product: string;            // 产品名（宠物运行时）
  productVersion: string;
  pet: {
    id: string;
    slug: string;
    displayName: string;
    petdexVersion: PetdexVersion;
    declaredVersion: PetdexVersion | null;
  };
  /** 制作台内部项目实例 ID（追溯用，不是路径）。 */
  studioProjectId: string;
  source: ProjectSource;
  hashes: {
    petJsonSha256: string;
    spritesheetSha256: string;
  };
  exportedAt: string;         // ISO-8601
  platform: 'win32';
  arch: 'x64';
  license: LicenseStatus;
  /** internal-test 导出的产物为内部测试候选，manifest 里明确标记。 */
  distribution: 'candidate' | 'internal-test-only';
}

export function buildManifest(input: {
  productVersion: string;
  pet: { id: string; slug: string; displayName: string; petdexVersion: PetdexVersion; declaredVersion: PetdexVersion | null };
  studioProjectId: string;
  source: ProjectSource;
  hashes: { petJsonSha256: string; spritesheetSha256: string };
  license: LicenseStatus;
  exportedAt?: Date;
}): ExportManifest {
  return {
    product: 'Pet Studio Lite 桌宠',
    productVersion: input.productVersion,
    pet: input.pet,
    studioProjectId: input.studioProjectId,
    source: input.source,
    hashes: input.hashes,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    platform: 'win32',
    arch: 'x64',
    license: input.license,
    distribution: input.license === 'internal-test' ? 'internal-test-only' : 'candidate',
  };
}

/**
 * 授权门：仅 authorized 允许生成分发候选；internal-test 生成明确标记的
 * 内部测试候选；unknown 阻止导出。返回 null 表示允许导出，否则为中文原因。
 */
export function licenseExportBlock(license: LicenseStatus): string | null {
  if (license === 'authorized' || license === 'internal-test') return null;
  return '该宠物包未声明授权状态（pet.json 缺少 license 字段），无法生成可分发候选。' +
    '请确认授权后在 pet.json 中写入 "license": "authorized"，或标记为 "internal-test" 仅用于内部测试。';
}
