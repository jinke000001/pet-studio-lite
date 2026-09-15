import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { patchNsisTemplate, withNsisWindowsCompatibility } from './nsis-win-compat.mjs';

const source = await fs.readFile(new URL('../node_modules/app-builder-lib/templates/nsis/multiUser.nsh', import.meta.url), 'utf8');
const patched = patchNsisTemplate(source);
assert.match(patched, /!include WinVer\.nsh/);
assert.match(patched, /\$\{IfNot\} \$\{AtLeastWin8\}[\s\S]*System::Store S[\s\S]*System::Store L\s*\$\{EndIf\}/);
assert.ok(patched.includes('ReadRegStr $perUserInstallationFolder HKCU'));
assert.ok(patched.includes('${StdUtils.GetParameter} $R0 "D" ""'));
assert.ok(patched.includes('StrCpy $INSTDIR "$0\\${APP_FILENAME}"'));
assert.throws(() => patchNsisTemplate(source + '\n# changed upstream'), /template identity/);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nsis-backport-test-'));
const template = path.join(root, 'node_modules/app-builder-lib/templates/nsis/multiUser.nsh');
try {
  await fs.mkdir(path.dirname(template), { recursive: true });
  await fs.writeFile(template, source);
  await withNsisWindowsCompatibility(root, true, async () => {
    assert.equal(await fs.readFile(template, 'utf8'), patched);
    await assert.rejects(withNsisWindowsCompatibility(root, true, async () => {}));
  });
  assert.equal(await fs.readFile(template, 'utf8'), source);
  await assert.rejects(withNsisWindowsCompatibility(root, true, async () => { throw new Error('build failed'); }), /build failed/);
  assert.equal(await fs.readFile(template, 'utf8'), source);
  await assert.rejects(fs.access(template + '.petstudio-original'));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('PASS: pinned NSIS compatibility backport guards Win7 code and retains path/registry logic');
