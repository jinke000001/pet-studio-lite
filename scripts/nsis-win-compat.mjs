import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const upstreamHash = 'afa9046492317e72e79e022cdb1f42edba4687ea605300bfc01c002f3106201c';

export function patchNsisTemplate(source) {
  if (crypto.createHash('sha256').update(source).digest('hex') !== upstreamHash) {
    throw new Error('Unexpected NSIS template identity; review the backport before changing builder versions');
  }
  // Backport electron-builder PR #9564 to locked app-builder-lib 25.1.8.
  // Windows 8+ must not execute the Win7 System::Store/known-folder branch.
  return source.replace('!include UAC.nsh\n', '!include UAC.nsh\n!include WinVer.nsh\n')
    .replace('      System::Store S\n', '      ${IfNot} ${AtLeastWin8}\n      System::Store S\n')
    .replace('      System::Store L\n', '      System::Store L\n      ${EndIf}\n');
}

export async function withNsisWindowsCompatibility(root, enabled, operation) {
  if (!enabled) return operation();
  const template = path.join(root, 'node_modules/app-builder-lib/templates/nsis/multiUser.nsh');
  // Fail closed on concurrent packaging or an interrupted prior operation.
  const backup = template + '.petstudio-original';
  const source = await fs.readFile(template, 'utf8');
  const patched = patchNsisTemplate(source);
  await fs.writeFile(backup, source, { flag: 'wx' });
  try {
    await fs.writeFile(template, patched);
    console.log('NSIS_WIN7_COMPAT_BACKPORT #9564');
    return await operation();
  } finally {
    const current = await fs.readFile(template, 'utf8');
    if (current !== patched && current !== source) {
      throw new Error(`NSIS template changed during build; original preserved at ${backup}`);
    }
    await fs.writeFile(template, source);
    await fs.unlink(backup);
  }
}
