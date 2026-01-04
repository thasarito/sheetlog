import type React from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./auth";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { OnboardingProvider } from "./OnboardingProvider";
import { TransactionsProvider } from "./TransactionsProvider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <ConnectivityProvider>
        <AuthProvider>
          <OnboardingProvider>
            <TransactionsProvider>{children}</TransactionsProvider>
          </OnboardingProvider>
        </AuthProvider>
      </ConnectivityProvider>
    </GoogleOAuthProvider>
  );
}

export { useAuth } from "./auth";
export { useConnectivity } from "./ConnectivityProvider";
export { useOnboarding } from "./OnboardingProvider";
export { useTransactions } from "./TransactionsProvider";
