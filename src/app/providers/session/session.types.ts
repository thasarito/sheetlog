export type SessionStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "error";

export type UserProfile = {
  /** Stable Google account subject (`sub`), used to isolate local queues. */
  id: string | null;
  name: string;
  picture: string | null;
};

export interface SessionContextValue {
  accessToken: string | null;
  userProfile: UserProfile | null;
  isConnecting: boolean;
  isInitialized: boolean;
  status: SessionStatus;
  error: Error | null;
  connect: () => Promise<void>;
  /**
   * Clears the active session. Async work should pass the access token that
   * started it so a late failure cannot sign out a replacement account.
   */
  signOut: (expectedAccessToken?: string | null) => void;
}

export interface TokenData {
  access_token: string;
  expires_in: number;
  expires_at: number;
}
