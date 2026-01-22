export type SessionStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "error";

export type UserProfile = {
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
  signOut: () => void;
}

export interface TokenData {
  access_token: string;
  expires_in: number;
  expires_at: number;
}

