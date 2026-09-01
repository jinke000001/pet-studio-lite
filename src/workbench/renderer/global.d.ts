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
    };
  }
}

export {};
