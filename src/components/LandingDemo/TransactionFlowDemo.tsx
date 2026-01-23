import { format, subDays, subMinutes } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_CATEGORIES } from '../../lib/categories';
import type { TransactionRecord, TransactionType } from '../../lib/types';
import { StepAmount } from '../TransactionFlow/StepAmount';
import { StepCard } from '../TransactionFlow/StepCard';
import { StepCategory } from '../TransactionFlow/StepCategory';
import { StepReceipt, type ReceiptData } from '../TransactionFlow/StepReceipt';
import { TopDashboard } from '../TransactionFlow/TopDashboard';
import { TYPE_OPTIONS } from '../TransactionFlow/constants';
import { useTransactionForm } from '../TransactionFlow/useTransactionForm';

const DEMO_ACCOUNTS = ['Credit Card', 'Bank', 'Cash'];
const SAVE_DELAY_MS = 450;
const AUTO_RESET_DELAY_MS = 2000;

type DemoStep = 0 | 1 | 2;

function formatLocalIso(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss");
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded.toFixed(1)}s`;
}

function createSeedTransactions(now: Date): TransactionRecord[] {
  const baseToday = now;
  const baseYesterday = subDays(now, 1);
  const yesterdayEvening = new Date(baseYesterday);
  yesterdayEvening.setHours(19, 20, 0, 0);

  const t1 = subMinutes(baseToday, 6);
  const t2 = subMinutes(baseToday, 22);
  const t3 = subMinutes(baseToday, 78);
  const t4 = subMinutes(baseToday, 180);

  return [
    {
      id: 'demo-tx-1',
      status: 'synced',
      createdAt: formatLocalIso(t1),
      updatedAt: formatLocalIso(t1),
      type: 'expense',
      category: 'Coffee & Snacks',
      amount: 4.5,
      currency: 'USD',
      account: 'Credit Card',
      for: 'Me',
      date: formatLocalIso(t1),
      note: 'Latte',
    },
    {
      id: 'demo-tx-2',
      status: 'synced',
      createdAt: formatLocalIso(t2),
      updatedAt: formatLocalIso(t2),
      type: 'expense',
      category: 'Food Delivery',
      amount: 12.34,
      currency: 'USD',
      account: 'Credit Card',
      for: 'Me',
      date: formatLocalIso(t2),
      note: 'Dinner',
    },
    {
      id: 'demo-tx-3',
      status: 'synced',
      createdAt: formatLocalIso(t3),
      updatedAt: formatLocalIso(t3),
      type: 'expense',
      category: 'Groceries & Home Supplies',
      amount: 45.12,
      currency: 'USD',
      account: 'Bank',
      for: 'Me',
      date: formatLocalIso(t3),
      note: 'Trader Joe’s',
    },
    {
      id: 'demo-tx-4',
      status: 'synced',
      createdAt: formatLocalIso(t4),
      updatedAt: formatLocalIso(t4),
      type: 'income',
      category: 'Salary',
      amount: 2000,
      currency: 'USD',
      account: 'Bank',
      for: 'Me',
      date: formatLocalIso(t4),
      note: undefined,
    },
    {
      id: 'demo-tx-5',
      status: 'synced',
      createdAt: formatLocalIso(yesterdayEvening),
      updatedAt: formatLocalIso(yesterdayEvening),
      type: 'expense',
      category: 'Dining Out',
      amount: 28.9,
      currency: 'USD',
      account: 'Credit Card',
      for: 'Me',
      date: formatLocalIso(yesterdayEvening),
      note: 'Sushi',
    },
  ];
}

type TransactionFlowDemoProps = {
  drawerContainer?: HTMLElement | null;
};

export function TransactionFlowDemo({ drawerContainer }: TransactionFlowDemoProps) {
  const timersRef = useRef<number[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const [step, setStep] = useState<DemoStep>(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [entryTimeMs, setEntryTimeMs] = useState<number | null>(null);
  const [dashboardTransactions, setDashboardTransactions] = useState<TransactionRecord[]>(() =>
    createSeedTransactions(new Date()),
  );

  const form = useTransactionForm({
    initialValues: {
      type: TYPE_OPTIONS[0],
      currency: 'USD',
      account: DEMO_ACCOUNTS[0],
      forValue: 'Me',
    },
  });

  const { type, category, amount, currency, account, forValue, dateObject, note } = form.useStore(
    (state) => state.values,
  );

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
  }, []);

  const resetDemo = useCallback(() => {
    clearTimers();
    setStep(0);
    setReceiptData(null);
    setIsSaving(false);
    setIsSaved(false);
    setEntryTimeMs(null);
    startedAtRef.current = null;

    form.setFieldValue('type', TYPE_OPTIONS[0]);
    form.setFieldValue('category', '');
    form.setFieldValue('amount', '');
    form.setFieldValue('note', '');
    form.setFieldValue('forValue', 'Me');
    form.setFieldValue('dateObject', new Date());
  }, [clearTimers, form]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (!category) {
      return;
    }
    if (startedAtRef.current !== null) {
      return;
    }
    startedAtRef.current = window.performance.now();
  }, [category]);

  const scheduleAutoReset = useCallback(() => {
    const resetTimer = window.setTimeout(() => {
      resetDemo();
    }, AUTO_RESET_DELAY_MS);
    timersRef.current.push(resetTimer);
  }, [resetDemo]);

  const handleSubmit = useCallback(() => {
    if (isSaving) {
      return;
    }

    const resolvedType: TransactionType = type ?? TYPE_OPTIONS[0];
    const resolvedCategory = category?.trim() ?? '';
    const resolvedAccount = account?.trim() ?? '';
    const resolvedAmount = amount?.trim() ?? '';
    const resolvedNote = note?.trim() ?? '';

    if (!resolvedCategory) {
      toast('Select a category');
      setStep(0);
      return;
    }

    const parsedAmount = Number.parseFloat(resolvedAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast('Enter a valid amount');
      return;
    }

    if (!resolvedAccount) {
      toast('Select an account');
      return;
    }

    const trimmedFor = (forValue ?? '').trim();
    if (resolvedType === 'transfer') {
      if (DEMO_ACCOUNTS.length < 2) {
        toast('Add another account to log transfers');
        return;
      }
      if (!trimmedFor) {
        toast('Select a destination account');
        return;
      }
      if (trimmedFor === resolvedAccount) {
        toast('Pick two different accounts');
        return;
      }
    }
    const resolvedFor = resolvedType === 'transfer' ? trimmedFor : trimmedFor || 'Me';

    if (startedAtRef.current !== null) {
      setEntryTimeMs(window.performance.now() - startedAtRef.current);
    }

    setDashboardTransactions((prev) => {
      const now = new Date();
      const createdAt = formatLocalIso(now);
      const date = formatLocalIso(dateObject);
      const next: TransactionRecord = {
        id: `demo-tx-${now.getTime()}`,
        status: 'synced',
        createdAt,
        updatedAt: createdAt,
        type: resolvedType,
        category: resolvedCategory,
        amount: parsedAmount,
        currency,
        account: resolvedAccount,
        for: resolvedFor,
        date,
        note: resolvedNote || undefined,
      };
      return [next, ...prev].slice(0, 30);
    });

    const snapshot: ReceiptData = {
      type: resolvedType,
      category: resolvedCategory,
      amount: resolvedAmount,
      currency,
      account: resolvedAccount,
      forValue: resolvedFor,
      dateObject,
      note: resolvedNote,
    };

    clearTimers();
    setReceiptData(snapshot);
    setStep(2);
    setIsSaving(true);
    setIsSaved(false);

    const saveTimer = window.setTimeout(() => {
      setIsSaving(false);
      setIsSaved(true);
      scheduleAutoReset();
    }, SAVE_DELAY_MS);

    timersRef.current.push(saveTimer);
  }, [
    account,
    amount,
    category,
    clearTimers,
    currency,
    dateObject,
    forValue,
    isSaving,
    note,
    scheduleAutoReset,
    type,
  ]);

  const receiptSnapshot: ReceiptData = useMemo(
    () =>
      receiptData ?? {
        type: type ?? TYPE_OPTIONS[0],
        category: category ?? '',
        amount,
        currency,
        account: account ?? '',
        forValue,
        dateObject,
        note,
      },
    [account, amount, category, currency, dateObject, forValue, note, receiptData, type],
  );

  const steps = useMemo(
    () => [
      {
        key: 'demo-step-category',
        label: 'Type & category',
        className: 'h-full min-h-0',
        content: (
          <StepCategory
            form={form}
            categoryGroups={DEFAULT_CATEGORIES}
            drawerContainer={drawerContainer}
            onConfirm={() => setStep(1)}
          />
        ),
      },
      {
        key: 'demo-step-amount',
        label: 'Amount',
        className: 'space-y-5 h-full',
        content: (
          <StepAmount
            form={form}
            accounts={DEMO_ACCOUNTS}
            onBack={() => setStep(0)}
            onSubmit={handleSubmit}
            submitLabel="Submit"
          />
        ),
      },
      {
        key: 'demo-step-receipt',
        label: 'Receipt',
        className: 'space-y-6 h-full',
        content: (
          <StepReceipt
            {...receiptSnapshot}
            isPending={isSaving}
            isSuccess={isSaved}
            isError={false}
            onDone={resetDemo}
            onUndo={() => {
              clearTimers();
              setStep(1);
              setIsSaving(false);
              setIsSaved(false);
              toast('Undo is disabled in the landing demo');
            }}
          />
        ),
      },
    ],
    [clearTimers, drawerContainer, form, handleSubmit, isSaved, isSaving, receiptSnapshot, resetDemo],
  );

  const activeStep = steps[step] ?? steps[0];

  return (
    <div
      data-testid="transaction-flow-demo"
      className="relative h-full w-full font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground [@media(max-height:650px)]:scale-[0.84] [@media(max-height:650px)]:origin-top"
    >
      {entryTimeMs !== null && isSaved ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20">
          <span className="rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground backdrop-blur">
            {formatElapsed(entryTimeMs)}
          </span>
        </div>
      ) : null}

      {step === 0 ? (
        <div className="absolute inset-0 grid h-full grid-rows-[1fr_3fr] gap-3">
          <div className="min-h-0">
            <TopDashboard transactionsOverride={dashboardTransactions} />
          </div>
          <div className="min-h-0">
            <StepCard
              animationKey={activeStep.key}
              className={activeStep.className}
              containerClassName="h-full"
            >
              {activeStep.content}
            </StepCard>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <StepCard
            animationKey={activeStep.key}
            className={activeStep.className}
            containerClassName="h-full"
          >
            {activeStep.content}
          </StepCard>
        </div>
      )}
    </div>
  );
}
