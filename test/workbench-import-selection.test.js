const test = require('node:test');
const assert = require('node:assert/strict');

const { createImportSelectionHandler } = require('../src/workbench/import-selection');

const projectId = 'studio-20260901-090000-abc123';

test('selects local sources in the main process and never returns their absolute path', async () => {
  const calls = [];
  const handler = createImportSelectionHandler({
    dialog: {
      async showOpenDialog(_window, options) {
        calls.push(options);
        return { canceled: false, filePaths: ['/private/tmp/Doraemon'] };
      },
    },
    getWindow: () => ({ id: 'window' }),
    importController: {
      async importSource(input) {
        assert.equal(input.sourcePath, '/private/tmp/Doraemon');
        return { id: input.projectId, latestImport: { id: 'import-abc123abc123' } };
      },
    },
  });

  const result = await handler({ projectId, sourceType: 'directory', authorizationStatus: 'internal-test' });
  assert.deepEqual(calls[0].properties, ['openDirectory']);
  assert.equal(JSON.stringify(result).includes('/private/tmp'), false);
  assert.equal(result.cancelled, false);
});

test('uses a ZIP filter and treats native picker cancellation as a non-error', async () => {
  let options;
  const handler = createImportSelectionHandler({
    dialog: {
      async showOpenDialog(_window, value) {
        options = value;
        return { canceled: true, filePaths: [] };
      },
    },
    getWindow: () => undefined,
    importController: { importSource: () => assert.fail('cancelled selection must not import') },
  });
  const result = await handler({ projectId, sourceType: 'zip', authorizationStatus: 'authorized' });
  assert.deepEqual(options.properties, ['openFile']);
  assert.deepEqual(options.filters, [{ name: 'ZIP 宠物包', extensions: ['zip'] }]);
  assert.deepEqual(result, { cancelled: true, project: null });
});

test('rejects renderer-supplied paths before opening the picker', async () => {
  const handler = createImportSelectionHandler({
    dialog: { showOpenDialog: () => assert.fail('invalid request must not open dialog') },
    getWindow: () => undefined,
    importController: {},
  });
  await assert.rejects(handler({
    projectId,
    sourceType: 'directory',
    authorizationStatus: 'unknown',
    path: '/tmp/escape',
  }), (error) => error.code === 'INVALID_IMPORT_INPUT');
});

test('queues a selected local source with an opaque renderer response', async () => {
  const selectedPath = '/private/source/pet';
  let queued;
  const handler = createImportSelectionHandler({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selectedPath] }) },
    getWindow: () => ({}),
    importController: { importSource: async () => { throw new Error('must not import inline'); } },
    enqueueImport: (input) => { queued = input; return { id: 'job-1', type: 'import', status: 'queued' }; },
  });
  const result = await handler({ projectId: 'studio-20260901-090000-abc123', sourceType: 'directory', authorizationStatus: 'internal-test' });
  assert.equal(queued.sourcePath, selectedPath);
  assert.equal(result.project, null);
  assert.equal(JSON.stringify(result).includes(selectedPath), false);
  assert.equal(result.job.id, 'job-1');
});
