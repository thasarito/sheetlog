/**
 * Authentication consumer hooks
 */

import { useContext } from "react";
import { AUTH_STATUS_MESSAGES } from "./auth.constants";
import { AuthContext } from "./AuthProvider";
import type { AuthContextValue, SheetStatus } from "./auth.types";

/**
 * Core hook to access auth context.
 * Must be used within AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Enhanced hook that provides user-friendly status messages alongside auth state.
 * Useful for components that need to display feedback to users.
 */
export function useAuthWithStatus() {
  const auth = useAuth();

  const statusMessage = AUTH_STATUS_MESSAGES[auth.authStatus];

  // Compute more granular status for sheet connection
  const sheetStatus: SheetStatus = auth.accessToken
    ? auth.sheetId
      ? "ready"
      : "no-sheet"
    : "no-auth";

  const sheetStatusMessage =
    sheetStatus === "ready"
      ? "Google Sheet connected"
      : sheetStatus === "no-sheet"
      ? "Please connect a Google Sheet"
      : null;

  return {
    ...auth,
    statusMessage,
    sheetStatus,
    sheetStatusMessage,
    isReady: auth.authStatus === "authenticated" && !!auth.sheetId,
  };
}
