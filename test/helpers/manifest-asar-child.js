'use strict';
// Child probe: runs createCandidateManifest inside a real Electron process
// where the asar fs patch is active. Hashing the candidate app.asar must read
// the archive as plain bytes.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { createCandidateManifest } = require('../../src/build/build-plan');

const [runDirectory, asarPath, atlasPath] = process.argv.slice(2);
try {
  const atlasSha = crypto.createHash('sha256').update(fs.readFileSync(atlasPath)).digest('hex');
  const manifest = createCandidateManifest({
    runDirectory,
    profile: {
      productId: 'sample-desktop-pet',
      productName: 'Sample Desktop Pet',
      version: '0.1.0',
      petPackagePath: 'local-pets/sample',
      build: {
        appId: 'com.jinke.desktop-pet.sample',
        executableName: 'SamplePet',
        artifactName: 'sample-pet',
        iconStrategy: 'electron-default-test',
        installScope: 'user',
      },
      defaultScale: 0.75,
      messages: {},
    },
    selector: 'sample',
    targets: ['mac'],
    sourceAtlasPath: atlasPath,
    artifactPaths: [asarPath],
    toolVersions: { node: 'probe', electron: 'probe', electronBuilder: 'probe' },
    packagedResources: [{
      path: 'artifacts/mac-arm64/Sample.app/Contents/Resources/app.asar',
      embeddedSelector: 'sample',
      asar: { sha256: 'f'.repeat(64) },
      atlas: { sha256: atlasSha },
    }],
  });
  process.stdout.write(`MANIFEST_OK ${manifest.artifacts[0].sha256}\n`);
} catch (error) {
  process.stdout.write(`MANIFEST_FAIL ${error.message}\n`);
  process.exitCode = 1;
}
