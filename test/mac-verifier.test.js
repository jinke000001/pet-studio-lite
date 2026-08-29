const test = require('node:test');
const assert = require('node:assert/strict');

const path = require('node:path');

const { containsRuntimeEvidence, parseVerifyArguments, resolveCandidateArtifact } = require('../src/build/mac-verifier');

test('requires both packaged renderer and runtime readiness for the selected identities', () => {
  const complete = [
    'renderer-console level=info renderer-ready product=dai-desktop-pet pet=dai file:///candidate/app.asar/src/renderer.js:273',
    'runtime-ready product=dai-desktop-pet pet=dai',
  ].join('\n');
  assert.equal(containsRuntimeEvidence(complete, 'dai-desktop-pet', 'dai'), true);
  assert.equal(containsRuntimeEvidence(complete.replace('runtime-ready', 'runtime-failed'), 'dai-desktop-pet', 'dai'), false);
  assert.equal(containsRuntimeEvidence(complete, 'wukong-desktop-pet', 'wukong'), false);
});

test('accepts only one safe project-relative candidate run path', () => {
  assert.deepEqual(parseVerifyArguments(['--run', 'release/candidates/dai/0.1.0/candidate-test']), {
    runPath: 'release/candidates/dai/0.1.0/candidate-test',
  });
  assert.throws(() => parseVerifyArguments([]), /run/);
  assert.throws(() => parseVerifyArguments(['--run', '../candidate']), /run/);
  assert.throws(() => parseVerifyArguments(['--run', 'tasks/candidate']), /run/);
  assert.throws(() => parseVerifyArguments(['--other', 'candidate']), /Unknown/);
});

test('refuses candidate manifest paths that escape the selected run', () => {
  assert.equal(
    resolveCandidateArtifact('/project/release/run', 'artifacts/app.exe'),
    path.resolve('/project/release/run', 'artifacts/app.exe'),
  );
  assert.throws(() => resolveCandidateArtifact('/project/release/run', '../app.exe'), /inside/);
  assert.throws(() => resolveCandidateArtifact('/project/release/run', '/tmp/app.exe'), /inside/);
});
