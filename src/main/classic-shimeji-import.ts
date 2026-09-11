import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  compileClassicShimeji,
  compileClassicRuntimePlan,
  type ClassicAction,
  type ClassicPose,
  type ClassicShimejiProfile,
} from '../shared/shimeji/classic-config';
import { PETDEX_COLS, PETDEX_FRAME, PETDEX_VERSIONS } from '../shared/petpack';

const MAX_SCAN_FILES = 1_024;
const MAX_SCAN_DEPTH = 5;
const MAX_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 16_000_000;

export interface ClassicConversionResult {
  outputDir: string;
  profile: ClassicShimejiProfile;
  warnings: string[];
}

interface SourceFile {
  absolute: string;
  relative: string;
  size: number;
}

interface FrameInput {
  file: string;
  flip: boolean;
}

/**
 * Convert one classic Shimeji directory into the app's immutable Petdex-v1
 * interchange format. The source is only read; output must not already exist.
 */
export async function convertClassicShimejiDirectory(
  sourceDir: string,
  outputDir: string,
): Promise<ClassicConversionResult> {
  const root = await requireDirectory(sourceDir);
  if (await exists(outputDir)) throw new Error(`经典 Shimeji 转换目标已存在：${outputDir}`);

  const files = await scanSourceFiles(root);
  const actionsFile = pickConfig(files, ['actions.xml'], 'actions.xml');
  const behaviorsFile = pickConfig(files, ['behaviors.xml', 'behavior.xml'], 'behaviors.xml');
  const [actionsXml, behaviorsXml] = await Promise.all([
    fs.readFile(actionsFile.absolute, 'utf8'),
    fs.readFile(behaviorsFile.absolute, 'utf8'),
  ]);
  const compiled = compileClassicShimeji(actionsXml, behaviorsXml);
  if (!compiled.ok) throw new Error(`经典 Shimeji 配置不兼容：${compiled.errors.join('；')}`);

  const imageFiles = buildImageIndex(files);
  validateReferencedImages(compiled.profile, imageFiles);
  const warnings = [...compiled.warnings];
  const rows = buildStateRows(compiled.profile, imageFiles, warnings);

  // Decode and normalize everything before creating output, so malformed input
  // cannot leave a half-imported directory behind.
  const cache = new Map<string, Buffer>();
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let row = 0; row < PETDEX_VERSIONS.v1.rows; row += 1) {
    const sequence = rows[row]!;
    for (let col = 0; col < PETDEX_COLS; col += 1) {
      const source = sequence[col % sequence.length]!;
      const key = `${source.file}\u0000${source.flip ? 'flip' : 'plain'}`;
      let input = cache.get(key);
      if (!input) {
        input = await normalizeFrame(source);
        cache.set(key, input);
      }
      layers.push({
        input,
        left: col * PETDEX_FRAME.width,
        top: row * PETDEX_FRAME.height,
      });
    }
  }

  const slug = slugify(path.basename(root));
  const displayName = path.basename(root).trim() || 'Classic Shimeji';
  const sheet = await sharp({
    create: {
      width: PETDEX_VERSIONS.v1.sheetWidth,
      height: PETDEX_VERSIONS.v1.sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers).png().toBuffer();
  const manifest = {
    id: `classic-${slug}`,
    displayName,
    description: '由 Pet Studio Lite 从经典 Shimeji 资源安全转换',
    spriteVersionNumber: 1,
    spritesheetPath: 'spritesheet.png',
    license: 'unknown',
    sourceFormat: 'classic-shimeji',
    classicProfile: compiled.profile,
    classicBehaviorPlan: compileClassicRuntimePlan(compiled.profile),
  };

  try {
    await fs.mkdir(outputDir, { recursive: false });
    await Promise.all([
      fs.writeFile(path.join(outputDir, 'spritesheet.png'), sheet),
      fs.writeFile(path.join(outputDir, 'pet.json'), JSON.stringify(manifest, null, 2), 'utf8'),
    ]);
    return { outputDir, profile: compiled.profile, warnings };
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function requireDirectory(dir: string): Promise<string> {
  try {
    const real = await fs.realpath(dir);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('not directory');
    return real;
  } catch {
    throw new Error(`经典 Shimeji 目录不存在或不可读：${dir}`);
  }
}

async function scanSourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (files.length >= MAX_SCAN_FILES) throw new Error(`经典 Shimeji 文件数量超过 ${MAX_SCAN_FILES}`);
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`经典 Shimeji 不允许符号链接：${path.relative(root, absolute)}`);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() !== 'unused') await visit(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolute);
      files.push({ absolute, relative: path.relative(root, absolute), size: stat.size });
    }
  }
  await visit(root, 0);
  return files;
}

function pickConfig(files: SourceFile[], names: string[], label: string): SourceFile {
  const allowed = new Set(names.map((name) => name.toLowerCase()));
  const candidates = files.filter((file) => allowed.has(path.basename(file.relative).toLowerCase()));
  if (candidates.length === 0) throw new Error(`经典 Shimeji 缺少 ${label}`);
  if (candidates.length > 1) {
    throw new Error(`找到多个 ${label}，请直接选择单个角色目录：${candidates.map((file) => file.relative).join('、')}`);
  }
  return candidates[0]!;
}

function buildImageIndex(files: SourceFile[]): Map<string, SourceFile> {
  const images = new Map<string, SourceFile>();
  for (const file of files) {
    if (path.extname(file.relative).toLowerCase() !== '.png') continue;
    if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error(`经典 Shimeji 图片大小异常：${file.relative}`);
    }
    const key = path.basename(file.relative).toLowerCase();
    if (images.has(key)) throw new Error(`经典 Shimeji 图片文件名重复：${path.basename(file.relative)}`);
    images.set(key, file);
  }
  if (images.size === 0) throw new Error('经典 Shimeji 没有 PNG 动作图片');
  return images;
}

function validateReferencedImages(profile: ClassicShimejiProfile, images: Map<string, SourceFile>): void {
  for (const action of profile.actions) {
    for (const pose of action.poses) {
      for (const image of [pose.image, pose.imageRight].filter((value): value is string => !!value)) {
        if (!images.has(image.toLowerCase())) throw new Error(`动作 ${action.name} 引用的图片不存在：${image}`);
      }
    }
  }
}

function buildStateRows(
  profile: ClassicShimejiProfile,
  images: Map<string, SourceFile>,
  warnings: string[],
): FrameInput[][] {
  const actions = new Map(profile.actions.map((action) => [action.name, action]));
  const poseCache = new Map<string, ClassicPose[]>();
  const collect = (action: ClassicAction, visiting = new Set<string>()): ClassicPose[] => {
    const cached = poseCache.get(action.name);
    if (cached) return cached;
    if (visiting.has(action.name)) return [];
    const nextVisiting = new Set(visiting).add(action.name);
    const result = action.poses.slice(0, PETDEX_COLS);
    for (const name of action.references) {
      if (result.length >= PETDEX_COLS) break;
      const referenced = actions.get(name);
      if (referenced) result.push(...collect(referenced, nextVisiting).slice(0, PETDEX_COLS - result.length));
    }
    poseCache.set(action.name, result);
    return result;
  };
  const posesFor = (kinds: ClassicAction['kind'][]): ClassicPose[] => {
    for (const kind of kinds) {
      for (const action of profile.actions) {
        if (action.kind !== kind) continue;
        const poses = collect(action);
        if (poses.length > 0) return poses;
      }
    }
    return [];
  };
  const fallback = posesFor(['stand']).length > 0
    ? posesFor(['stand'])
    : profile.actions.flatMap((action) => collect(action)).slice(0, 1);
  if (fallback.length === 0) throw new Error('经典 Shimeji 配置没有任何可用 Pose 图片');

  const row = (label: string, kinds: ClassicAction['kind'][], orientation: 'neutral' | 'left' | 'right' = 'neutral'): FrameInput[] => {
    const selected = posesFor(kinds);
    const poses = selected.length > 0 ? selected : fallback;
    if (selected.length === 0) warnings.push(`${label} 没有专用帧，已使用站立帧代替`);
    return poses.map((pose) => {
      if (orientation === 'right') {
        const explicit = pose.imageRight;
        return { file: images.get((explicit ?? pose.image).toLowerCase())!.absolute, flip: !explicit };
      }
      return { file: images.get(pose.image.toLowerCase())!.absolute, flip: false };
    });
  };

  return [
    row('idle', ['stand']),
    row('walking-right', ['walk', 'chase-mouse'], 'right'),
    row('walking-left', ['walk', 'chase-mouse'], 'left'),
    row('talking', ['unknown', 'stand']),
    row('jumping', ['jump', 'thrown', 'fall']),
    row('failed', ['fall', 'thrown']),
    row('waiting', ['stand']),
    row('running', ['chase-mouse', 'walk'], 'right'),
    row('review', ['climb', 'stand']),
  ];
}

async function normalizeFrame(source: FrameInput): Promise<Buffer> {
  let image = sharp(source.file, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'error' });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
    throw new Error(`经典 Shimeji 图片无法解码为 PNG：${path.basename(source.file)}`);
  }
  image = sharp(source.file, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'error' });
  if (source.flip) image = image.flop();
  return image
    .resize(PETDEX_FRAME.width, PETDEX_FRAME.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'shimeji';
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(() => true, () => false);
}
