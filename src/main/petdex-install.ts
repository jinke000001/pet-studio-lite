import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const COMMAND_PATTERN = /^npx\s+(?:--yes\s+)?petdex\\?@latest\s+install\s+([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;
const OUTPUT_LIMIT = 32 * 1024;

export interface NpxLookupOptions {
  platform?: NodeJS.Platform;
  pathValue?: string;
}

export interface PetdexRunOptions {
  executable: string;
  timeoutMs?: number;
}

export interface PendingPetdexCandidate {
  slug: string;
  sourcePath: string;
  fingerprint: string;
}

/** 会话内一次性确认令牌：确认、过期或新候选产生后均不能复用旧令牌。 */
export class PetdexCandidateRegistry {
  private readonly entries = new Map<string, PendingPetdexCandidate & { createdAt: number }>();

  constructor(
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly now = () => Date.now(),
    private readonly makeToken = () => crypto.randomUUID(),
  ) {}

  issue(candidate: PendingPetdexCandidate): string {
    const token = this.makeToken();
    this.entries.clear();
    this.entries.set(token, { ...candidate, createdAt: this.now() });
    return token;
  }

  take(token: string): PendingPetdexCandidate {
    const pending = this.entries.get(token);
    if (!pending) throw new Error('下载候选已失效，请重新下载');
    this.entries.delete(token);
    if (this.now() - pending.createdAt > this.ttlMs) throw new Error('下载候选已过期，请重新下载');
    const { createdAt: _createdAt, ...candidate } = pending;
    return candidate;
  }

  cancel(token: string): void {
    this.entries.delete(token);
  }
}

/**
 * 只接受 Petdex 页面给出的完整安装命令。返回值仅是安全 slug；原始文本
 * 永远不会进入子进程。反斜杠仅兼容富文本复制出的 `petdex\@latest`。
 */
export function parsePetdexInstallCommand(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Petdex 命令必须是文本');
  if (raw.length > 256) throw new Error('Petdex 命令过长');
  const normalized = raw.trim().replace(/[ \t\r\n]+/g, ' ');
  const match = COMMAND_PATTERN.exec(normalized);
  if (!match) {
    throw new Error('命令格式不正确，请粘贴类似：npx petdex@latest install capvolt');
  }
  return match[1]!;
}

/** GUI 从 Finder 启动时 PATH 可能比终端短，因此补充常见 Node 安装位置。 */
export async function findNpxExecutable(options: NpxLookupOptions = {}): Promise<string> {
  const platform = options.platform ?? process.platform;
  const executableName = platform === 'win32' ? 'npx.cmd' : 'npx';
  const pathValue = options.pathValue ?? process.env['PATH'] ?? '';
  const pathCandidates = pathValue.split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, executableName));
  const commonCandidates = platform === 'darwin'
    ? ['/opt/homebrew/bin/npx', '/usr/local/bin/npx', '/usr/bin/npx']
    : platform === 'win32'
      ? []
      : ['/usr/local/bin/npx', '/usr/bin/npx'];

  for (const candidate of [...new Set([...pathCandidates, ...commonCandidates])]) {
    try {
      await fs.access(candidate, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
      return candidate;
    } catch {
      // 继续尝试下一个固定候选路径。
    }
  }
  throw new Error('未找到 npx。请先安装 Node.js 20 或更高版本，然后重新打开 Pet Studio Lite。');
}

/** 把已校验的 slug 收敛到 Petdex 的 pets 根目录，并拒绝链接替身。 */
export async function resolvePetdexPetDirectory(petsRoot: string, slug: string): Promise<string> {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    throw new Error('Petdex 宠物名称格式非法');
  }
  const [realRoot, candidateStat] = await Promise.all([
    fs.realpath(petsRoot).catch(() => { throw new Error('Petdex 下载目录不存在'); }),
    fs.lstat(path.join(petsRoot, slug)).catch(() => { throw new Error(`下载完成，但未找到宠物目录：${slug}`); }),
  ]);
  if (candidateStat.isSymbolicLink()) throw new Error('Petdex 宠物目录不能是符号链接');
  if (!candidateStat.isDirectory()) throw new Error('Petdex 下载结果不是宠物目录');
  const realCandidate = await fs.realpath(path.join(petsRoot, slug));
  if (!realCandidate.startsWith(realRoot + path.sep)) throw new Error('Petdex 宠物目录越界');
  return realCandidate;
}

/** 用固定 argv 启动 Petdex；shell=false，用户输入无法扩展为其他命令。 */
export async function runPetdexInstall(rawCommand: unknown, options: PetdexRunOptions): Promise<{ slug: string }> {
  const slug = parsePetdexInstallCommand(rawCommand);
  const timeoutMs = options.timeoutMs ?? 180_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('Petdex 下载超时时间配置无效');
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.executable, ['--yes', 'petdex@latest', 'install', slug], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const append = (chunk: Buffer) => {
      if (output.length < OUTPUT_LIMIT) output += chunk.toString('utf8').slice(0, OUTPUT_LIMIT - output.length);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Petdex 下载超时，请检查网络后重试'));
    }, timeoutMs);

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 Petdex：${err.message}`));
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim().split(/\r?\n/).slice(-4).join('\n');
      reject(new Error(detail ? `Petdex 下载失败：${detail}` : `Petdex 下载失败（退出码 ${code ?? '未知'}）`));
    });
  });

  return { slug };
}
