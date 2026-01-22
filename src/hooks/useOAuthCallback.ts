import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { exchangeCodeForTokens } from "../lib/oauth";
import { STORAGE_KEYS } from "../lib/constants";
import { GOOGLE_TOKEN_QUERY_KEY } from "../app/providers/session";

type OAuthSearchParams = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

interface OAuthCallbackState {
  isProcessing: boolean;
  error: string | null;
}

/**
 * Hook to handle OAuth callback parameters at the root URL.
 * Detects OAuth params in URL and exchanges the code for tokens.
 */
export function useOAuthCallback(): OAuthCallbackState {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as OAuthSearchParams;
  const [state, setState] = useState<OAuthCallbackState>({
    isProcessing: false,
    error: null,
  });

  // Prevent double execution in React Strict Mode
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const { code, state: oauthState, error, error_description } = search;

    // No OAuth params present - nothing to do
    if (!code && !error) {
      return;
    }

    // Skip if we've already processed this callback
    if (hasProcessedRef.current) {
      return;
    }

    async function handleCallback() {
      // Handle OAuth error from Google
      if (error) {
        setState({
          isProcessing: false,
          error: error_description || error || "OAuth authorization failed",
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

        // Store tokens in localStorage
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenData.access_token);
        localStorage.setItem(
          STORAGE_KEYS.EXPIRES_AT,
          tokenData.expires_at.toString()
        );

        // Update the auth query so AuthProvider immediately reflects authenticated state
        queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, tokenData);

        // Clear OAuth params from URL by navigating to clean root
        navigate({ to: "/", replace: true, search: {} });

        setState({ isProcessing: false, error: null });
      } catch (err) {
        console.error("OAuth callback error:", err);
        hasProcessedRef.current = false; // Allow retry on error
        setState({
          isProcessing: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to complete authentication",
        });
      }
    }

    handleCallback();
  }, [search, navigate, queryClient]);

  return state;
}
