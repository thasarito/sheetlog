import type React from "react";
import { useMemo } from "react";
import {
  readLocalWorkspace,
  type LocalWorkspaceMetadata,
} from "../../../lib/localWorkspace";
import { SessionContext } from "../session/SessionContext";
import { useSession } from "../session/session.hooks";
import type { SessionContextValue } from "../session/session.types";

export function resolveLocalSession(
  upstream: SessionContextValue,
  metadata: LocalWorkspaceMetadata | null,
): SessionContextValue {
  if (!metadata || upstream.status !== "unauthenticated") return upstream;
  return {
    ...upstream,
    accessToken: null,
    userProfile: {
      id: metadata.userId,
      name: "Local workspace",
      picture: null,
    },
    isInitialized: true,
    status: "local",
    error: null,
  };
}

export function LocalSessionFallbackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const upstream = useSession();
  const metadata = useMemo(() => readLocalWorkspace(), []);
  const value = useMemo(
    () => resolveLocalSession(upstream, metadata),
    [upstream, metadata],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
