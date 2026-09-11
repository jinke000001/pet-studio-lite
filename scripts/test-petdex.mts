import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  findNpxExecutable,
  PetdexCandidateRegistry,
  parsePetdexInstallCommand,
  resolvePetdexPetDirectory,
  runPetdexInstall,
} from '../src/main/petdex-install.ts';

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn).then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  });
}

function rejects(raw: string): void {
  assert.throws(() => parsePetdexInstallCommand(raw));
}

console.log('[Petdex 命令导入]');

await test('接受用户粘贴的反斜杠转义 @ 命令', () => {
  assert.equal(parsePetdexInstallCommand('npx petdex\\@latest install capvolt'), 'capvolt');
});
await test('接受官方普通命令与 --yes 变体', () => {
  assert.equal(parsePetdexInstallCommand('npx petdex@latest install boba'), 'boba');
  assert.equal(parsePetdexInstallCommand('npx --yes petdex@latest install wukong-6'), 'wukong-6');
  assert.equal(parsePetdexInstallCommand('npx --yes petdex\\@latest install dai'), 'dai');
});
await test('允许首尾空白和词间多个空格', () => {
  assert.equal(parsePetdexInstallCommand('  npx   petdex@latest  install   shinchan  '), 'shinchan');
});
await test('拒绝 shell 注入、额外参数和非白名单包', () => {
  for (const raw of [
    'npx petdex@latest install capvolt; rm -rf /tmp/x',
    'npx petdex@latest install capvolt && echo bad',
    'npx petdex@latest install capvolt --force',
    'npx other@latest install capvolt',
    'npx petdex@1.0.0 install capvolt',
    'petdex install capvolt',
  ]) rejects(raw);
});
await test('拒绝路径、大小写和超长 slug', () => {
  for (const raw of [
    'npx petdex@latest install ../capvolt',
    'npx petdex@latest install CapVolt',
    `npx petdex@latest install ${'a'.repeat(65)}`,
  ]) rejects(raw);
});
await test('候选令牌一次性消费，过期后拒绝导入', () => {
  let now = 1_000;
  let serial = 0;
  const registry = new PetdexCandidateRegistry(500, () => now, () => `token-${++serial}`);
  const first = registry.issue({ slug: 'capvolt', sourcePath: '/pets/capvolt', fingerprint: 'a'.repeat(64) });
  assert.equal(registry.take(first).slug, 'capvolt');
  assert.throws(() => registry.take(first), /失效/);
  const second = registry.issue({ slug: 'boba', sourcePath: '/pets/boba', fingerprint: 'b'.repeat(64) });
  now = 1_501;
  assert.throws(() => registry.take(second), /过期/);
});

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'petstudio-petdex-test-'));
try {
  const argvFile = path.join(tmp, 'argv.json');
  const fakeNpx = path.join(tmp, 'npx');
  await fs.writeFile(fakeNpx, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvFile)}\n`, { mode: 0o755 });

  await test('子进程只收到固定 Petdex 参数，不接收原始命令文本', async () => {
    await runPetdexInstall('npx petdex@latest install capvolt', {
      executable: fakeNpx,
      timeoutMs: 2_000,
    });
    assert.deepEqual((await fs.readFile(argvFile, 'utf8')).trim().split('\n'), [
      '--yes', 'petdex@latest', 'install', 'capvolt',
    ]);
  });

  await test('可从显式 PATH 中定位 npx', async () => {
    assert.equal(await findNpxExecutable({ platform: 'darwin', pathValue: tmp }), fakeNpx);
  });

  await test('只解析 Petdex pets 根目录内的真实宠物目录', async () => {
    const petsRoot = path.join(tmp, 'pets');
    const petDir = path.join(petsRoot, 'capvolt');
    await fs.mkdir(petDir, { recursive: true });
    assert.equal(await resolvePetdexPetDirectory(petsRoot, 'capvolt'), await fs.realpath(petDir));
  });

  await test('拒绝候选宠物目录符号链接', async () => {
    const petsRoot = path.join(tmp, 'pets-links');
    const outside = path.join(tmp, 'outside-pet');
    await fs.mkdir(petsRoot, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, path.join(petsRoot, 'linked-pet'));
    await assert.rejects(() => resolvePetdexPetDirectory(petsRoot, 'linked-pet'), /符号链接/);
  });
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log(`\nPetdex 命令测试通过：${passed}/${passed}`);
