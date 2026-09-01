const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { importPetDirectory } = require('../import/directory-importer');
const { importPetZip } = require('../import/zip-importer');
const { STANDARD_STATES } = require('../core/pet-package');

const MAX_ATLAS_BYTES = 64 * 1024 * 1024;

const ERROR_EXPLANATIONS = Object.freeze({
  UNSAFE_ZIP_PATH: ['ZIP 路径不安全', 'ZIP 中包含越界或不兼容路径，工作台已阻止解压。', '移除异常路径后重新打包。'],
  ZIP_SYMLINK_NOT_ALLOWED: ['ZIP 包含符号链接', '符号链接可能指向项目外文件，工作台没有导入。', '移除符号链接并放入真实文件副本。'],
  SYMLINK_NOT_ALLOWED: ['目录包含符号链接', '原始目录保持未修改，工作台没有复制链接目标。', '将链接替换为项目内普通文件后重试。'],
  FILE_TOO_LARGE: ['文件超过安全上限', '已有项目和最近一次成功导入没有变化。', '缩小文件或选择正确的宠物包。'],
  PACKAGE_TOO_LARGE: ['宠物包超过安全上限', '已有项目和最近一次成功导入没有变化。', '移除无关文件后重试。'],
  MISSING_MANIFEST: ['缺少 pet.json', '工作台没有创建成功导入记录。', '把 pet.json 放在宠物包根目录。'],
  MISSING_SPRITESHEET: ['缺少图集', '工作台没有修改现有成功导入。', '检查 pet.json 的 spritesheetPath 与实际文件名。'],
  INVALID_MANIFEST: ['pet.json 无法读取', '工作台没有修改原始文件或已有结果。', '修复 JSON 格式后重试。'],
  DESTINATION_CONFLICT: ['已有导入证据不一致', '工作台拒绝把不一致目录当作成功结果。', '保留现有证据并创建新的制作项目。'],
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeSourceLabel(sourcePath) {
  const label = path.basename(sourcePath).replace(/[\u0000-\u001f\u007f]/g, '�').slice(0, 120);
  return label || '本地素材';
}

function deriveSourceIdentity(sourcePath, sourceType) {
  const label = safeSourceLabel(sourcePath).replace(/\.zip$/i, '');
  const ascii = label.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const digest = sha256(`${sourceType}\0${path.resolve(sourcePath)}`);
  return ascii.replaceAll('-', '').length >= 3
    ? `${ascii}-${digest.slice(0, 8)}`
    : `${sourceType}-${digest.slice(0, 12)}`;
}

function explainImportError(error) {
  const [title, message, action] = ERROR_EXPLANATIONS[error?.code] || [
    '宠物包未通过检查',
    '原始素材、已有项目和最近一次成功导入均未修改。',
    '检查素材结构后安全重试。',
  ];
  return {
    level: 'blocked',
    code: typeof error?.code === 'string' ? error.code : 'IMPORT_FAILED',
    title,
    message,
    unaffected: '原始素材、已有项目和最近一次成功导入未受影响。',
    action,
  };
}

function assertRegularFile(filePath, maxBytes, label) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxBytes) {
    const error = new Error(`${label} 无效。`);
    error.code = 'INVALID_PREVIEW_ARTIFACT';
    throw error;
  }
  return stats;
}

function createImportController({
  store,
  importDirectory = importPetDirectory,
  importZip = importPetZip,
}) {
  if (!store) throw new Error('store is required');

  async function importSource({ projectId, sourceType, sourcePath, authorizationStatus }) {
    store.loadProject(projectId);
    if (!['directory', 'zip'].includes(sourceType) || !path.isAbsolute(sourcePath)) {
      const error = new Error('导入来源无效。');
      error.code = 'INVALID_IMPORT_INPUT';
      throw error;
    }
    const outputRoot = store.resolveProjectPath(projectId, 'workspace', 'imports');
    const sourceIdentity = deriveSourceIdentity(sourcePath, sourceType);
    const result = sourceType === 'directory'
      ? importDirectory({
        sourceDirectory: sourcePath,
        outputRoot,
        sourceIdentity,
        authorizationStatus,
      })
      : await importZip({
        zipPath: sourcePath,
        outputRoot,
        sourceIdentity,
        authorizationStatus,
      });
    const relativeDirectory = path.relative(
      store.resolveProjectPath(projectId, 'workspace'),
      result.importDirectory,
    ).split(path.sep).join('/');
    if (!relativeDirectory.startsWith('imports/') || relativeDirectory.split('/').some((part) => !part || part === '.' || part === '..')) {
      const error = new Error('导入结果不在项目工作区。');
      error.code = 'UNSAFE_PROJECT_PATH';
      throw error;
    }
    const importId = `import-${result.report.sourceDigest.slice(0, 12)}`;
    const artifactId = `package-${result.report.sourceDigest.slice(0, 12)}`;
    const validationLevel = authorizationStatus === 'authorized' ? 'passed' : 'warning';
    const latestImport = {
      id: importId,
      sourceType,
      sourceLabel: safeSourceLabel(sourcePath),
      sourceIdentity,
      authorizationStatus,
      importedAt: result.report.importedAt,
      artifactId,
      pet: {
        id: result.report.pet.id,
        displayName: result.report.pet.displayName,
        spriteVersionNumber: result.report.pet.spriteVersionNumber,
        grid: result.report.pet.grid,
        hasAlpha: true,
        lookDirections: result.report.pet.capabilities.lookDirections,
        actions: Object.keys(result.report.pet.states),
      },
      validation: {
        level: validationLevel,
        messages: validationLevel === 'passed'
          ? ['结构、图集尺寸、alpha 与标准动作检查通过。']
          : ['技术检查通过；当前授权状态不构成对外分发许可。'],
      },
    };
    return store.updateProject(projectId, (project) => ({
      ...project,
      activeStep: 'preview',
      steps: {
        ...project.steps,
        project: { status: 'completed' },
        import: { status: 'completed' },
        validate: { status: 'completed' },
        preview: { status: 'active' },
      },
      latestImport,
      artifacts: [
        ...project.artifacts.filter((artifact) => artifact.id !== artifactId),
        {
          id: artifactId,
          kind: 'standardPackage',
          relativePath: `workspace/${relativeDirectory}/package`,
          createdAt: result.report.importedAt,
        },
      ],
    }));
  }

  function loadPreview(projectId) {
    const project = store.loadProject(projectId);
    if (!project.latestImport) {
      const error = new Error('项目尚无成功导入。');
      error.code = 'IMPORT_NOT_READY';
      throw error;
    }
    const artifact = project.artifacts.find((candidate) => candidate.id === project.latestImport.artifactId);
    if (!artifact || artifact.kind !== 'standardPackage') {
      const error = new Error('项目导入产物无效。');
      error.code = 'INVALID_PREVIEW_ARTIFACT';
      throw error;
    }
    const packageDirectory = store.resolveProjectPath(projectId, ...artifact.relativePath.split('/'));
    const manifestPath = path.join(packageDirectory, 'pet.json');
    assertRegularFile(manifestPath, 1024 * 1024, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const atlasName = manifest.spritesheetPath;
    if (typeof atlasName !== 'string' || atlasName.includes('/') || atlasName.includes('\\')) {
      const error = new Error('图集路径无效。');
      error.code = 'INVALID_PREVIEW_ARTIFACT';
      throw error;
    }
    const atlasPath = path.join(packageDirectory, atlasName);
    assertRegularFile(atlasPath, MAX_ATLAS_BYTES, '图集');
    const atlasDataUrl = `data:image/webp;base64,${fs.readFileSync(atlasPath).toString('base64')}`;
    return {
      importId: project.latestImport.id,
      pet: project.latestImport.pet,
      validation: project.latestImport.validation,
      authorizationStatus: project.latestImport.authorizationStatus,
      atlasDataUrl,
      actions: project.latestImport.pet.actions.map((name) => ({
        name,
        row: STANDARD_STATES[name].row,
        frames: STANDARD_STATES[name].frames,
      })),
    };
  }

  return { importSource, loadPreview };
}

module.exports = { createImportController, deriveSourceIdentity, explainImportError };
