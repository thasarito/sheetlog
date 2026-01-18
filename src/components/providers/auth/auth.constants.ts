/**
 * Authentication constants and configuration
 */

import type { AuthStatus } from './auth.types';

/** Buffer time before token expiry to trigger refresh (5 minutes) */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Minimum interval between refetch attempts */
export const MIN_REFETCH_INTERVAL_MS = 1000;

/** React Query key for Google token */
export const GOOGLE_TOKEN_QUERY_KEY = ['googleToken'] as const;

/** User-friendly status messages for each auth state */
export const AUTH_STATUS_MESSAGES: Record<AuthStatus, string> = {
  initializing: 'Checking authentication...',
  unauthenticated: 'Please sign in with Google to continue',
  authenticating: 'Connecting to Google...',
  authenticated: 'Connected',
  error: 'Authentication failed. Please try signing in again.',
};

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
];
