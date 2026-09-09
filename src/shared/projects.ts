import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDeclaredVersion, type PetPackInfo } from './petpack';
import { validatePetConfig, DEFAULT_PET_CONFIG, type PetRuntimeConfig } from './config';

/**
 * 制作台项目存储（纯 Node、rootDir 注入，可在临时目录里单测）。
 *
 * 布局：
 *   <root>/projects.json                — 索引：当前项目 + 项目列表
 *   <root>/projects/<id>/pet.json       — 导入时的只读副本
 *   <root>/projects/<id>/<spritesheet>  — 图集副本
 *   <root>/projects/<id>/project.json   — 项目元数据 + 运行时配置
 *
 * 规则：
 *   - 导入 = 复制到版本化新目录（id 带时间戳后缀），绝不原地修改输入；
 *     复制后核对 SHA-256，不一致即删除半成品并报错。
 *   - projects.json 损坏时不白屏：挪到 .corrupt-<ts> 备份并以空状态恢复，
 *     恢复事件通过 load() 返回值告知 UI。
 *   - 校验失败的包不会留下"看似成功"的项目目录。
 *   - 身份区分三层：meta.id = 制作台内部项目实例 ID（带时间戳）；
 *     meta.petId = 真实宠物 ID（pet.json 的 id）；meta.slug = 目录名 slug。
 *     旧项目缺少新字段时 load() 里做只增不改的安全迁移（不清空任何项目）。
 */

/** 来源信息：类型 + 稳定内容指纹；绝对路径只存在 sourcePath（内部用），不进 manifest。 */
export interface ProjectSource {
  type: 'dir' | 'zip';
  /** 内容指纹：sha256("petdex-pack:" + petJsonSha256 + ":" + spritesheetSha256)。 */
  fingerprint: string;
  /** ZIP 导入时额外记录原始 ZIP 文件的 SHA-256。 */
  zipSha256?: string;
}

export interface ProjectMeta {
  /** 制作台内部项目实例 ID（带时间戳，版本化目录名）。 */
  id: string;
  /** 真实宠物 ID（pet.json 的 id 字段）。 */
  petId: string;
  slug: string;
  displayName: string;
  petdexVersion: 'v1' | 'v2';
  /** pet.json 实际声明的版本（未声明 = null）。 */
  declaredVersion: 'v1' | 'v2' | null;
  license: 'authorized' | 'internal-test' | 'unknown';
  spritesheetFile: string;
  hashes: { petJson: string; spritesheet: string };
  source: ProjectSource;
  sourcePath: string;       // 导入来源（仅制作台内部展示，不进入导出 manifest）
  importedAt: string;       // ISO
  config: PetRuntimeConfig;
}

/** 计算来源包的内容指纹（稳定、可解释、不含路径）。 */
export function packFingerprint(hashes: { petJson: string; spritesheet: string }): string {
  return crypto.createHash('sha256')
    .update(`petdex-pack:${hashes.petJson}:${hashes.spritesheet}`)
    .digest('hex');
}

/** 导入来源描述（importValidatedPack 入参）。 */
export interface ImportSourceInfo {
  type: 'dir' | 'zip';
  /** 用户选择的原始路径（仅记录，不进入导出产物）。 */
  path: string;
  /** ZIP 导入时原始 ZIP 的 SHA-256。 */
  zipSha256?: string;
}

export interface ProjectsIndex {
  schemaVersion: number;
  currentProjectId: string | null;
  projects: ProjectMeta[];
}

const INDEX_FILE = 'projects.json';
const INDEX_SCHEMA = 1;

function emptyIndex(): ProjectsIndex {
  return { schemaVersion: INDEX_SCHEMA, currentProjectId: null, projects: [] };
}

async function sha256File(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function timestampId(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'pet';
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
  return `${safe}-${stamp}`;
}

export class ProjectsStore {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private get indexFile(): string {
    return path.join(this.rootDir, INDEX_FILE);
  }

  projectDir(id: string): string {
    return path.join(this.rootDir, 'projects', id);
  }

  /** 读取索引。损坏时备份损坏文件并返回空索引 + recovered 标记。旧项目缺新字段时做安全迁移。 */
  async load(): Promise<{ index: ProjectsIndex; recovered: boolean }> {
    let text: string;
    try {
      text = await fs.readFile(this.indexFile, 'utf8');
    } catch {
      return { index: emptyIndex(), recovered: false }; // 首次使用
    }
    let index: ProjectsIndex;
    try {
      const parsed = JSON.parse(text) as ProjectsIndex;
      if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.projects)) {
        throw new Error('shape');
      }
      index = { schemaVersion: INDEX_SCHEMA, currentProjectId: parsed.currentProjectId ?? null, projects: parsed.projects };
    } catch {
      const backup = `${this.indexFile}.corrupt-${Date.now()}`;
      try { await fs.rename(this.indexFile, backup); } catch { /* ignore */ }
      return { index: emptyIndex(), recovered: true };
    }
    // 向后兼容迁移：旧项目缺少 petId/declaredVersion/source 时，从项目目录
    // 里的 pet.json 只读补齐（绝不删除或重置任何已有项目）。
    let migrated = false;
    for (let i = 0; i < index.projects.length; i++) {
      const m = await this.migrateLegacyMeta(index.projects[i]!);
      if (m) {
        index.projects[i] = m;
        migrated = true;
      }
    }
    if (migrated) await this.save(index);
    return { index, recovered: false };
  }

  /**
   * 旧项目元数据迁移：补齐 petId（真实宠物 ID）、declaredVersion、source
   * （类型 + 内容指纹）。返回 null 表示无需迁移。所有字段只增不改，
   * 已有的 id / config / sourcePath 原样保留。
   */
  private async migrateLegacyMeta(meta: ProjectMeta): Promise<ProjectMeta | null> {
    const legacy = meta as ProjectMeta & { petId?: string; declaredVersion?: 'v1' | 'v2' | null; source?: ProjectSource };
    const needsPetId = typeof legacy.petId !== 'string' || !legacy.petId;
    const needsDeclared = legacy.declaredVersion === undefined;
    const needsSource = !legacy.source || typeof legacy.source.fingerprint !== 'string';
    if (!needsPetId && !needsDeclared && !needsSource) return null;

    let petId = legacy.petId || legacy.slug || legacy.id;
    let declaredVersion: 'v1' | 'v2' | null = legacy.declaredVersion ?? null;
    if (needsPetId || needsDeclared) {
      try {
        const obj = JSON.parse(await fs.readFile(path.join(this.projectDir(meta.id), 'pet.json'), 'utf8')) as Record<string, unknown>;
        if (needsPetId && typeof obj['id'] === 'string' && obj['id'].trim()) petId = obj['id'].trim();
        if (needsDeclared) {
          try { declaredVersion = resolveDeclaredVersion(obj); } catch { declaredVersion = null; }
        }
      } catch { /* pet.json 读不到就用 slug/现有值兜底 */ }
    }
    const source: ProjectSource = needsSource
      ? {
          type: typeof legacy.sourcePath === 'string' && legacy.sourcePath.toLowerCase().endsWith('.zip') ? 'zip' : 'dir',
          fingerprint: packFingerprint(legacy.hashes),
        }
      : legacy.source!;
    return { ...meta, petId, declaredVersion, source };
  }

  private async save(index: ProjectsIndex): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const tmp = `${this.indexFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
    await fs.rename(tmp, this.indexFile);
  }

  async getCurrent(): Promise<ProjectMeta | null> {
    const { index } = await this.load();
    return index.projects.find((p) => p.id === index.currentProjectId) ?? null;
  }

  async get(id: string): Promise<ProjectMeta | null> {
    const { index } = await this.load();
    return index.projects.find((p) => p.id === id) ?? null;
  }

  async setCurrent(id: string): Promise<ProjectsIndex> {
    const { index, recovered } = await this.load();
    if (!index.projects.some((p) => p.id === id)) {
      throw new Error(`项目不存在：${id}`);
    }
    index.currentProjectId = id;
    await this.save(index);
    void recovered;
    return index;
  }

  async remove(id: string): Promise<ProjectsIndex> {
    const { index } = await this.load();
    index.projects = index.projects.filter((p) => p.id !== id);
    if (index.currentProjectId === id) {
      index.currentProjectId = index.projects[0]?.id ?? null;
    }
    await this.save(index);
    await fs.rm(this.projectDir(id), { recursive: true, force: true });
    return index;
  }

  /**
   * 把一个已通过校验的包复制进版本化项目目录。
   * 复制后核对哈希；任何一步失败都清理半成品并抛中文错误。
   * 记录真实宠物 ID、声明版本、来源类型与内容指纹（不含绝对路径进 manifest）。
   */
  async importValidatedPack(pack: PetPackInfo, source: ImportSourceInfo): Promise<ProjectMeta> {
    // 用 pet.json 里的稳定 id 作为项目 slug —— 目录导入时 pack.slug 是目录名，
    // 但 ZIP 导入时它是临时解压目录名（petstudio-import-XXX），不能用。
    const stableSlug = pack.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || pack.slug;
    const id = timestampId(stableSlug);
    const dir = this.projectDir(id);
    try {
      await fs.mkdir(dir, { recursive: true });
      const sheetName = path.basename(pack.spritesheetPath);
      const srcSheet = path.join(pack.rootDir, pack.spritesheetPath);
      const dstSheet = path.join(dir, sheetName);
      const dstJson = path.join(dir, 'pet.json');
      await fs.copyFile(path.join(pack.rootDir, 'pet.json'), dstJson);
      await fs.copyFile(srcSheet, dstSheet);
      // 复制完整性核对
      const [jsonHash, sheetHash] = await Promise.all([sha256File(dstJson), sha256File(dstSheet)]);
      if (jsonHash !== pack.hashes.petJson || sheetHash !== pack.hashes.spritesheet) {
        throw new Error('导入复制校验失败：副本哈希与原始包不一致');
      }
      const meta: ProjectMeta = {
        id,
        petId: pack.id,
        slug: stableSlug,
        displayName: pack.displayName,
        petdexVersion: pack.version,
        declaredVersion: pack.declaredVersion,
        license: pack.license,
        spritesheetFile: sheetName,
        hashes: pack.hashes,
        source: {
          type: source.type,
          fingerprint: packFingerprint(pack.hashes),
          ...(source.zipSha256 ? { zipSha256: source.zipSha256 } : {}),
        },
        sourcePath: source.path,
        importedAt: new Date().toISOString(),
        config: { ...DEFAULT_PET_CONFIG, petName: pack.displayName },
      };
      await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(meta, null, 2), 'utf8');
      const { index } = await this.load();
      index.projects.unshift(meta);
      index.currentProjectId = id;
      await this.save(index);
      return meta;
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** 更新项目配置（先过共享校验器，非法值不落盘）。 */
  async updateConfig(id: string, patch: unknown): Promise<ProjectMeta> {
    const meta = await this.get(id);
    if (!meta) throw new Error(`项目不存在：${id}`);
    const merged = { ...meta.config, ...(typeof patch === 'object' && patch !== null ? patch : {}) };
    const res = validatePetConfig(merged);
    if (!res.ok) throw new Error(res.errors.join('；'));
    const next: ProjectMeta = { ...meta, config: res.config };
    await fs.writeFile(path.join(this.projectDir(id), 'project.json'), JSON.stringify(next, null, 2), 'utf8');
    const { index } = await this.load();
    const i = index.projects.findIndex((p) => p.id === id);
    if (i >= 0) index.projects[i] = next;
    await this.save(index);
    return next;
  }
}
