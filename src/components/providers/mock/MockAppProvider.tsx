/**
 * Mock App Provider for offline development
 * Wraps children with mock auth and transaction providers
 */

import type React from 'react';
import { ConnectivityProvider } from '../ConnectivityProvider';
import { TransactionsProvider } from '../TransactionsProvider';
import { MockAuthProvider } from './MockAuthProvider';

export function MockAppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectivityProvider>
      <MockAuthProvider>
        <TransactionsProvider>{children}</TransactionsProvider>
      </MockAuthProvider>
    </ConnectivityProvider>
  );
}
