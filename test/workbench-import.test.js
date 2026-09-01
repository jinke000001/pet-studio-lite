const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProjectStore } = require('../src/workbench/project-store');
const {
  createImportController,
  deriveSourceIdentity,
  explainImportError,
} = require('../src/workbench/import-controller');

function makeLosslessWebp(width, height, hasAlpha) {
  const dimensions = (width - 1) | ((height - 1) << 14) | ((hasAlpha ? 1 : 0) << 28);
  const chunk = Buffer.alloc(14);
  chunk.write('VP8L', 0, 'ascii');
  chunk.writeUInt32LE(5, 4);
  chunk[8] = 0x2f;
  chunk.writeUInt32LE(dimensions >>> 0, 9);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(4 + chunk.length, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, chunk]);
}

function makePetDirectory(root, { id = 'sample', version = 1 } = {}) {
  const source = path.join(root, `${id}-source`);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify({
    id,
    displayName: version === 1 ? 'Sample V1' : 'Sample V2',
    ...(version === 2 ? { spriteVersionNumber: 2 } : {}),
    spritesheetPath: 'spritesheet.webp',
  }));
  fs.writeFileSync(path.join(source, 'spritesheet.webp'), makeLosslessWebp(1536, version === 1 ? 1872 : 2288, true));
  return source;
}

function makeHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-workbench-import-'));
  const workspaceRoot = path.join(root, 'studio');
  const store = createProjectStore({
    workspaceRoot,
    now: () => new Date('2026-09-01T09:00:00.000Z'),
    randomHex: () => 'abc123',
  });
  const project = store.createProject({ name: 'Import demo' });
  return { root, store, project, controller: createImportController({ store }) };
}

test('derives a stable package-safe source identity without exposing the selected path', () => {
  assert.match(deriveSourceIdentity('/tmp/哆啦 A 梦', 'directory'), /^directory-[a-f0-9]{12}$/);
  assert.match(deriveSourceIdentity('/tmp/Doraemon.zip', 'zip'), /^doraemon-[a-f0-9]{8}$/);
  assert.equal(deriveSourceIdentity('/tmp/Doraemon.zip', 'zip'), deriveSourceIdentity('/tmp/Doraemon.zip', 'zip'));
});

test('imports a v1 directory into the project and persists a path-free successful summary', async () => {
  const { root, store, project, controller } = makeHarness();
  const source = makePetDirectory(root);

  const updated = await controller.importSource({
    projectId: project.id,
    sourceType: 'directory',
    sourcePath: source,
    authorizationStatus: 'internal-test',
  });

  assert.equal(updated.activeStep, 'preview');
  assert.equal(updated.steps.import.status, 'completed');
  assert.equal(updated.steps.validate.status, 'completed');
  assert.equal(updated.latestImport.pet.spriteVersionNumber, 1);
  assert.equal(updated.latestImport.validation.level, 'warning');
  assert.equal(updated.latestImport.authorizationStatus, 'internal-test');
  assert.equal(JSON.stringify(updated).includes(source), false);
  assert.deepEqual(store.loadProject(project.id), updated);

  const preview = controller.loadPreview(project.id);
  assert.equal(preview.pet.id, 'sample');
  assert.match(preview.atlasDataUrl, /^data:image\/webp;base64,/);
  assert.equal(JSON.stringify(preview).includes(source), false);
  assert.equal(preview.actions.length, 9);
  assert.deepEqual(preview.actions[0], { name: 'idle', row: 0, frames: 6 });
});

test('a failed replacement import preserves the previous successful import and artifacts', async () => {
  const { root, store, project, controller } = makeHarness();
  const source = makePetDirectory(root);
  const succeeded = await controller.importSource({
    projectId: project.id,
    sourceType: 'directory',
    sourcePath: source,
    authorizationStatus: 'authorized',
  });
  const invalid = path.join(root, 'invalid');
  fs.mkdirSync(invalid);
  fs.writeFileSync(path.join(invalid, 'pet.json'), '{}');

  await assert.rejects(controller.importSource({
    projectId: project.id,
    sourceType: 'directory',
    sourcePath: invalid,
    authorizationStatus: 'unknown',
  }));
  assert.deepEqual(store.loadProject(project.id), succeeded);
  assert.match(controller.loadPreview(project.id).atlasDataUrl, /^data:image\/webp;base64,/);
});

test('maps unsafe input failures to actionable Chinese blocking explanations', () => {
  const explanation = explainImportError({ code: 'UNSAFE_ZIP_PATH' });
  assert.equal(explanation.level, 'blocked');
  assert.match(explanation.title, /ZIP/);
  assert.match(explanation.unaffected, /已有/);
  assert.ok(explanation.action);
});

test('imports a validated Petdex slug without exposing a URL or breaking local projects on network failure', async () => {
  const { root, store, project } = makeHarness();
  const source = makePetDirectory(root, { id: 'remote-sample', version: 2 });
  const { importPetDirectory } = require('../src/import/directory-importer');
  const controller = createImportController({
    store,
    downloadSlug: async ({ slug, outputRoot, authorizationStatus }) => importPetDirectory({ sourceDirectory: source, outputRoot, sourceType: 'petdex-slug', sourceIdentity: slug, authorizationStatus }),
  });
  const updated = await controller.importPetdex({ projectId: project.id, slug: 'remote-sample', authorizationStatus: 'internal-test' });
  assert.equal(updated.latestImport.sourceType, 'petdex-slug');
  assert.equal(updated.latestImport.sourceIdentity, 'remote-sample');
  assert.equal(JSON.stringify(updated).includes('https://'), false);

  const beforeFailure = structuredClone(updated);
  const offline = createImportController({ store, downloadSlug: async () => { throw Object.assign(new Error('offline'), { code: 'DOWNLOAD_FAILED' }); } });
  await assert.rejects(offline.importPetdex({ projectId: project.id, slug: 'remote-sample' }), (error) => error.code === 'DOWNLOAD_FAILED');
  assert.deepEqual(store.loadProject(project.id), beforeFailure);
  await assert.rejects(controller.importPetdex({ projectId: project.id, slug: '../unsafe' }), (error) => error.code === 'INVALID_IMPORT_INPUT');
});
