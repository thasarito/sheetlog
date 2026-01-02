import { GoogleApiError } from './google';

export type GoogleErrorInfo = {
  message: string;
  shouldClearAuth: boolean;
  retryable: boolean;
  status: number | null;
};

export function isGoogleAuthError(error: unknown): boolean {
  return error instanceof GoogleApiError && (error.status === 401 || error.status === 403);
}

export function mapGoogleSyncError(error: unknown): GoogleErrorInfo {
  if (error instanceof GoogleApiError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return {
        message: 'Reconnect to Google to keep syncing.',
        shouldClearAuth: true,
        retryable: false,
        status
      };
    }
    if (status === 404) {
      return {
        message: 'Sheet not found. Reconnect to create a new one.',
        shouldClearAuth: false,
        retryable: false,
        status
      };
    }
    if (status === 429 || status >= 500) {
      return {
        message: 'Sync paused due to Google service issues. We will retry automatically.',
        shouldClearAuth: false,
        retryable: true,
        status
      };
    }
    return {
      message: error.message || 'Google API error',
      shouldClearAuth: false,
      retryable: false,
      status
    };
  }

  if (error instanceof TypeError) {
    return {
      message: 'Network error while syncing.',
      shouldClearAuth: false,
      retryable: true,
      status: null
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message || 'Sync failed.',
      shouldClearAuth: false,
      retryable: false,
      status: null
    };
  }

  return {
    message: 'Sync failed.',
    shouldClearAuth: false,
    retryable: false,
    status: null
  };
}
