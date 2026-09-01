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
}

export interface WorkbenchBootstrap {
  projects: WorkbenchProject[];
  activeProject: WorkbenchProject | null;
}

export type WorkbenchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
