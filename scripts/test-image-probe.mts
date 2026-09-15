import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sharpImageProbe } from '../src/main/image-probe';

// A successful probe must release its source, including with libvips caching on.
// Windows additionally enforces the immediate unlink below with real file locks.
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-image-probe-'));
let passed = 0;
try {
  for (const [fixture, ext] of [['pack-v1', 'png'], ['pack-v1-webp', 'webp'], ['pack-v2-webp', 'webp']]) {
    sharp.cache(false);
    sharp.cache(true);
    const file = path.join(work, `图集 #1.${ext}`);
    const bytes = await fs.readFile(path.join('assets/fixtures', fixture!, `spritesheet.${ext}`));
    await fs.writeFile(file, bytes);
    assert.equal(await sharpImageProbe(file, bytes.subarray(0, 64)), null);
    assert.equal(sharp.cache().files.current, 0, `${fixture}: decoder retained an open source file`);
    await fs.rm(file);
    assert.equal(await fs.stat(file).then(() => true, () => false), false);
    console.log(`PASS ${fixture}: full decode releases source before immediate removal`);
    passed++;

    // Same path and valid header, corrupt pixel body: must not reuse cached pixels.
    await fs.writeFile(file, bytes.subarray(0, 64));
    assert.match((await sharpImageProbe(file, bytes.subarray(0, 64))) ?? '', /无法解码/);
    await fs.rm(file);
    console.log(`PASS ${fixture}: changed file at same path is decoded and rejected`);
    passed++;
  }
} finally {
  sharp.cache(false);
  await fs.rm(work, { recursive: true, force: true });
}
console.log(`Image probe tests passed: ${passed}/${passed}`);
