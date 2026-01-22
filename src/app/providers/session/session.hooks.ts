import { useContext } from "react";
import { SessionContext } from "./SessionContext";
import { SESSION_STATUS_MESSAGES } from "./session.constants";
import type { SessionContextValue } from "./session.types";

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

export function useSessionWithStatus() {
  const session = useSession();

  return {
    ...session,
    statusMessage: SESSION_STATUS_MESSAGES[session.status],
    isReady: session.status === "authenticated" && !!session.accessToken,
  };
}

