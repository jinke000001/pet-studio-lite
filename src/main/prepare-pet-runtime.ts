import fs from 'node:fs/promises';
import path from 'node:path';

export async function preparePetRuntime(repoRoot: string, build: () => Promise<void>): Promise<string> {
  const output = path.join(repoRoot, 'out-pet');
  // A source checkout may contain yesterday's out-pet. Rebuild before copying;
  // a distributed workbench has no source tree and uses its shipped runtime.
  if (await isFile(path.join(repoRoot, 'src/pet/main.ts'))) await build();
  if (!(await isFile(path.join(output, 'main/main.js')))) {
    throw new Error('桌宠运行时缺失，请使用完整制作台，或在开发目录执行 npm run build:pet 后重试');
  }
  return output;
}

async function isFile(file: string): Promise<boolean> {
  try { return (await fs.stat(file)).isFile(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
