import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePetPack, type ImageProbe } from '../shared/petpack';
import { validatePetConfig } from '../shared/config';
import type { ProjectMeta } from '../shared/projects';

/** 校验独立打包快照，manifest 只能引用导入时已确认的同一份素材。 */
export async function prepareExportPack(meta: ProjectMeta, source: string, destination: string, probe: ImageProbe): Promise<void> {
  const config = validatePetConfig(meta.config);
  if (!config.ok) throw new Error(config.errors.join('；'));
  const original = await validatePetPack(source, { probe });
  if (!original.ok) throw new Error(original.errors.join('\n'));
  if (original.pack.spritesheetPath !== meta.spritesheetFile) throw new Error('项目素材路径已变化，请重新导入素材');
  await fs.mkdir(destination, { recursive: true });
  await fs.copyFile(path.join(source, 'pet.json'), path.join(destination, 'pet.json'));
  await fs.copyFile(path.join(source, meta.spritesheetFile), path.join(destination, meta.spritesheetFile));
  // 再查副本，覆盖校验与复制之间的文件变化；打包只读取这个独立目录。
  const snapshot = await validatePetPack(destination, { probe });
  if (!snapshot.ok) throw new Error(snapshot.errors.join('\n'));
  if (snapshot.pack.hashes.petJson !== meta.hashes.petJson || snapshot.pack.hashes.spritesheet !== meta.hashes.spritesheet) {
    throw new Error('项目素材已变化：副本哈希与导入指纹不一致，请重新导入素材后导出');
  }
  await fs.writeFile(path.join(destination, 'config.json'), JSON.stringify(config.config, null, 2), 'utf8');
}
