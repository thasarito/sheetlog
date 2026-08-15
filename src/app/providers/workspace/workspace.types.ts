export interface WorkspaceContextValue {
  sheetId: string | null;
  sheetTabId: number | null;
  isInitialized: boolean;
  ensureSheet: (folderId?: string | null) => Promise<void>;
  /** Hide the active workspace during an account handoff without deleting it. */
  suspendWorkspace: () => void;
  clearWorkspace: () => void;
}
