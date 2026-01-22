import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "../../../lib/constants";
import { ensureSheetReady } from "../../../lib/sheets";
import { useSession } from "../session/session.hooks";
import { WorkspaceContext } from "./WorkspaceContext";
import type { WorkspaceContextValue } from "./workspace.types";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isInitialized: isSessionInitialized, status } = useSession();

  const [sheetId, setSheetId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.SHEET_ID);
  });

  const [sheetTabId, setSheetTabId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const value = localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID);
    return value ? Number.parseInt(value, 10) : null;
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  const clearWorkspace = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
    localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
    setSheetId(null);
    setSheetTabId(null);
  }, []);

  useEffect(() => {
    if (!isSessionInitialized) {
      return;
    }
    if (status === "authenticated") {
      wasAuthenticatedRef.current = true;
      return;
    }
    if (status === "unauthenticated" && wasAuthenticatedRef.current) {
      clearWorkspace();
      wasAuthenticatedRef.current = false;
    }
  }, [status, isSessionInitialized, clearWorkspace]);

  const storeWorkspace = useCallback((id: string, tabId: number | null) => {
    localStorage.setItem(STORAGE_KEYS.SHEET_ID, id);
    setSheetId(id);
    if (tabId !== null) {
      localStorage.setItem(STORAGE_KEYS.SHEET_TAB_ID, tabId.toString());
      setSheetTabId(tabId);
    }
  }, []);

  const ensureSheet = useCallback(
    async (folderId?: string | null) => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }
      const next = await ensureSheetReady(accessToken, folderId);
      storeWorkspace(next.sheetId, next.sheetTabId);
    },
    [accessToken, storeWorkspace]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      sheetId,
      sheetTabId,
      isInitialized,
      ensureSheet,
      clearWorkspace,
    }),
    [sheetId, sheetTabId, isInitialized, ensureSheet, clearWorkspace]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

