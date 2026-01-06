import type React from "react";
import { AuthProvider } from "./auth";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { TransactionsProvider } from "./TransactionsProvider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <TransactionsProvider>{children}</TransactionsProvider>
      </AuthProvider>
    </ConnectivityProvider>
  );
}
