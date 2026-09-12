import type { PetSpriteConfig, LicenseStatus, PetdexVersion } from './petpack';
import type { PetRuntimeConfig } from './config';
import type { ProjectMeta, ProjectsIndex, UsageMode } from './projects';
import type { ClassicRuntimeBehavior } from './shimeji/runtime-plan';

export type { ProjectMeta, ProjectsIndex, UsageMode, PetRuntimeConfig, PetSpriteConfig, LicenseStatus, PetdexVersion };

/** 制作台渲染器拿到的完整状态。 */
export interface StudioState {
  index: ProjectsIndex;
  /** projects.json 曾损坏并被自动备份重置（UI 需提示）。 */
  recovered: boolean;
}

export type ImportResult =
  | { ok: true; project: ProjectMeta }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; errors: string[] };

/** Petdex 下载完成、尚未写入制作台项目的只读候选。 */
export interface PetdexImportCandidate {
  token: string;
  slug: string;
  petId: string;
  displayName: string;
  petdexVersion: PetdexVersion;
  declaredVersion: PetdexVersion | null;
  license: LicenseStatus;
  sprite: PetSpriteConfig;
  spritesheetDataUrl: string;
}

export type PetdexPrepareResult =
  | { ok: true; candidate: PetdexImportCandidate }
  | { ok: false; errors: string[] };

/** 检查步骤的展示模型：每一项检查一行。 */
export interface CheckItem {
  label: string;
  ok: boolean;
  detail?: string;
}

/** 制作台内预览需要的数据（图集 data URL + 精灵配置）。 */
export interface PreviewPayload {
  sourceFormat?: import('./petpack').PetSourceFormat | null;
  sprite: PetSpriteConfig;
  spritesheetDataUrl: string;
  config: PetRuntimeConfig;
  license: LicenseStatus;
  petdexVersion: PetdexVersion;
}

export type ExportPhase =
  | 'prepare'      // 准备导出临时目录
  | 'build-runtime'// 打包 Windows 运行时
  | 'assemble'     // 写入 manifest / 说明并重新打包
  | 'verify'       // 静态核验产物
  | 'done';

export interface ExportProgressEvent {
  phase: ExportPhase;
  message: string;
}

export type ExportResult =
  | { ok: true; zipPath: string; sha256: string; manifest: import('./manifest').ExportManifest }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string };

/** 桌宠窗口（工作室预览与导出运行时共用）的初始化数据。 */
export interface PetWindowPayload {
  sprite: PetSpriteConfig;
  spritesheetDataUrl: string;
  config: PetRuntimeConfig;
  /** 预览模式 = 工作室里开的临时窗口（不持久化位置）。 */
  preview: boolean;
  petdexVersion: PetdexVersion;
  license: LicenseStatus;
  classicBehaviorPlan?: ClassicRuntimeBehavior[] | null;
}
