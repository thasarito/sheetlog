import type React from "react";
import { useMemo } from "react";
import {
  clearLocalWorkspace,
  readLocalWorkspace,
  type LocalWorkspaceMetadata,
} from "../../../lib/localWorkspace";
import { useSession } from "../session/session.hooks";
import type { SessionStatus } from "../session/session.types";
import { WorkspaceContext } from "../workspace/WorkspaceContext";
import { useWorkspace } from "../workspace/workspace.hooks";
import type { WorkspaceContextValue } from "../workspace/workspace.types";

export function resolveLocalWorkspace(
  upstream: WorkspaceContextValue,
  status: SessionStatus,
  metadata: LocalWorkspaceMetadata | null,
): WorkspaceContextValue {
  if (status !== "local" || !metadata) return upstream;
  return {
    sheetId: metadata.sheetId,
    sheetTabId: 0,
    isInitialized: true,
    ensureSheet: upstream.ensureSheet,
    suspendWorkspace: () => undefined,
    clearWorkspace: () => {
      clearLocalWorkspace();
      if (typeof window !== "undefined") window.location.reload();
    },
  };
}

export function LocalWorkspaceFallbackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const upstream = useWorkspace();
  const { status } = useSession();
  const metadata = useMemo(() => readLocalWorkspace(), []);
  const value = useMemo(
    () => resolveLocalWorkspace(upstream, status, metadata),
    [upstream, status, metadata],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
