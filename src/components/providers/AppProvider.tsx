import type React from "react";
import { AuthProvider } from "./auth";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { OnboardingProvider } from "./OnboardingProvider";
import { TransactionsProvider } from "./TransactionsProvider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <OnboardingProvider>
          <TransactionsProvider>{children}</TransactionsProvider>
        </OnboardingProvider>
      </AuthProvider>
    </ConnectivityProvider>
  );
}
