/**
 * electron-builder afterPack hook: re-apply a proper deep ad-hoc signature
 * over electron-builder's output. Without this the binaries are tagged
 * `(adhoc,linker-signed)` which modern macOS Gatekeeper often rejects with
 * "is damaged" even though it's technically signed.
 *
 * `codesign --deep --force --sign -` recursively signs the .app bundle and
 * all its helpers/frameworks with an ad-hoc identity, producing a clean
 * `(adhoc)` flag. This is the strongest signature available without an
 * Apple Developer Program subscription ($99/yr).
 *
 * NOTE: Even a clean ad-hoc signature may not be sufficient on the very
 * latest macOS versions (Sequoia/Tahoe sometimes require notarization).
 * If "is damaged" persists, the user must run:
 *   xattr -dr com.apple.quarantine "/Applications/Pet Studio Lite.app"
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[sign-adhoc] re-signing ${appPath}`);
  // Electron/native dependencies can inherit Finder or provenance metadata
  // from the download/cache volume. codesign rejects those extended
  // attributes as bundle detritus, so remove them from the generated copy.
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], { stdio: 'inherit' });

  // Verify
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log('[sign-adhoc] verified deep ad-hoc signature');
};
