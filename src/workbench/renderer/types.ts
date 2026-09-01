export type StepId = 'project' | 'import' | 'validate' | 'preview' | 'product' | 'export';
export type StepStatus = 'pending' | 'active' | 'completed' | 'blocked';

export interface WorkbenchProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeStep: StepId;
  steps: Record<StepId, { status: StepStatus }>;
  jobs: unknown[];
  artifacts: unknown[];
  latestImport: ImportSummary | null;
  product: Record<string, unknown> | null;
}

export type AuthorizationStatus = 'unknown' | 'internal-test' | 'authorized';

export interface ImportSummary {
  id: string;
  sourceType: 'directory' | 'zip' | 'petdex-slug';
  sourceLabel: string;
  sourceIdentity: string;
  authorizationStatus: AuthorizationStatus;
  importedAt: string;
  artifactId: string;
  pet: {
    id: string;
    displayName: string;
    spriteVersionNumber: 1 | 2;
    grid: { columns: number; rows: number; cellWidth: number; cellHeight: number };
    hasAlpha: true;
    lookDirections: boolean;
    actions: string[];
  };
  validation: { level: 'passed' | 'warning'; messages: string[] };
}

export interface ImportPreview {
  importId: string;
  pet: ImportSummary['pet'];
  validation: ImportSummary['validation'];
  authorizationStatus: AuthorizationStatus;
  atlasDataUrl: string;
  actions: Array<{ name: string; row: number; frames: number }>;
}

export interface PetPreviewStatus {
  status: 'running' | 'stopped';
  projectId?: string;
}

export interface WorkbenchBootstrap {
  projects: WorkbenchProject[];
  activeProject: WorkbenchProject | null;
  petPreview?: PetPreviewStatus;
}

export interface ImportSelectionResult extends WorkbenchBootstrap { cancelled: boolean }

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';

export interface WorkbenchJob {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  step: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error?: { code: string; message: string };
  result?: unknown;
}

export type WorkbenchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; title?: string; unaffected?: string; action?: string } };
