export interface WorkspaceContextValue {
  sheetId: string | null;
  sheetTabId: number | null;
  isInitialized: boolean;
  ensureSheet: (folderId?: string | null) => Promise<void>;
  clearWorkspace: () => void;
}

