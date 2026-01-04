import { Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import AppProvider from "./providers";
import { Toaster } from "./ui/sonner";
import { ReloadPrompt } from "./ReloadPrompt";
import { useOAuthCallback } from "../hooks/useOAuthCallback";

function AppContent() {
  const navigate = useNavigate();
  const { isProcessing, error } = useOAuthCallback();

  // Show loading state while processing OAuth callback
  if (isProcessing) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Completing authentication...
        </p>
      </div>
    );
  }

  // Show error state if OAuth failed
  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-2xl border border-danger/20 bg-danger/10 p-6 text-center">
          <h1 className="text-lg font-semibold text-danger">
            Authentication Failed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/", replace: true, search: {} })}
          className="rounded-2xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <>
      <Outlet />
      <Toaster />
      <ReloadPrompt />
    </>
  );
}

export function AppShell() {
  return (
    <AppProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <AppContent />
      </div>
    </AppProvider>
  );
}
