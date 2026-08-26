import type React from "react";
import { ConnectivityProvider } from "./connectivity/ConnectivityProvider";
import { LocalSessionFallbackProvider } from "./local/LocalSessionFallbackProvider";
import { LocalWorkspaceFallbackProvider } from "./local/LocalWorkspaceFallbackProvider";
import { SessionProvider } from "./session/SessionProvider";
import { TransactionsProvider } from "./transactions/TransactionsProvider";
import { WorkspaceProvider } from "./workspace/WorkspaceProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <SessionProvider>
        <LocalSessionFallbackProvider>
          <WorkspaceProvider>
            <LocalWorkspaceFallbackProvider>
              <TransactionsProvider>{children}</TransactionsProvider>
            </LocalWorkspaceFallbackProvider>
          </WorkspaceProvider>
        </LocalSessionFallbackProvider>
      </SessionProvider>
    </ConnectivityProvider>
  );
}
