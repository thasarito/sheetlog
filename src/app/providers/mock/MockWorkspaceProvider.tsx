import type React from "react";
import { useCallback, useMemo } from "react";
import { WorkspaceContext } from "../workspace/WorkspaceContext";
import type { WorkspaceContextValue } from "../workspace/workspace.types";

const MOCK_SHEET_ID = "mock-sheet-id-dev";
const MOCK_SHEET_TAB_ID = 0;

export function MockWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const ensureSheet = useCallback(async () => {
    // No-op in mock mode - already "ready"
    console.log("[DEV MODE] Mock ensureSheet called");
  }, []);

  const clearWorkspace = useCallback(() => {
    // No-op in mock mode
    console.log("[DEV MODE] Mock clearWorkspace called");
  }, []);

  const suspendWorkspace = useCallback(() => {
    // No-op in mock mode - the workspace is intentionally fixed.
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      sheetId: MOCK_SHEET_ID,
      sheetTabId: MOCK_SHEET_TAB_ID,
      isInitialized: true,
      ensureSheet,
      suspendWorkspace,
      clearWorkspace,
    }),
    [ensureSheet, suspendWorkspace, clearWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
