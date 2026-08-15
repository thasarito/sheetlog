import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "../../../lib/constants";
import { ensureSheetReady } from "../../../lib/sheets";
import { useSession } from "../session/session.hooks";
import { WorkspaceContext } from "./WorkspaceContext";
import type { WorkspaceContextValue } from "./workspace.types";

type WorkspaceState = {
  ownerId: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
};

const EMPTY_WORKSPACE: WorkspaceState = {
  ownerId: null,
  sheetId: null,
  sheetTabId: null,
};

function accountStorageKey(baseKey: string, userId: string): string {
  return `${baseKey}:${encodeURIComponent(userId)}`;
}

function removeLegacyWorkspaceStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
  localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
}

function readWorkspace(userId: string): WorkspaceState {
  const sheetId = localStorage.getItem(
    accountStorageKey(STORAGE_KEYS.SHEET_ID, userId),
  );
  const tabValue = localStorage.getItem(
    accountStorageKey(STORAGE_KEYS.SHEET_TAB_ID, userId),
  );
  const parsedTabId = tabValue ? Number.parseInt(tabValue, 10) : null;
  return {
    ownerId: userId,
    sheetId,
    sheetTabId:
      parsedTabId !== null && Number.isFinite(parsedTabId)
        ? parsedTabId
        : null,
  };
}

function removeWorkspaceStorage(userId: string): void {
  localStorage.removeItem(accountStorageKey(STORAGE_KEYS.SHEET_ID, userId));
  localStorage.removeItem(
    accountStorageKey(STORAGE_KEYS.SHEET_TAB_ID, userId),
  );
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const {
    accessToken,
    isInitialized: isSessionInitialized,
    status,
    userProfile,
  } = useSession();
  const verifiedUserId =
    accessToken && status === "authenticated" ? userProfile?.id ?? null : null;
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_WORKSPACE);
  const lastVerifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    removeLegacyWorkspaceStorage();
  }, []);

  useEffect(() => {
    if (!isSessionInitialized) {
      return;
    }
    if (!verifiedUserId) {
      setWorkspace(EMPTY_WORKSPACE);
      return;
    }

    lastVerifiedUserIdRef.current = verifiedUserId;
    setWorkspace(readWorkspace(verifiedUserId));
  }, [isSessionInitialized, verifiedUserId]);

  const activeWorkspace =
    verifiedUserId && workspace.ownerId === verifiedUserId
      ? workspace
      : EMPTY_WORKSPACE;
  const isInitialized = Boolean(
    isSessionInitialized &&
      ((status === "unauthenticated" || status === "error") ||
        (verifiedUserId && workspace.ownerId === verifiedUserId)),
  );

  const clearWorkspace = useCallback(() => {
    const ownerId = verifiedUserId ?? lastVerifiedUserIdRef.current;
    if (ownerId) {
      removeWorkspaceStorage(ownerId);
    }
    removeLegacyWorkspaceStorage();
    setWorkspace({
      ownerId: verifiedUserId,
      sheetId: null,
      sheetTabId: null,
    });
  }, [verifiedUserId]);

  const suspendWorkspace = useCallback(() => {
    removeLegacyWorkspaceStorage();
    setWorkspace(EMPTY_WORKSPACE);
  }, []);

  const storeWorkspace = useCallback(
    (id: string, tabId: number | null) => {
      if (!verifiedUserId) {
        throw new Error("Google account identity is unavailable");
      }
      localStorage.setItem(
        accountStorageKey(STORAGE_KEYS.SHEET_ID, verifiedUserId),
        id,
      );
      const tabKey = accountStorageKey(
        STORAGE_KEYS.SHEET_TAB_ID,
        verifiedUserId,
      );
      if (tabId === null) {
        localStorage.removeItem(tabKey);
      } else {
        localStorage.setItem(tabKey, tabId.toString());
      }
      setWorkspace({ ownerId: verifiedUserId, sheetId: id, sheetTabId: tabId });
    },
    [verifiedUserId],
  );

  const ensureSheet = useCallback(
    async (folderId?: string | null) => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }
      if (!verifiedUserId) {
        throw new Error("Google account identity is unavailable");
      }
      const next = await ensureSheetReady(accessToken, folderId);
      storeWorkspace(next.sheetId, next.sheetTabId);
    },
    [accessToken, storeWorkspace, verifiedUserId],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      sheetId: activeWorkspace.sheetId,
      sheetTabId: activeWorkspace.sheetTabId,
      isInitialized,
      ensureSheet,
      suspendWorkspace,
      clearWorkspace,
    }),
    [
      activeWorkspace.sheetId,
      activeWorkspace.sheetTabId,
      isInitialized,
      ensureSheet,
      suspendWorkspace,
      clearWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
