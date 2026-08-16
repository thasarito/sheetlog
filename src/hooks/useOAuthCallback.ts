import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { exchangeCodeForTokens } from "../lib/oauth";
import { STORAGE_KEYS } from "../lib/constants";
import {
  advanceSessionTokenGeneration,
  GOOGLE_TOKEN_QUERY_KEY,
  USER_PROFILE_QUERY_KEY,
} from "../app/providers/session";
import { useWorkspace } from "../app/providers/workspace/workspace.hooks";

type OAuthSearchParams = {
  code?: string;
  state?: string;
  error?: string;
};

interface OAuthCallbackState {
  isProcessing: boolean;
  error: string | null;
}

function getAuthorizationErrorMessage(error: unknown): string {
  if (
    typeof error !== "string" ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(error)
  ) {
    return "OAuth authorization failed";
  }

  if (error === "access_denied") {
    return "Google sign-in was canceled.";
  }

  return `OAuth authorization failed (${error}).`;
}

/**
 * Hook to handle OAuth callback parameters at the root URL.
 * Detects OAuth params in URL and exchanges the code for tokens.
 */
export function useOAuthCallback(): OAuthCallbackState {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { suspendWorkspace } = useWorkspace();
  const search = useSearch({ strict: false }) as OAuthSearchParams;
  const [state, setState] = useState<OAuthCallbackState>({
    isProcessing: false,
    error: null,
  });

  // Prevent double execution in React Strict Mode
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const { code, state: oauthState, error } = search;

    // No OAuth params present - nothing to do
    if (!code && error === undefined) {
      return;
    }

    // Skip if we've already processed this callback
    if (hasProcessedRef.current) {
      return;
    }

    async function handleCallback() {
      // Handle OAuth error from Google
      if (error !== undefined) {
        setState({
          isProcessing: false,
          error: getAuthorizationErrorMessage(error),
        });
        return;
      }

      // Validate required params
      if (!code || !oauthState) {
        setState({
          isProcessing: false,
          error: "Missing authorization code or state parameter",
        });
        return;
      }

      // Mark as processing
      hasProcessedRef.current = true;
      setState({ isProcessing: true, error: null });

      try {
        // Exchange code for tokens
        const tokenData = await exchangeCodeForTokens(code, oauthState);

        // Retire all account-A identity and workspace state before token B is
        // observable by transaction consumers.
        advanceSessionTokenGeneration();
        await queryClient.cancelQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
        await queryClient.cancelQueries({ queryKey: USER_PROFILE_QUERY_KEY });
        queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
        queryClient.removeQueries({ queryKey: ["onboarding"] });
        queryClient.removeQueries({ queryKey: ["settings"] });
        queryClient.removeQueries({ queryKey: ["quickNotes"] });
        localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
        localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
        localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
        suspendWorkspace();

        // Store tokens in localStorage
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenData.access_token);
        localStorage.setItem(
          STORAGE_KEYS.EXPIRES_AT,
          tokenData.expires_at.toString()
        );

        // Update the auth query so AuthProvider immediately reflects authenticated state
        queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, tokenData);

        // Clear OAuth params from URL by navigating to the app
        navigate({ to: "/app", replace: true, search: {} });

        setState({ isProcessing: false, error: null });
      } catch (caughtError) {
        hasProcessedRef.current = false; // Allow retry on error
        setState({
          isProcessing: false,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to complete authentication",
        });
      }
    }

    handleCallback();
  }, [search, navigate, queryClient, suspendWorkspace]);

  return state;
}
