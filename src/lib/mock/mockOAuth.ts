/**
 * Mock OAuth implementation for offline development
 * Returns fake tokens that are always "valid"
 */

import type { TokenData } from '../../components/providers/auth/auth.types';

const MOCK_TOKEN_KEY = 'sheetlog.mock.token';

const MOCK_TOKEN: TokenData = {
  access_token: 'mock-access-token-dev-mode',
  expires_in: 3600 * 24 * 365, // 1 year
  expires_at: Date.now() + 3600 * 24 * 365 * 1000, // 1 year from now
};

export function getMockToken(): TokenData {
  try {
    const stored = localStorage.getItem(MOCK_TOKEN_KEY);
    if (stored) {
      const token = JSON.parse(stored) as TokenData;
      // Always ensure token is "fresh"
      if (token.expires_at < Date.now()) {
        return refreshMockToken();
      }
      return token;
    }
  } catch {
    // Ignore parse errors
  }
  return saveMockToken(MOCK_TOKEN);
}

function saveMockToken(token: TokenData): TokenData {
  localStorage.setItem(MOCK_TOKEN_KEY, JSON.stringify(token));
  return token;
}

function refreshMockToken(): TokenData {
  const token: TokenData = {
    access_token: 'mock-access-token-dev-mode',
    expires_in: 3600 * 24 * 365,
    expires_at: Date.now() + 3600 * 24 * 365 * 1000,
  };
  return saveMockToken(token);
}

export function mockInitiateLogin(): Promise<TokenData> {
  // Simulate a brief delay for login
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(getMockToken());
    }, 100);
  });
}

export function mockClearOAuthStorage(): void {
  localStorage.removeItem(MOCK_TOKEN_KEY);
}

export function isMockTokenValid(): boolean {
  const token = getMockToken();
  return token.expires_at > Date.now();
}
