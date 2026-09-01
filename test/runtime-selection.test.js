const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveRuntimeSelection } = require('../src/core/runtime-selection');

test('keeps ordinary product selection on the tracked project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-selection-'));
  fs.mkdirSync(path.join(root, 'config', 'products'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'products', 'doraemon.json'), '{}');
  const selected = resolveRuntimeSelection({
    defaultProjectRoot: root,
    packageMetadata: {},
    environment: { PET_PRODUCT: 'doraemon' },
  });
  assert.equal(selected.preview, false);
  assert.equal(selected.projectRoot, root);
  assert.equal(selected.profilePath, path.join(root, 'config', 'products', 'doraemon.json'));
  assert.equal(selected.userDataPath, undefined);
});

test('accepts only a marked, non-symlink preview bundle with an isolated user-data path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-selection-'));
  const previewRoot = path.join(root, 'preview');
  const userData = path.join(root, 'user-data');
  fs.mkdirSync(path.join(previewRoot, 'config', 'products'), { recursive: true });
  fs.writeFileSync(path.join(previewRoot, '.desktop-pet-preview.json'), '{"schemaVersion":1}\n');
  fs.writeFileSync(path.join(previewRoot, 'config', 'products', 'preview.json'), '{}');
  const selected = resolveRuntimeSelection({
    defaultProjectRoot: root,
    packageMetadata: {},
    environment: {
      DESKTOP_PET_PREVIEW_ROOT: previewRoot,
      DESKTOP_PET_PREVIEW_USER_DATA: userData,
      DESKTOP_PET_PREVIEW_PARENT_PID: '1234',
    },
  });
  assert.equal(selected.preview, true);
  assert.equal(selected.projectRoot, fs.realpathSync(previewRoot));
  assert.equal(selected.userDataPath, userData);
  assert.equal(selected.parentPid, 1234);

  const linked = path.join(root, 'linked-preview');
  fs.symlinkSync(previewRoot, linked);
  assert.throws(() => resolveRuntimeSelection({
    defaultProjectRoot: root,
    packageMetadata: {},
    environment: { DESKTOP_PET_PREVIEW_ROOT: linked, DESKTOP_PET_PREVIEW_USER_DATA: userData },
  }), /preview/i);
});
