"use client";

import React from "react";
import { AuthStorageProvider } from "./AuthStorageProvider";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { OnboardingProvider } from "./OnboardingProvider";
import { TransactionsProvider } from "./TransactionsProvider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <AuthStorageProvider>
        <OnboardingProvider>
          <TransactionsProvider>{children}</TransactionsProvider>
        </OnboardingProvider>
      </AuthStorageProvider>
    </ConnectivityProvider>
  );
}

export { useAuthStorage } from "./AuthStorageProvider";
export { useConnectivity } from "./ConnectivityProvider";
export { useOnboarding } from "./OnboardingProvider";
export { useTransactions } from "./TransactionsProvider";
