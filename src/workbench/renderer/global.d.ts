import type {
  AuthorizationStatus,
  ImportPreview,
  ImportSelectionResult,
  PetPreviewStatus,
  WorkbenchBootstrap,
  WorkbenchResult,
} from './types';

declare global {
  interface Window {
    workbenchApi: {
      getBootstrap(): Promise<WorkbenchResult<WorkbenchBootstrap>>;
      createProject(input: { name: string }): Promise<WorkbenchResult<WorkbenchBootstrap>>;
      openProject(projectId: string): Promise<WorkbenchResult<WorkbenchBootstrap>>;
      selectImport(input: {
        projectId: string;
        sourceType: 'directory' | 'zip';
        authorizationStatus: AuthorizationStatus;
      }): Promise<WorkbenchResult<ImportSelectionResult>>;
      getImportPreview(projectId: string): Promise<WorkbenchResult<ImportPreview>>;
      startPetPreview(projectId: string): Promise<WorkbenchResult<PetPreviewStatus>>;
      stopPetPreview(): Promise<WorkbenchResult<PetPreviewStatus>>;
      getPetPreviewStatus(): Promise<WorkbenchResult<PetPreviewStatus>>;
      saveProduct(input: { projectId: string; product: Record<string, unknown> }): Promise<WorkbenchResult<WorkbenchProject>>;
      exportProject(projectId: string): Promise<WorkbenchResult<WorkbenchProject>>;
      exportStandardPackage(projectId: string): Promise<WorkbenchResult<WorkbenchProject>>;
      listJobs(projectId: string): Promise<WorkbenchResult<unknown[]>>;
      startExportJob(projectId: string): Promise<WorkbenchResult<unknown>>;
      startCandidateJob(input: { projectId: string; targets: Array<'mac' | 'win'> }): Promise<WorkbenchResult<unknown>>;
      cancelJob(input: { projectId: string; jobId: string }): Promise<WorkbenchResult<unknown>>;
      retryJob(input: { projectId: string; jobId: string }): Promise<WorkbenchResult<unknown>>;
    };
  }
}

export {};
