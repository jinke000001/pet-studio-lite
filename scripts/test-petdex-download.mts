import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadPetdexPack, type PetdexDownloadOptions } from '../src/main/petdex-download.ts';

const MANIFEST_URL = 'https://petdex.dev/api/manifest/v2';
const MANIFEST_REDIRECT = 'https://assets.petdex.dev/manifests/petdex-v2.json';
const ASSET_BASE = 'https://assets.petdex.dev';
const repoRoot = process.cwd();
let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn).then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  });
}

function compactManifest(slug: string, extension: 'png' | 'webp' = 'webp'): object {
  return {
    v: 2,
    total: 1,
    assetBase: ASSET_BASE,
    fields: [
      'slug', 'displayName', 'kind', 'submittedBy', 'spritesheet', 'petJson', 'zip', 'spriteVersionNumber',
    ],
    pets: [[
      slug,
      'Test Pet',
      'creature',
      null,
      `pets/${slug}/sprite.${extension}`,
      `pets/${slug}/pet.json`,
      null,
      extension === 'png' ? 1 : 2,
    ]],
  };
}

function response(body: BodyInit, contentType: string): Response {
  return new Response(body, { headers: { 'content-type': contentType } });
}

function fakeDownload(
  slug: string,
  sprite: Buffer,
  extension: 'png' | 'webp',
  petJson: object = { id: slug, displayName: 'Test Pet', spritesheetPath: `spritesheet.${extension}` },
): PetdexDownloadOptions['fetchImpl'] {
  return async (input) => {
    const url = String(input);
    if (url === MANIFEST_URL) {
      return response(JSON.stringify(compactManifest(slug, extension)), 'application/json');
    }
    if (url === `${ASSET_BASE}/pets/${slug}/pet.json`) {
      return response(JSON.stringify(petJson), 'application/json');
    }
    if (url === `${ASSET_BASE}/pets/${slug}/sprite.${extension}`) {
      return response(sprite, extension === 'png' ? 'image/png' : 'image/webp');
    }
    throw new Error(`unexpected URL: ${url}`);
  };
}

async function assertCacheEmpty(cacheRoot: string): Promise<void> {
  assert.deepEqual(await fs.readdir(cacheRoot), []);
}

console.log('[Petdex 独立在线下载]');

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-petdex-download-test-'));
try {
  const png = await fs.readFile(path.join(repoRoot, 'assets', 'fixtures', 'pack-v1', 'spritesheet.png'));
  const webp = await fs.readFile(path.join(repoRoot, 'assets', 'fixtures', 'pack-v1-webp', 'spritesheet.webp'));

  await test('从官方 compact manifest 下载 WebP 到唯一缓存目录', async () => {
    const cacheRoot = path.join(tmp, 'valid-webp');
    const result = await downloadPetdexPack('npx petdex@latest install boba', cacheRoot, {
      fetchImpl: fakeDownload('boba', webp, 'webp'),
    });
    assert.equal(result.slug, 'boba');
    assert.equal(path.dirname(result.sourcePath), await fs.realpath(cacheRoot));
    assert.match(path.basename(result.sourcePath), /^boba-/);
    assert.deepEqual((await fs.readdir(result.sourcePath)).sort(), ['pet.json', 'spritesheet.webp']);
    assert.deepEqual(await fs.readFile(path.join(result.sourcePath, 'spritesheet.webp')), webp);
  });

  await test('接受官方 PNG 包并保留标准 spritesheet.png 文件名', async () => {
    const cacheRoot = path.join(tmp, 'valid-png');
    const result = await downloadPetdexPack('npx petdex\\@latest install png-pet', cacheRoot, {
      fetchImpl: fakeDownload('png-pet', png, 'png'),
    });
    assert.deepEqual((await fs.readdir(result.sourcePath)).sort(), ['pet.json', 'spritesheet.png']);
    assert.deepEqual(await fs.readFile(path.join(result.sourcePath, 'spritesheet.png')), png);
  });

  await test('只接受 manifest API 到官方固定 manifest 的一次重定向', async () => {
    const cacheRoot = path.join(tmp, 'redirect');
    const baseFetch = fakeDownload('redirect-pet', webp, 'webp')!;
    const result = await downloadPetdexPack('npx petdex@latest install redirect-pet', cacheRoot, {
      fetchImpl: async (input, init) => {
        if (String(input) === MANIFEST_URL) {
          return new Response(null, { status: 307, headers: { location: MANIFEST_REDIRECT } });
        }
        if (String(input) === MANIFEST_REDIRECT) {
          return response(JSON.stringify(compactManifest('redirect-pet')), 'application/json');
        }
        return baseFetch(input, init);
      },
    });
    assert.deepEqual((await fs.readdir(result.sourcePath)).sort(), ['pet.json', 'spritesheet.webp']);

    const rejectedRoot = path.join(tmp, 'bad-redirect');
    await fs.mkdir(rejectedRoot);
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install redirect-pet', rejectedRoot, {
        fetchImpl: async () => new Response(null, {
          status: 307,
          headers: { location: 'https://attacker.example/manifest.json' },
        }),
      }),
      /非官方固定地址/,
    );
    await assertCacheEmpty(rejectedRoot);
  });

  await test('拒绝 manifest 注入的非官方资源地址且不留下半成品', async () => {
    const cacheRoot = path.join(tmp, 'untrusted-host');
    await fs.mkdir(cacheRoot);
    const manifest = compactManifest('evil') as { pets: unknown[][] };
    manifest.pets[0]![4] = 'https://attacker.example/sprite.webp';
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install evil', cacheRoot, {
        fetchImpl: async () => response(JSON.stringify(manifest), 'application/json'),
      }),
      /不可信|官方资源/,
    );
    await assertCacheEmpty(cacheRoot);
  });

  await test('拒绝 pet.json 图集路径逃逸并清理唯一缓存目录', async () => {
    const cacheRoot = path.join(tmp, 'path-escape');
    await fs.mkdir(cacheRoot);
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install escape-pet', cacheRoot, {
        fetchImpl: fakeDownload('escape-pet', webp, 'webp', {
          id: 'escape-pet',
          spritesheetPath: '../spritesheet.webp',
        }),
      }),
      /spritesheetPath/,
    );
    await assertCacheEmpty(cacheRoot);
  });

  await test('拒绝超过大小上限的响应并清理半成品', async () => {
    const cacheRoot = path.join(tmp, 'too-large');
    await fs.mkdir(cacheRoot);
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install large-pet', cacheRoot, {
        fetchImpl: fakeDownload('large-pet', webp, 'webp'),
        maxSpritesheetBytes: 64,
      }),
      /大小上限/,
    );
    await assertCacheEmpty(cacheRoot);
  });

  await test('超时会中止请求并清理半成品', async () => {
    const cacheRoot = path.join(tmp, 'timeout');
    await fs.mkdir(cacheRoot);
    const fetchImpl: PetdexDownloadOptions['fetchImpl'] = async (input, init) => {
      const url = String(input);
      if (url === MANIFEST_URL) {
        return response(JSON.stringify(compactManifest('slow-pet')), 'application/json');
      }
      if (url.endsWith('/sprite.webp')) return response(webp, 'image/webp');
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    };
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install slow-pet', cacheRoot, {
        fetchImpl,
        timeoutMs: 25,
      }),
      /超时/,
    );
    await assertCacheEmpty(cacheRoot);
  });

  await test('拒绝扩展名与内容不符的伪图集并清理半成品', async () => {
    const cacheRoot = path.join(tmp, 'fake-image');
    await fs.mkdir(cacheRoot);
    await assert.rejects(
      downloadPetdexPack('npx petdex@latest install fake-pet', cacheRoot, {
        fetchImpl: fakeDownload('fake-pet', Buffer.from('<html>not an image</html>'), 'webp'),
      }),
      /WebP|图集/,
    );
    await assertCacheEmpty(cacheRoot);
  });

  if (process.env['PETDEX_REMOTE_TEST'] === '1') {
    await test('真实下载官方 boba 并可由 sharp 解码', async () => {
      const { default: sharp } = await import('sharp');
      const result = await downloadPetdexPack(
        'npx petdex@latest install boba',
        path.join(tmp, 'remote'),
      );
      const pet = JSON.parse(await fs.readFile(path.join(result.sourcePath, 'pet.json'), 'utf8')) as {
        spritesheetPath: string;
      };
      const metadata = await sharp(path.join(result.sourcePath, pet.spritesheetPath)).metadata();
      assert.ok(metadata.width && metadata.height);
    });
  }
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log(`\nPetdex 下载测试通过：${passed}/${passed}`);
