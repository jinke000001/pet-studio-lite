import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePetdexInstallCommand } from './petdex-install';

const PETDEX_ORIGIN = 'https://petdex.dev';
const ASSET_ORIGIN = 'https://assets.petdex.dev';
const COMPACT_MANIFEST_URL = `${PETDEX_ORIGIN}/api/manifest/v2`;
const LEGACY_MANIFEST_URL = `${PETDEX_ORIGIN}/api/manifest`;
const COMPACT_MANIFEST_REDIRECT = `${ASSET_ORIGIN}/manifests/petdex-v2.json`;
const LEGACY_MANIFEST_REDIRECT = `${ASSET_ORIGIN}/manifests/petdex-v1.json`;
const COMPACT_FIELDS = [
  'slug',
  'displayName',
  'kind',
  'submittedBy',
  'spritesheet',
  'petJson',
  'zip',
  'spriteVersionNumber',
] as const;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MANIFEST_LIMIT = 8 * 1024 * 1024;
const DEFAULT_PET_JSON_LIMIT = 512 * 1024;
const DEFAULT_SPRITESHEET_LIMIT = 64 * 1024 * 1024;

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PetdexDownloadOptions {
  /** 用于测试或宿主网络层注入；生产环境默认使用 Node/Electron 内置 fetch。 */
  fetchImpl?: FetchImpl;
  /** 每一次 HTTP 请求（含读取响应体）的超时。 */
  timeoutMs?: number;
  maxManifestBytes?: number;
  maxPetJsonBytes?: number;
  maxSpritesheetBytes?: number;
}

export interface DownloadedPetdexPack {
  slug: string;
  sourcePath: string;
}

interface ManifestPet {
  slug: string;
  spritesheetUrl: string;
  petJsonUrl: string;
}

interface DownloadLimits {
  timeoutMs: number;
  manifest: number;
  petJson: number;
  spritesheet: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`${label}配置无效`);
  }
  return resolved;
}

function resolveLimits(options: PetdexDownloadOptions): DownloadLimits {
  return {
    timeoutMs: boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 120_000, 'Petdex 下载超时时间'),
    manifest: boundedInteger(options.maxManifestBytes, DEFAULT_MANIFEST_LIMIT, 16 * 1024 * 1024, 'Petdex manifest 大小上限'),
    petJson: boundedInteger(options.maxPetJsonBytes, DEFAULT_PET_JSON_LIMIT, 2 * 1024 * 1024, 'Petdex pet.json 大小上限'),
    spritesheet: boundedInteger(
      options.maxSpritesheetBytes,
      DEFAULT_SPRITESHEET_LIMIT,
      128 * 1024 * 1024,
      'Petdex 图集大小上限',
    ),
  };
}

function trustedAssetUrl(raw: string, base?: string): string {
  let url: URL;
  try {
    url = base ? new URL(raw, `${base.replace(/\/+$/, '')}/`) : new URL(raw);
  } catch {
    throw new Error('Petdex manifest 包含无效的官方资源地址');
  }
  if (
    url.origin !== ASSET_ORIGIN ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Petdex manifest 包含不可信的官方资源地址');
  }
  return url.toString();
}

function parseCompactManifest(input: unknown): ManifestPet[] {
  if (!isRecord(input) || input['v'] !== 2 || !Array.isArray(input['pets'])) {
    throw new Error('Petdex compact manifest 格式无效');
  }
  if (
    !Array.isArray(input['fields']) ||
    input['fields'].length !== COMPACT_FIELDS.length ||
    input['fields'].some((field, index) => field !== COMPACT_FIELDS[index])
  ) {
    throw new Error('Petdex compact manifest 字段无效');
  }
  if (typeof input['assetBase'] !== 'string') throw new Error('Petdex compact manifest 缺少资源根地址');
  const assetBase = trustedAssetUrl(input['assetBase']);
  if (input['total'] !== undefined && input['total'] !== input['pets'].length) {
    throw new Error('Petdex compact manifest 数量不一致');
  }

  return input['pets'].map((row, index) => {
    if (
      !Array.isArray(row) ||
      row.length !== COMPACT_FIELDS.length ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      typeof row[2] !== 'string' ||
      (row[3] !== null && typeof row[3] !== 'string') ||
      typeof row[4] !== 'string' ||
      typeof row[5] !== 'string' ||
      (row[6] !== null && typeof row[6] !== 'string') ||
      (row[7] !== 1 && row[7] !== 2)
    ) {
      throw new Error(`Petdex compact manifest 第 ${index + 1} 条记录无效`);
    }
    return {
      slug: row[0],
      spritesheetUrl: trustedAssetUrl(row[4], assetBase),
      petJsonUrl: trustedAssetUrl(row[5], assetBase),
    };
  });
}

function parseLegacyManifest(input: unknown): ManifestPet[] {
  if (!isRecord(input) || !Array.isArray(input['pets'])) throw new Error('Petdex legacy manifest 格式无效');
  if (input['total'] !== undefined && input['total'] !== input['pets'].length) {
    throw new Error('Petdex legacy manifest 数量不一致');
  }
  return input['pets'].map((row, index) => {
    if (
      !isRecord(row) ||
      typeof row['slug'] !== 'string' ||
      typeof row['spritesheetUrl'] !== 'string' ||
      typeof row['petJsonUrl'] !== 'string'
    ) {
      throw new Error(`Petdex legacy manifest 第 ${index + 1} 条记录无效`);
    }
    return {
      slug: row['slug'],
      spritesheetUrl: trustedAssetUrl(row['spritesheetUrl']),
      petJsonUrl: trustedAssetUrl(row['petJsonUrl']),
    };
  });
}

async function readBoundedBody(response: Response, maximum: number, label: string): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maximum) {
      throw new Error(`${label}超过大小上限`);
    }
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new Error(`${label}超过大小上限`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

type BoundedResponse =
  | { kind: 'redirect'; location: string }
  | { kind: 'body'; bytes: Buffer };

async function fetchOnce(
  url: string,
  label: string,
  maximum: number,
  timeoutMs: number,
  fetchImpl: FetchImpl,
  headers: Record<string, string>,
): Promise<BoundedResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`${label}下载超时`));
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`${label}返回了没有目标的重定向`);
      return { kind: 'redirect', location: new URL(location, url).toString() };
    }
    if (!response.ok) throw new Error(`${label}下载失败（HTTP ${response.status}）`);
    return { kind: 'body', bytes: await readBoundedBody(response, maximum, label) };
  } catch (error) {
    if (timedOut || controller.signal.aborted) throw new Error(`${label}下载超时`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBounded(
  url: string,
  expectedRedirect: string | null,
  label: string,
  maximum: number,
  limits: DownloadLimits,
  fetchImpl: FetchImpl,
  headers: Record<string, string>,
): Promise<Buffer> {
  const first = await fetchOnce(url, label, maximum, limits.timeoutMs, fetchImpl, headers);
  if (first.kind === 'body') return first.bytes;
  if (!expectedRedirect || first.location !== expectedRedirect) {
    throw new Error(`${label}重定向到了非官方固定地址`);
  }
  const second = await fetchOnce(first.location, label, maximum, limits.timeoutMs, fetchImpl, headers);
  if (second.kind === 'redirect') throw new Error(`${label}重定向次数超过上限`);
  return second.bytes;
}

function parseJson(bytes: Buffer, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label}不是合法的 UTF-8 JSON`);
  }
}

async function fetchManifest(limits: DownloadLimits, fetchImpl: FetchImpl): Promise<ManifestPet[]> {
  let compactError: unknown;
  try {
    const bytes = await fetchBounded(
      COMPACT_MANIFEST_URL,
      COMPACT_MANIFEST_REDIRECT,
      'Petdex compact manifest',
      limits.manifest,
      limits,
      fetchImpl,
      { Accept: 'application/json' },
    );
    return parseCompactManifest(parseJson(bytes, 'Petdex compact manifest'));
  } catch (error) {
    compactError = error;
  }

  try {
    const bytes = await fetchBounded(
      LEGACY_MANIFEST_URL,
      LEGACY_MANIFEST_REDIRECT,
      'Petdex legacy manifest',
      limits.manifest,
      limits,
      fetchImpl,
      { Accept: 'application/json' },
    );
    return parseLegacyManifest(parseJson(bytes, 'Petdex legacy manifest'));
  } catch (legacyError) {
    const compactMessage = compactError instanceof Error ? compactError.message : String(compactError);
    const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError);
    throw new Error(`Petdex manifest 不可用（v2：${compactMessage}；legacy：${legacyMessage}）`);
  }
}

function spriteFileName(urlText: string): 'spritesheet.png' | 'spritesheet.webp' {
  const pathname = new URL(urlText).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return 'spritesheet.png';
  if (pathname.endsWith('.webp')) return 'spritesheet.webp';
  throw new Error('Petdex manifest 图集格式无效（只支持 PNG 或 WebP）');
}

function validatePetJson(bytes: Buffer, expectedSpritePath: string): void {
  const input = parseJson(bytes, 'Petdex pet.json');
  if (!isRecord(input)) throw new Error('Petdex pet.json 顶层必须是对象');
  if (input['spritesheetPath'] !== expectedSpritePath) {
    throw new Error(`Petdex pet.json 的 spritesheetPath 必须是 ${expectedSpritePath}`);
  }
}

function validateSpritesheet(bytes: Buffer, fileName: 'spritesheet.png' | 'spritesheet.webp'): void {
  if (fileName.endsWith('.png')) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
      throw new Error('Petdex 图集不是有效的 PNG 文件');
    }
    return;
  }
  if (
    bytes.length < 12 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error('Petdex 图集不是有效的 WebP 文件');
  }
}

/**
 * 复刻官方 CLI 的 manifest -> pet.json + spritesheet 下载语义，但把结果写入
 * 工作台专属缓存，不执行 Petdex/npm，也不写 ~/.petdex 或 ~/.codex。
 *
 * 官方依据（固定到调研时的源码提交）：
 * https://github.com/crafter-station/petdex/blob/a1b229116968cbe9f3a9b2141634a9baa0819864/packages/petdex-cli/src/manifest.ts
 * https://github.com/crafter-station/petdex/blob/a1b229116968cbe9f3a9b2141634a9baa0819864/packages/petdex-cli/bin/petdex.ts#L282-L336
 */
export async function downloadPetdexPack(
  rawCommand: unknown,
  cacheRoot: string,
  options: PetdexDownloadOptions = {},
): Promise<DownloadedPetdexPack> {
  const slug = parsePetdexInstallCommand(rawCommand);
  const limits = resolveLimits(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  if (typeof cacheRoot !== 'string' || cacheRoot.trim() === '') throw new Error('Petdex 缓存目录无效');

  await fs.mkdir(cacheRoot, { recursive: true });
  const realCacheRoot = await fs.realpath(cacheRoot);
  let sourcePath: string | null = null;
  try {
    const manifest = await fetchManifest(limits, fetchImpl);
    const pet = manifest.find((candidate) => candidate.slug === slug);
    if (!pet) throw new Error(`Petdex 中未找到宠物：${slug}`);

    const spriteName = spriteFileName(pet.spritesheetUrl);
    sourcePath = await fs.mkdtemp(path.join(realCacheRoot, `${slug}-`));
    const headers = { Referer: `${PETDEX_ORIGIN}/` };
    const petJson = await fetchBounded(
      pet.petJsonUrl,
      null,
      'Petdex pet.json',
      limits.petJson,
      limits,
      fetchImpl,
      headers,
    );
    validatePetJson(petJson, spriteName);
    const spritesheet = await fetchBounded(
      pet.spritesheetUrl,
      null,
      'Petdex 图集',
      limits.spritesheet,
      limits,
      fetchImpl,
      headers,
    );
    validateSpritesheet(spritesheet, spriteName);

    // 顺序写入使清理没有并发写入竞态；目录是本次调用刚创建的唯一目录。
    await fs.writeFile(path.join(sourcePath, 'pet.json'), petJson, { flag: 'wx' });
    await fs.writeFile(path.join(sourcePath, spriteName), spritesheet, { flag: 'wx' });
    return { slug, sourcePath };
  } catch (error) {
    if (sourcePath) await fs.rm(sourcePath, { recursive: true, force: true });
    throw error;
  }
}
