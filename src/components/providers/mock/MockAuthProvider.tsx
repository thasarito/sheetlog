/**
 * Mock Auth Provider for offline development
 * Always returns authenticated status with valid token and sheet ID
 */

import type React from 'react';
import { useCallback, useMemo } from 'react';
import { getMockToken } from '../../../lib/mock/mockOAuth';
import { AuthContext } from '../auth/AuthContext';
import type { AuthContextValue, UserProfile } from '../auth/auth.types';

const MOCK_SHEET_ID = 'mock-sheet-id-dev';
const MOCK_SHEET_TAB_ID = 0;

const MOCK_USER_PROFILE: UserProfile = {
  name: 'Dev User',
  picture: null,
};

export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const mockToken = getMockToken();

  const connect = useCallback(async () => {
    // No-op in mock mode - already "connected"
    console.log('[DEV MODE] Mock connect called');
  }, []);

  const refreshSheet = useCallback(async (_folderId?: string | null) => {
    // No-op in mock mode
    console.log('[DEV MODE] Mock refreshSheet called');
  }, []);

  const clearAuth = useCallback(() => {
    // No-op in mock mode
    console.log('[DEV MODE] Mock clearAuth called');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: mockToken.access_token,
      sheetId: MOCK_SHEET_ID,
      sheetTabId: MOCK_SHEET_TAB_ID,
      userProfile: MOCK_USER_PROFILE,
      isConnecting: false,
      isInitialized: true,
      authStatus: 'authenticated',
      authError: null,
      connect,
      refreshSheet,
      clearAuth,
    }),
    [mockToken.access_token, connect, refreshSheet, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
