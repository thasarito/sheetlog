import type React from "react";
import { ConnectivityProvider } from "../connectivity/ConnectivityProvider";
import { TransactionsProvider } from "../transactions/TransactionsProvider";
import { MockSessionProvider } from "./MockSessionProvider";
import { MockWorkspaceProvider } from "./MockWorkspaceProvider";

export function MockAppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <MockSessionProvider>
        <MockWorkspaceProvider>
          <TransactionsProvider>{children}</TransactionsProvider>
        </MockWorkspaceProvider>
      </MockSessionProvider>
    </ConnectivityProvider>
  );
}

