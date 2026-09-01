const { normalizeImportRequest } = require('./contracts');

function createImportSelectionHandler({ dialog, getWindow, importController, enqueueImport }) {
  if (!dialog || typeof getWindow !== 'function' || !importController) {
    throw new Error('dialog, getWindow and importController are required');
  }
  return async function selectAndImport(input) {
    const request = normalizeImportRequest(input);
    const options = request.sourceType === 'directory'
      ? { title: '选择宠物包目录', properties: ['openDirectory'] }
      : {
        title: '选择 ZIP 宠物包',
        properties: ['openFile'],
        filters: [{ name: 'ZIP 宠物包', extensions: ['zip'] }],
      };
    const selection = await dialog.showOpenDialog(getWindow(), options);
    if (selection.canceled || selection.filePaths.length !== 1) {
      return { cancelled: true, project: null };
    }
    if (enqueueImport) {
      const job = enqueueImport({ ...request, sourcePath: selection.filePaths[0] });
      return { cancelled: false, project: null, job };
    }
    const project = await importController.importSource({
      ...request,
      sourcePath: selection.filePaths[0],
    });
    return { cancelled: false, project };
  };
}

module.exports = { createImportSelectionHandler };
