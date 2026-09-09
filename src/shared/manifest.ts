import type { LicenseStatus, PetdexVersion } from './petpack';
import type { ProjectSource, UsageMode } from './projects';

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
 * 授权如实记录三层，互不冒充：
 *   - sourceLicense  原包授权状态（pet.json 声明；未声明 = unknown，绝不写成 authorized）
 *   - usageMode      制作台项目的使用方式（internal-test / general）
 *   - distribution   最终产物性质（candidate / internal-test-only）
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
  /** 原包授权状态（= pet.json 的 license；unknown 表示未声明）。 */
  sourceLicense: LicenseStatus;
  /** 项目使用方式。 */
  usageMode: UsageMode;
  /** 兼容字段：与 sourceLicense 相同，供旧版核验工具读取。 */
  license: LicenseStatus;
  /** 最终产物性质：只有 authorized + general 才是可分发候选，其余一律内部测试。 */
  distribution: 'candidate' | 'internal-test-only';
}

/**
 * 最终产物性质：仅当原包明确声明 authorized 且项目按常规方式使用时，
 * 才生成分发候选；其余（internal-test、unknown 原包，或项目自身标记为
 * 内部体验）一律 internal-test-only。
 */
export function resolveDistribution(sourceLicense: LicenseStatus, usageMode: UsageMode): 'candidate' | 'internal-test-only' {
  return sourceLicense === 'authorized' && usageMode === 'general' ? 'candidate' : 'internal-test-only';
}

export function buildManifest(input: {
  productVersion: string;
  pet: { id: string; slug: string; displayName: string; petdexVersion: PetdexVersion; declaredVersion: PetdexVersion | null };
  studioProjectId: string;
  source: ProjectSource;
  hashes: { petJsonSha256: string; spritesheetSha256: string };
  sourceLicense: LicenseStatus;
  usageMode: UsageMode;
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
    sourceLicense: input.sourceLicense,
    usageMode: input.usageMode,
    license: input.sourceLicense,
    distribution: resolveDistribution(input.sourceLicense, input.usageMode),
  };
}

/**
 * 导出说明文案：告诉用户本次导出的产物性质。unknown 不再阻止导出 ——
 * 未声明授权的原包默认走「个人／内部体验」，产物标记 internal-test-only，
 * 绝不把 unknown 写成 authorized。
 */
export function distributionNote(sourceLicense: LicenseStatus, usageMode: UsageMode): string {
  if (resolveDistribution(sourceLicense, usageMode) === 'candidate') {
    return '原包已声明授权，本产物为可分发候选。';
  }
  if (sourceLicense === 'unknown') {
    return '原宠物包未声明授权，本产物仅供个人或内部测试，不得对外分发。';
  }
  return '本产物为内部测试候选（internal-test），请勿对外分发。';
}
