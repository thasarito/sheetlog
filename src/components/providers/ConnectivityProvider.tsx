import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ConnectivityContext } from './ConnectivityContext';

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsOnline(window.navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const value = useMemo(() => ({ isOnline }), [isOnline]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}
