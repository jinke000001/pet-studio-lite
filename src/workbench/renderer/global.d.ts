import type { WorkbenchBootstrap, WorkbenchResult } from './types';

declare global {
  interface Window {
    workbenchApi: {
      getBootstrap(): Promise<WorkbenchResult<WorkbenchBootstrap>>;
      createProject(input: { name: string }): Promise<WorkbenchResult<WorkbenchBootstrap>>;
      openProject(projectId: string): Promise<WorkbenchResult<WorkbenchBootstrap>>;
    };
  }
}

export {};
