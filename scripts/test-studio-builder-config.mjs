import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from 'app-builder-lib/out/util/config/config.js';
import { studioBuilderConfig } from './studio-builder-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stage = path.join(root, 'isolated-test-stage');
const config = await getConfig(root, null, studioBuilderConfig(root, stage, '32.3.3'));
const destinations = config.extraResources.filter(item => item.to === 'runtime-template');
assert.equal(destinations.length, 1, 'Runtime template must have exactly one copy job');
assert.equal(path.resolve(root, destinations[0].from), path.join(root, 'build-resources/runtime-template'));
assert.deepEqual(destinations[0].filter, ['win-x64.zip', 'win-x64.zip.json']);
assert.equal(config.appId, 'com.petstudio.lite');
assert.equal(config.directories.app, stage);
assert.equal(config.publish, null);
console.log('PASS: effective builder config copies the runtime template exactly once');
