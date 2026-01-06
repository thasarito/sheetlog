import { createContext, useContext } from 'react';

export interface ConnectivityContextValue {
  isOnline: boolean;
}

export const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return context;
}
