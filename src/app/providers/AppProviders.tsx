import type React from "react";
import { ConnectivityProvider } from "./connectivity/ConnectivityProvider";
import { SessionProvider } from "./session/SessionProvider";
import { TransactionsProvider } from "./transactions/TransactionsProvider";
import { WorkspaceProvider } from "./workspace/WorkspaceProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <SessionProvider>
        <WorkspaceProvider>
          <TransactionsProvider>{children}</TransactionsProvider>
        </WorkspaceProvider>
      </SessionProvider>
    </ConnectivityProvider>
  );
}

