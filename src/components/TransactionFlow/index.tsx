import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_CATEGORIES } from '../../lib/categories';
import { STORAGE_KEYS } from '../../lib/constants';
import type { TransactionType } from '../../lib/types';
import { OnboardingFlow } from '../OnboardingFlow';
import { useAuth, useConnectivity, useOnboarding, useTransactions } from '../providers';
import { ServiceWorker } from '../ServiceWorker';
import { AccountCategoryPanel } from './AccountCategoryPanel';
import { FOR_OPTIONS, TYPE_OPTIONS } from './constants';
import { StepAmount } from './StepAmount';
import { StepCard } from './StepCard';
import { StepCategory } from './StepCategory';
import { type ReceiptData, StepReceipt } from './StepReceipt';
import { type TransactionFormValues, transactionSchema } from './transactionSchema';
import { useAddTransactionMutation } from './useAddTransactionMutation';
import { useTransactionForm } from './useTransactionForm';

type ToastAction = { label: string; onClick: () => void };
type StepDefinition = {
  key: string;
  label: string;
  className: string;
  content: React.ReactNode;
};

export function TransactionFlow() {
  const { accessToken, sheetId } = useAuth();
  const { undoLast, lastSyncError, lastSyncErrorAt } = useTransactions();
  const { onboarding, refreshOnboarding } = useOnboarding();
  const { isOnline } = useConnectivity();
  const [isResyncing, setIsResyncing] = useState(false);
  const [step, setStep] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const mutation = useAddTransactionMutation();
  const form = useTransactionForm({
    onSubmit: async (values) => {
      await handleSubmit(values);
    },
  });
  const { type, category, amount, currency, account, forValue, dateObject, note } = form.useStore(
    (state) => state.values,
  );
  const receiptTimeoutRef = useRef<number | null>(null);
  const lastSyncErrorRef = useRef<string | null>(null);

  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;
  const hasCategories =
    categories.expense.length > 0 && categories.income.length > 0 && categories.transfer.length > 0;
  const accountsReady = onboarding.accountsConfirmed && onboarding.accounts.length > 0;
  const categoriesReady = onboarding.categoriesConfirmed && hasCategories;
  const isOnboarded = Boolean(accessToken && sheetId && accountsReady && categoriesReady);

  const categoryGroups = useMemo(() => {
    return TYPE_OPTIONS.reduce(
      (acc, typeOption) => {
        const typeCategories = categories[typeOption] ?? [];
        acc[typeOption] = typeCategories;
        return acc;
      },
      {} as Record<TransactionType, string[]>,
    );
  }, [categories]);

  useEffect(() => {
    return () => {
      if (receiptTimeoutRef.current) {
        window.clearTimeout(receiptTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (account) {
      window.localStorage.setItem(STORAGE_KEYS.LAST_ACCOUNT, account);
      return;
    }
    // Try to restore last account if none selected
    const lastAccount = window.localStorage.getItem(STORAGE_KEYS.LAST_ACCOUNT);
    if (lastAccount && onboarding.accounts.includes(lastAccount)) {
      form.setFieldValue('account', lastAccount);
      return;
    }
    // Default to first account if only one exists
    if (onboarding.accounts.length === 1) {
      form.setFieldValue('account', onboarding.accounts[0]);
    }
  }, [account, form, onboarding.accounts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    // Always update global fallback
    window.localStorage.setItem(STORAGE_KEYS.LAST_CURRENCY, currency);

    // Update per-account currency
    if (account) {
      window.localStorage.setItem(`${STORAGE_KEYS.LAST_CURRENCY}_${account}`, currency);
    }
  }, [currency, account]);

  // Restore currency when account changes
  useEffect(() => {
    if (typeof window === 'undefined' || !account) {
      return;
    }
    const lastCurrencyForAccount = window.localStorage.getItem(
      `${STORAGE_KEYS.LAST_CURRENCY}_${account}`,
    );
    if (lastCurrencyForAccount) {
      form.setFieldValue('currency', lastCurrencyForAccount);
    }
  }, [account, form]);

  useEffect(() => {
    if (type === 'transfer' && forValue) {
      const isAccountValue = onboarding.accounts.includes(forValue);
      if (!isAccountValue) {
        form.setFieldValue('forValue', '');
      }
    }
  }, [type, forValue, form, onboarding.accounts]);

  useEffect(() => {
    if (type === 'transfer' && account && forValue === account) {
      form.setFieldValue('forValue', '');
    }
  }, [type, account, forValue, form]);

  useEffect(() => {
    if (type === 'transfer') {
      return;
    }
    if (!forValue || !FOR_OPTIONS.includes(forValue)) {
      form.setFieldValue('forValue', 'Me');
    }
  }, [type, forValue, form]);

  const handleToast = useCallback((message: string, action?: ToastAction) => {
    if (action) {
      toast(message, {
        action: {
          label: action.label,
          onClick: action.onClick,
        },
      });
      return;
    }
    toast(message);
  }, []);

  function handleFormSubmit() {
    const result = transactionSchema.safeParse({
      type,
      category,
      amount,
      currency,
      account,
      forValue,
      dateObject,
      note,
    });
    if (!result.success) {
      handleToast(result.error.issues[0]?.message ?? 'Complete all fields');
      return;
    }
    void form.handleSubmit();
  }

  useEffect(() => {
    if (!lastSyncError || !lastSyncErrorAt) {
      return;
    }
    if (lastSyncErrorAt === lastSyncErrorRef.current) {
      return;
    }
    lastSyncErrorRef.current = lastSyncErrorAt;
    handleToast(lastSyncError);
  }, [handleToast, lastSyncError, lastSyncErrorAt]);

  function scheduleReceiptTransition(callback: () => void, delay: number) {
    if (receiptTimeoutRef.current) {
      window.clearTimeout(receiptTimeoutRef.current);
    }
    receiptTimeoutRef.current = window.setTimeout(callback, delay);
  }

  function clearReceiptTransition() {
    if (receiptTimeoutRef.current) {
      window.clearTimeout(receiptTimeoutRef.current);
      receiptTimeoutRef.current = null;
    }
  }

  async function handleResync() {
    if (isResyncing) {
      return;
    }
    if (!isOnline) {
      handleToast('Go online to sync accounts and categories');
      return;
    }
    setIsResyncing(true);
    try {
      const changed = await refreshOnboarding();
      handleToast(
        changed ? 'Accounts and categories refreshed' : 'Accounts and categories are up to date',
      );
    } catch (error) {
      handleToast(
        error instanceof Error ? error.message : 'Failed to sync accounts and categories',
      );
    } finally {
      setIsResyncing(false);
    }
  }

  function resetFlow() {
    setStep(0);
    setReceiptData(null);
    mutation.reset();
    form.setFieldValue('type', TYPE_OPTIONS[0]);
    form.setFieldValue('category', '');
    form.setFieldValue('amount', '');
    form.setFieldValue('forValue', 'Me');
    form.setFieldValue('note', '');
    form.setFieldValue('dateObject', new Date());
  }

  function clearReceiptStep() {
    setStep(0);
    setReceiptData(null);
    mutation.reset();
  }

  function handleReceiptDone() {
    clearReceiptTransition();
    resetFlow();
  }

  async function handleReceiptUndo() {
    clearReceiptTransition();
    await handleUndo();
    resetFlow();
  }

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  async function handleSubmit(values: TransactionFormValues) {
    if (mutation.isPending) {
      return;
    }
    if (!values.type || !values.category || !values.amount) {
      handleToast('Complete all fields');
      return;
    }
    const parsedAmount = Number.parseFloat(values.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      handleToast('Enter a valid amount');
      return;
    }
    if (!values.account) {
      handleToast('Select an account');
      return;
    }
    const trimmedFor = values.forValue.trim();
    const trimmedNote = values.note.trim();
    if (values.type === 'transfer') {
      if (onboarding.accounts.length < 2) {
        handleToast('Add another account to log transfers');
        return;
      }
      if (!trimmedFor) {
        handleToast('Select a destination account');
        return;
      }
      if (trimmedFor === values.account) {
        handleToast('Pick two different accounts');
        return;
      }
    }
    const resolvedFor = trimmedFor || values.forValue;
    const nextReceipt: ReceiptData = {
      type: values.type,
      category: values.category,
      amount: values.amount,
      currency: values.currency,
      account: values.account,
      forValue: resolvedFor,
      dateObject: values.dateObject,
      note: trimmedNote,
    };
    setReceiptData(nextReceipt);
    setStep(2);
    try {
      await mutation.mutateAsync({
        ...values,
        forValue: resolvedFor,
        note: trimmedNote,
      });
      scheduleReceiptTransition(() => resetFlow(), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save transaction';
      handleToast(message);
      scheduleReceiptTransition(() => {
        clearReceiptStep();
      }, 2000);
    }
  }

  const receiptSnapshot: ReceiptData = receiptData ?? {
    type: type ?? TYPE_OPTIONS[0],
    category: category ?? '',
    amount,
    currency,
    account: account ?? '',
    forValue,
    dateObject,
    note,
  };

  const steps: StepDefinition[] = [
    {
      key: 'step-type-category',
      label: 'Type & category',
      className: 'h-full min-h-0',
      content: (
        <StepCategory form={form} categoryGroups={categoryGroups} onConfirm={() => setStep(1)} />
      ),
    },
    {
      key: 'step-amount',
      label: 'Amount',
      className: 'space-y-5',
      content: (
        <StepAmount
          form={form}
          accounts={onboarding.accounts}
          onBack={() => setStep(0)}
          onSubmit={handleFormSubmit}
          isSubmitting={mutation.isPending}
        />
      ),
    },
    {
      key: 'step-receipt',
      label: 'Receipt',
      className: 'space-y-6',
      content: (
        <StepReceipt
          {...receiptSnapshot}
          isPending={mutation.isPending}
          isSuccess={mutation.isSuccess}
          isError={mutation.isError}
          errorMessage={
            mutation.error instanceof Error
              ? mutation.error.message
              : mutation.isError
                ? 'Failed to save transaction'
                : undefined
          }
          onDone={handleReceiptDone}
          onUndo={handleReceiptUndo}
        />
      ),
    },
  ];

  const activeStep = steps[step] ?? steps[0];
  const isCategoryStep = activeStep.key === 'step-type-category';

  return (
    <main className="h-full from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6">
      <ServiceWorker />
      {isOnboarded ? (
        <div className="mx-auto flex h-full w-full max-w-md flex-col gap-6">
          {isCategoryStep ? (
            <div className="grid h-full grid-rows-[1fr_3fr] gap-4">
              <div className="min-h-0">
                <AccountCategoryPanel
                  onToast={handleToast}
                  onResync={() => void handleResync()}
                  isResyncing={isResyncing}
                />
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
            <StepCard animationKey={activeStep.key} className={activeStep.className}>
              {activeStep.content}
            </StepCard>
          )}
        </div>
      ) : (
        <OnboardingFlow onToast={handleToast} />
      )}
    </main>
  );
}
