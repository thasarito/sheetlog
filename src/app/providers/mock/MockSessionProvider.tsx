import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { getMockToken } from "../../../lib/mock/mockOAuth";
import { SessionContext } from "../session/SessionContext";
import type { SessionContextValue, UserProfile } from "../session/session.types";

const MOCK_USER_PROFILE: UserProfile = {
  name: "Dev User",
  picture: null,
};

export function MockSessionProvider({ children }: { children: React.ReactNode }) {
  const mockToken = getMockToken();
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setIsConnecting(false);
  }, []);

  const signOut = useCallback(() => {
    // No-op in mock mode
    console.log("[DEV MODE] Mock signOut called");
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken: mockToken.access_token,
      userProfile: MOCK_USER_PROFILE,
      isConnecting,
      isInitialized: true,
      status: "authenticated",
      error: null,
      connect,
      signOut,
    }),
    [mockToken.access_token, isConnecting, connect, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

