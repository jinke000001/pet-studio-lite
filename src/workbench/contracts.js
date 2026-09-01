const STEP_IDS = Object.freeze(['project', 'import', 'validate', 'preview', 'product', 'export']);
const STEP_STATUSES = Object.freeze(['pending', 'active', 'completed', 'blocked']);
const JOB_TYPES = Object.freeze(['import', 'preview', 'build', 'export']);
const JOB_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted']);
const ARTIFACT_KINDS = Object.freeze([
  'sourceSnapshot',
  'standardPackage',
  'projectArchive',
  'macCandidate',
  'windowsCandidate',
  'report',
]);
const AUTHORIZATION_STATUSES = Object.freeze(['unknown', 'internal-test', 'authorized']);
const LOCAL_IMPORT_SOURCE_TYPES = Object.freeze(['directory', 'zip']);

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validateProjectId(value) {
  if (typeof value !== 'string' || !/^studio-[0-9]{8}-[0-9]{6}-[a-f0-9]{6}$/.test(value)) {
    throw contractError('INVALID_PROJECT_ID', '制作项目 ID 无效。');
  }
  return value;
}

function normalizeCreateProjectInput(input) {
  if (!isPlainObject(input) || Object.keys(input).some((key) => key !== 'name')) {
    throw contractError('INVALID_PROJECT_INPUT', '新建项目参数无效。');
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw contractError('INVALID_PROJECT_NAME', '项目名称应为 1 到 80 个可见字符。');
  }
  return { name };
}

function normalizeImportRequest(input) {
  const allowedKeys = new Set(['projectId', 'sourceType', 'authorizationStatus']);
  if (!isPlainObject(input) || Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw contractError('INVALID_IMPORT_INPUT', '导入参数无效。');
  }
  const projectId = validateProjectId(input.projectId);
  if (!LOCAL_IMPORT_SOURCE_TYPES.includes(input.sourceType)) {
    throw contractError('INVALID_IMPORT_SOURCE_TYPE', '请选择本地目录或 ZIP 文件。');
  }
  if (!AUTHORIZATION_STATUSES.includes(input.authorizationStatus)) {
    throw contractError('INVALID_AUTHORIZATION_STATUS', '素材授权状态无效。');
  }
  return { projectId, sourceType: input.sourceType, authorizationStatus: input.authorizationStatus };
}

function createWorkbenchProject({ id, name, now }) {
  const normalized = normalizeCreateProjectInput({ name });
  validateProjectId(id);
  if (!isIsoDate(now)) throw contractError('INVALID_PROJECT_FILE', '项目时间无效。');
  return {
    schemaVersion: 1,
    id,
    name: normalized.name,
    createdAt: now,
    updatedAt: now,
    activeStep: 'project',
    steps: Object.fromEntries(STEP_IDS.map((stepId) => [
      stepId,
      { status: stepId === 'project' ? 'active' : 'pending' },
    ])),
    jobs: [],
    artifacts: [],
    latestImport: null,
    product: null,
  };
}

function validateJob(job) {
  if (!isPlainObject(job)
    || typeof job.id !== 'string'
    || !JOB_TYPES.includes(job.type)
    || !JOB_STATUSES.includes(job.status)
    || (job.progress !== undefined && (!Number.isInteger(job.progress) || job.progress < 0 || job.progress > 100))) {
    throw contractError('INVALID_PROJECT_FILE', '项目任务记录无效。');
  }
}

function validateArtifact(artifact) {
  if (!isPlainObject(artifact)
    || typeof artifact.id !== 'string'
    || !ARTIFACT_KINDS.includes(artifact.kind)
    || (artifact.relativePath !== undefined
      && (typeof artifact.relativePath !== 'string'
        || artifact.relativePath.split('/').some((part) => !part || part === '.' || part === '..')))) {
    throw contractError('INVALID_PROJECT_FILE', '项目产物记录无效。');
  }
}

function validateLatestImport(latestImport) {
  if (latestImport === null || latestImport === undefined) return;
  if (!isPlainObject(latestImport)
    || !/^import-[a-f0-9]{12}$/.test(latestImport.id)
    || !['directory', 'zip', 'petdex-slug'].includes(latestImport.sourceType)
    || typeof latestImport.sourceLabel !== 'string'
    || !latestImport.sourceLabel
    || latestImport.sourceLabel.length > 120
    || typeof latestImport.sourceIdentity !== 'string'
    || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(latestImport.sourceIdentity)
    || !AUTHORIZATION_STATUSES.includes(latestImport.authorizationStatus)
    || !isIsoDate(latestImport.importedAt)
    || typeof latestImport.artifactId !== 'string'
    || !isPlainObject(latestImport.pet)
    || typeof latestImport.pet.id !== 'string'
    || typeof latestImport.pet.displayName !== 'string'
    || ![1, 2].includes(latestImport.pet.spriteVersionNumber)
    || latestImport.pet.hasAlpha !== true
    || !isPlainObject(latestImport.pet.grid)
    || !Array.isArray(latestImport.pet.actions)
    || !isPlainObject(latestImport.validation)
    || !['passed', 'warning'].includes(latestImport.validation.level)
    || !Array.isArray(latestImport.validation.messages)) {
    throw contractError('INVALID_PROJECT_FILE', '项目导入记录无效。');
  }
}

function validateWorkbenchProject(project) {
  if (!isPlainObject(project) || project.schemaVersion !== 1) {
    throw contractError('INVALID_PROJECT_FILE', '不支持的制作项目格式。');
  }
  validateProjectId(project.id);
  normalizeCreateProjectInput({ name: project.name });
  if (!isIsoDate(project.createdAt) || !isIsoDate(project.updatedAt)) {
    throw contractError('INVALID_PROJECT_FILE', '项目时间无效。');
  }
  if (!STEP_IDS.includes(project.activeStep) || !isPlainObject(project.steps)) {
    throw contractError('INVALID_PROJECT_FILE', '项目步骤状态无效。');
  }
  if (Object.keys(project.steps).length !== STEP_IDS.length
    || STEP_IDS.some((stepId) => !isPlainObject(project.steps[stepId])
      || !STEP_STATUSES.includes(project.steps[stepId].status))) {
    throw contractError('INVALID_PROJECT_FILE', '项目步骤状态无效。');
  }
  if (!Array.isArray(project.jobs) || !Array.isArray(project.artifacts)) {
    throw contractError('INVALID_PROJECT_FILE', '项目任务或产物列表无效。');
  }
  project.jobs.forEach(validateJob);
  project.artifacts.forEach(validateArtifact);
  validateLatestImport(project.latestImport);
  if (project.product !== null && project.product !== undefined && !isPlainObject(project.product)) {
    throw contractError('INVALID_PROJECT_FILE', '项目产品配置无效。');
  }
  return project;
}

module.exports = {
  ARTIFACT_KINDS,
  JOB_STATUSES,
  JOB_TYPES,
  STEP_IDS,
  STEP_STATUSES,
  createWorkbenchProject,
  normalizeImportRequest,
  normalizeCreateProjectInput,
  validateProjectId,
  validateWorkbenchProject,
};
