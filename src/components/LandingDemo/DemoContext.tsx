import { createContext, useCallback, useContext, useRef, useState } from 'react';

export type DemoTransaction = {
  id: string;
  date: string;
  category: string;
  amount: string;
  account: string;
  timestamp: number;
};

type DemoContextValue = {
  transactions: DemoTransaction[];
  addTransaction: (transaction: Omit<DemoTransaction, 'id' | 'timestamp'>) => void;
  clearTransactions: () => void;
  registerSheetRef: (ref: HTMLDivElement | null) => void;
  scrollToSheet: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<DemoTransaction[]>([]);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const addTransaction = useCallback(
    (transaction: Omit<DemoTransaction, 'id' | 'timestamp'>) => {
      const newTransaction: DemoTransaction = {
        ...transaction,
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
      };
      setTransactions((prev) => [...prev, newTransaction].slice(-10));
    },
    []
  );

  const clearTransactions = useCallback(() => {
    setTransactions([]);
  }, []);

  const registerSheetRef = useCallback((ref: HTMLDivElement | null) => {
    sheetRef.current = ref;
  }, []);

  const scrollToSheet = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <DemoContext.Provider
      value={{ transactions, addTransaction, clearTransactions, registerSheetRef, scrollToSheet }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) {
    // Return a no-op implementation when outside the provider
    return {
      transactions: [],
      addTransaction: () => {},
      clearTransactions: () => {},
      registerSheetRef: () => {},
      scrollToSheet: () => {},
    };
  }
  return context;
}
