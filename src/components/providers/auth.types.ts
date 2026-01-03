/**
 * Authentication types and interfaces
 */

export type AuthStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "error";

export type SheetStatus = "ready" | "no-sheet" | "no-auth";

export interface AuthStorageContextValue {
  accessToken: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
  isConnecting: boolean;
  isInitialized: boolean;
  authStatus: AuthStatus;
  authError: Error | null;
  connect: () => Promise<void>;
  refreshSheet: (folderId?: string | null) => Promise<void>;
  clearAuth: () => void;
}

export interface TokenData {
  access_token: string;
  expires_in: number;
  expires_at: number;
}
