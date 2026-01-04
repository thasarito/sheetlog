/**
 * OAuth 2.0 utilities for Authorization Code flow with PKCE
 *
 * This module handles the complete OAuth flow:
 * 1. Generate PKCE code verifier and challenge
 * 2. Build authorization URL and redirect to Google
 * 3. Exchange authorization code for tokens
 * 4. Refresh access token using refresh token
 */

import { SCOPES } from "../components/providers/auth/auth.constants";

// OAuth endpoints
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Storage keys for OAuth flow
export const OAUTH_STORAGE_KEYS = {
  CODE_VERIFIER: "sheetlog.oauth.codeVerifier",
  REFRESH_TOKEN: "sheetlog.oauth.refreshToken",
  STATE: "sheetlog.oauth.state",
} as const;

// Types
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface TokenData {
  access_token: string;
  expires_in: number;
  expires_at: number;
  refresh_token?: string;
}

/**
 * Generates a cryptographically random code verifier for PKCE
 * Must be between 43-128 characters
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generates a random state parameter to prevent CSRF attacks
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generates the code challenge from the code verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Get OAuth client configuration from environment
 */
function getOAuthConfig() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("Missing VITE_GOOGLE_CLIENT_ID environment variable");
  }

  return { clientId, clientSecret };
}

/**
 * Get the OAuth callback URL based on current location
 * Uses root URL to work with GitHub Pages (no SPA routing support)
 */
export function getRedirectUri(): string {
  const baseUrl = window.location.origin;
  const basePath = import.meta.env.BASE_URL || "/";
  // Return root URL - OAuth params will be handled at the root
  return `${baseUrl}${basePath.endsWith("/") ? basePath : `${basePath}/`}`;
}

/**
 * Builds the Google OAuth authorization URL and stores PKCE state
 */
export async function buildAuthorizationUrl(): Promise<string> {
  const { clientId } = getOAuthConfig();
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier and state for later verification
  localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
  localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // Request refresh token
    prompt: "consent", // Always show consent to get refresh token
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<TokenData> {
  const { clientId, clientSecret } = getOAuthConfig();

  // Verify state to prevent CSRF
  const storedState = localStorage.getItem(OAUTH_STORAGE_KEYS.STATE);

  // Debug logging
  console.log("[OAuth] State validation:", {
    receivedState: state,
    storedState,
    stateMatch: storedState === state,
    storageKeys: Object.keys(localStorage).filter((k) =>
      k.startsWith("sheetlog")
    ),
  });

  if (!storedState) {
    throw new Error(
      "OAuth state not found in storage. The OAuth flow may have been interrupted or started from a different tab/window."
    );
  }

  if (storedState !== state) {
    throw new Error(
      `OAuth state mismatch. Expected: ${storedState.substring(
        0,
        8
      )}..., Got: ${state.substring(0, 8)}...`
    );
  }

  // Get stored code verifier
  const codeVerifier = localStorage.getItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER);
  if (!codeVerifier) {
    throw new Error(
      "Missing code verifier - OAuth flow not initiated properly"
    );
  }

  // Clean up stored PKCE state
  localStorage.removeItem(OAUTH_STORAGE_KEYS.STATE);
  localStorage.removeItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER);

  const body: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  };

  // Include client_secret if available (required by Google even for public clients)
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token exchange failed:", errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;
  const now = Date.now();

  // Store refresh token if provided
  if (data.refresh_token) {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_at: now + data.expires_in * 1000,
    refresh_token: data.refresh_token,
  };
}

/**
 * Refreshes the access token using the stored refresh token
 * This is the key function for silent token refresh
 */
export async function refreshAccessToken(): Promise<TokenData> {
  const { clientId, clientSecret } = getOAuthConfig();
  const refreshToken = localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN);

  if (!refreshToken) {
    throw new Error("No refresh token available - user must re-authenticate");
  }

  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  // Include client_secret if available
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token refresh failed:", errorText);

    // If refresh fails with 400/401, the refresh token is likely revoked
    if (response.status === 400 || response.status === 401) {
      localStorage.removeItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN);
      throw new Error(
        "Refresh token expired or revoked - user must re-authenticate"
      );
    }

    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;
  const now = Date.now();

  // Google may return a new refresh token (though typically doesn't)
  if (data.refresh_token) {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_at: now + data.expires_in * 1000,
    refresh_token: data.refresh_token,
  };
}

/**
 * Checks if a refresh token is available
 */
export function hasRefreshToken(): boolean {
  return Boolean(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN));
}

/**
 * Clears all OAuth-related storage
 */
export function clearOAuthStorage(): void {
  localStorage.removeItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER);
  localStorage.removeItem(OAUTH_STORAGE_KEYS.STATE);
  localStorage.removeItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Initiates the OAuth login flow by redirecting to Google
 */
export async function initiateLogin(): Promise<void> {
  const authUrl = await buildAuthorizationUrl();
  window.location.href = authUrl;
}
