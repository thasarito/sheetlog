import { motion, AnimatePresence } from 'framer-motion';
import { Sheet } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useDemoContext } from './DemoContext';

type SpreadsheetRow = {
  id: string;
  date: string;
  category: string;
  amount: string;
  account: string;
  isNew?: boolean;
};

const INITIAL_ROWS: SpreadsheetRow[] = [
  { id: '1', date: '2026-01-22', category: 'Dining Out', amount: '$28.90', account: 'Credit Card' },
  { id: '2', date: '2026-01-23', category: 'Coffee', amount: '$4.50', account: 'Credit Card' },
  { id: '3', date: '2026-01-23', category: 'Groceries', amount: '$45.12', account: 'Bank' },
];

type SpreadsheetPreviewProps = {
  className?: string;
  showHeader?: boolean;
};

export function SpreadsheetPreview({ className, showHeader = false }: SpreadsheetPreviewProps) {
  const { transactions, registerSheetRef } = useDemoContext();
  const [rows, setRows] = useState<SpreadsheetRow[]>(INITIAL_ROWS);
  const lastTransactionCountRef = useRef<number>(0);

  // Register this component's container with the context for scrolling
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerSheetRef(node);
    },
    [registerSheetRef]
  );

  // Watch for new transactions from the demo (appended to end)
  useEffect(() => {
    if (transactions.length === 0) return;
    if (transactions.length === lastTransactionCountRef.current) return;

    lastTransactionCountRef.current = transactions.length;

    // Get the latest transaction (last in array since we append)
    const latestTransaction = transactions[transactions.length - 1];

    const newRow: SpreadsheetRow = {
      id: latestTransaction.id,
      date: latestTransaction.date,
      category: latestTransaction.category,
      amount: latestTransaction.amount,
      account: latestTransaction.account,
      isNew: true,
    };

    setRows((prev) => {
      // Remove isNew from previous rows and append new row at end
      const updated = [...prev.map((r) => ({ ...r, isNew: false })), newRow];
      // Keep only last 5 rows
      return updated.slice(-5);
    });
  }, [transactions]);

  return (
    <div ref={setContainerRef} className={className}>
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        {/* Google Sheets header bar */}
        {showHeader && (
          <div className="flex items-center gap-2 border-b border-border bg-[#34A853]/5 px-3 py-2">
            <Sheet className="h-4 w-4 text-[#34A853]" />
            <span className="text-xs font-medium text-foreground">SheetLog Transactions</span>
          </div>
        )}

        {/* Column headers */}
        <div className="grid grid-cols-4 gap-px border-b border-border bg-surface text-[10px] font-semibold text-muted-foreground">
          <div className="bg-surface-2 px-2 py-1.5">Date</div>
          <div className="bg-surface-2 px-2 py-1.5">Category</div>
          <div className="bg-surface-2 px-2 py-1.5">Amount</div>
          <div className="bg-surface-2 px-2 py-1.5">Account</div>
        </div>

        {/* Data rows */}
        <div className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) => (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  backgroundColor: row.isNew ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                  backgroundColor: { duration: 2 },
                }}
                className="grid grid-cols-4 gap-px border-b border-border/50 text-[10px] last:border-b-0"
              >
                <div className="truncate px-2 py-1.5 text-muted-foreground">{row.date}</div>
                <div className="truncate px-2 py-1.5 font-medium text-foreground">{row.category}</div>
                <div className="truncate px-2 py-1.5 tabular-nums text-foreground">{row.amount}</div>
                <div className="truncate px-2 py-1.5 text-muted-foreground">{row.account}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Sync indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -right-1 -top-1 flex items-center gap-1 rounded-full border border-[#34A853]/40 bg-[#34A853]/15 px-2 py-0.5"
        >
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
            className="h-1.5 w-1.5 rounded-full bg-[#34A853]"
          />
          <span className="text-[9px] font-semibold text-[#34A853]">Synced</span>
        </motion.div>
      </div>
    </div>
  );
}
