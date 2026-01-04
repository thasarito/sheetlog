import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { exchangeCodeForTokens } from "../lib/oauth";
import { STORAGE_KEYS } from "../lib/constants";

type CallbackSearchParams = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as CallbackSearchParams;
  const [error, setError] = useState<string | null>(null);

  // Prevent double execution in React Strict Mode
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Skip if we've already processed this callback
    if (hasProcessedRef.current) {
      return;
    }

    async function handleCallback() {
      const { code, state, error: oauthError, error_description } = search;

      // Handle OAuth error from Google
      if (oauthError) {
        setError(
          error_description || oauthError || "OAuth authorization failed"
        );
        return;
      }

      // Validate required params
      if (!code || !state) {
        setError("Missing authorization code or state parameter");
        return;
      }

      // Mark as processed before async operation
      hasProcessedRef.current = true;

      try {
        // Exchange code for tokens
        const tokenData = await exchangeCodeForTokens(code, state);

        // Store tokens
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenData.access_token);
        localStorage.setItem(
          STORAGE_KEYS.EXPIRES_AT,
          tokenData.expires_at.toString()
        );

        // Redirect to home page
        navigate({ to: "/", replace: true });
      } catch (err) {
        console.error("OAuth callback error:", err);
        hasProcessedRef.current = false; // Allow retry on error
        setError(
          err instanceof Error
            ? err.message
            : "Failed to complete authentication"
        );
      }
    }

    handleCallback();
  }, [search, navigate]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-2xl border border-danger/20 bg-danger/10 p-6 text-center">
          <h1 className="text-lg font-semibold text-danger">
            Authentication Failed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/", replace: true })}
          className="rounded-2xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Completing authentication...
      </p>
    </div>
  );
}
