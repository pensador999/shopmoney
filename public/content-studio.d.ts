export interface MountStudioOptions {
  api: (path: string, body?: unknown) => Promise<unknown>;
  notice: (message: string, isError?: boolean) => void;
}

export function mountStudio(options: MountStudioOptions): Promise<void>;
