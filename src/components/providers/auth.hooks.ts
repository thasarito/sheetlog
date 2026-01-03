/**
 * Authentication consumer hooks
 */

import { useContext } from "react";
import { AUTH_STATUS_MESSAGES } from "./auth.constants";
import { AuthStorageContext } from "./AuthStorageProvider";
import type { AuthStorageContextValue, SheetStatus } from "./auth.types";

/**
 * Core hook to access auth storage context.
 * Must be used within AuthStorageProvider.
 */
export function useAuthStorage(): AuthStorageContextValue {
  const context = useContext(AuthStorageContext);
  if (!context) {
    throw new Error("useAuthStorage must be used within AuthStorageProvider");
  }
  return context;
}

/**
 * Enhanced hook that provides user-friendly status messages alongside auth state.
 * Useful for components that need to display feedback to users.
 */
export function useAuthStorageWithStatus() {
  const auth = useAuthStorage();

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
