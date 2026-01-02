"use client";

import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { format } from "date-fns";
import {
  useAuthStorage,
  useConnectivity,
  useOnboarding,
  useTransactions,
} from "../providers";
import { OnboardingFlow } from "../OnboardingFlow";
import { ServiceWorker } from "../ServiceWorker";
import { Toast } from "../Toast";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../lib/currencies";
import type { TransactionType } from "../../lib/types";
import { AccountCategoryPanel } from "./AccountCategoryPanel";
import { StepCard } from "./StepCard";
import { StepAmount } from "./StepAmount";
import { StepCategory } from "./StepCategory";
import {
  StepReceipt,
  type ReceiptData,
  type ReceiptStatus,
} from "./StepReceipt";
import { FOR_OPTIONS, TYPE_OPTIONS } from "./constants";

type ToastAction = { label: string; onClick: () => void };

type FlowState = {
  step: number;
  type: TransactionType | null;
  category: string | null;
  amount: string;
  currency: string;
  account: string | null;
  forValue: string;
  dateObject: Date;
  note: string;
  receipt: {
    status: ReceiptStatus;
    message: string;
    data: ReceiptData | null;
  };
  toast: {
    open: boolean;
    message: string;
    actionLabel?: string;
    action?: () => void;
  };
};

type FlowAction =
  | { type: "SELECT_TYPE"; value: TransactionType }
  | { type: "SELECT_CATEGORY"; value: string }
  | { type: "SET_STEP"; value: number }
  | { type: "SET_AMOUNT"; value: string }
  | { type: "SET_CURRENCY"; value: string }
  | { type: "SET_ACCOUNT"; value: string | null }
  | { type: "SET_FOR"; value: string }
  | { type: "SET_DATE"; value: Date }
  | { type: "SET_NOTE"; value: string }
  | { type: "BEGIN_RECEIPT"; data: ReceiptData }
  | { type: "SET_RECEIPT_STATUS"; status: ReceiptStatus; message?: string }
  | { type: "CLEAR_RECEIPT" }
  | { type: "RESET_FLOW" }
  | { type: "OPEN_TOAST"; message: string; action?: ToastAction }
  | { type: "CLOSE_TOAST" };

const CURRENCY_STORAGE_KEY = "sheetlog:last-currency";

function resolveStoredCurrency() {
  if (typeof window === "undefined") {
    return DEFAULT_CURRENCY;
  }
  const storedCurrency = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (
    storedCurrency &&
    CURRENCIES.includes(storedCurrency as (typeof CURRENCIES)[number])
  ) {
    return storedCurrency;
  }
  return DEFAULT_CURRENCY;
}

const createInitialState = (_?: unknown): FlowState => ({
  step: 0,
  type: TYPE_OPTIONS[0],
  category: null,
  amount: "",
  currency: resolveStoredCurrency(),
  account: null,
  forValue: "Me",
  dateObject: new Date(),
  note: "",
  receipt: {
    status: "idle",
    message: "",
    data: null,
  },
  toast: {
    open: false,
    message: "",
  },
});

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SELECT_TYPE":
      return {
        ...state,
        type: action.value,
        category: state.type === action.value ? state.category : null,
      };
    case "SELECT_CATEGORY":
      return { ...state, category: action.value };
    case "SET_STEP":
      return { ...state, step: action.value };
    case "SET_AMOUNT":
      return { ...state, amount: action.value };
    case "SET_CURRENCY":
      return { ...state, currency: action.value };
    case "SET_ACCOUNT":
      return { ...state, account: action.value };
    case "SET_FOR":
      return { ...state, forValue: action.value };
    case "SET_DATE":
      return { ...state, dateObject: action.value };
    case "SET_NOTE":
      return { ...state, note: action.value };
    case "BEGIN_RECEIPT":
      return {
        ...state,
        receipt: {
          status: "loading",
          message: "",
          data: action.data,
        },
      };
    case "SET_RECEIPT_STATUS":
      return {
        ...state,
        receipt: {
          ...state.receipt,
          status: action.status,
          message: action.message ?? "",
        },
      };
    case "CLEAR_RECEIPT":
      return {
        ...state,
        receipt: {
          status: "idle",
          message: "",
          data: null,
        },
      };
    case "RESET_FLOW":
      return {
        ...state,
        step: 0,
        type: TYPE_OPTIONS[0],
        category: null,
        amount: "",
        forValue: "Me",
        note: "",
        dateObject: new Date(),
        receipt: {
          status: "idle",
          message: "",
          data: null,
        },
      };
    case "OPEN_TOAST":
      return {
        ...state,
        toast: {
          open: true,
          message: action.message,
          actionLabel: action.action?.label,
          action: action.action?.onClick,
        },
      };
    case "CLOSE_TOAST":
      return {
        ...state,
        toast: {
          ...state.toast,
          open: false,
        },
      };
    default:
      return state;
  }
}

type StepDefinition = {
  key: string;
  label: string;
  className: string;
  content: React.ReactNode;
};

export function TransactionFlow() {
  const { accessToken, sheetId } = useAuthStorage();
  const { recentCategories, addTransaction, undoLast } = useTransactions();
  const { onboarding, refreshOnboarding } = useOnboarding();
  const { isOnline } = useConnectivity();
  const [isResyncing, setIsResyncing] = useState(false);

  const [state, dispatch] = useReducer(
    flowReducer,
    undefined,
    createInitialState
  );
  const {
    step,
    type,
    category,
    amount,
    currency,
    account,
    forValue,
    dateObject,
    note,
    receipt,
    toast,
  } = state;
  const receiptTimeoutRef = useRef<number | null>(null);

  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;
  const hasCategories =
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0;
  const accountsReady =
    onboarding.accountsConfirmed && onboarding.accounts.length > 0;
  const categoriesReady = onboarding.categoriesConfirmed && hasCategories;
  const isOnboarded = Boolean(
    accessToken && sheetId && accountsReady && categoriesReady
  );

  const categoryGroups = useMemo(() => {
    return TYPE_OPTIONS.reduce((acc, typeOption) => {
      const typeCategories = categories[typeOption] ?? [];
      const recent = recentCategories[typeOption] ?? [];
      const combined = [...recent, ...typeCategories];
      const unique = combined.filter(
        (item, index) => combined.indexOf(item) === index
      );
      const frequent = unique.slice(0, 4);
      const others = typeCategories.filter((item) => !frequent.includes(item));
      acc[typeOption] = { frequent, others };
      return acc;
    }, {} as Record<TransactionType, { frequent: string[]; others: string[] }>);
  }, [categories, recentCategories]);

  const formattedAmount = amount ? Number.parseFloat(amount) : 0;

  useEffect(() => {
    return () => {
      if (receiptTimeoutRef.current) {
        window.clearTimeout(receiptTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!account && onboarding.accounts.length === 1) {
      dispatch({ type: "SET_ACCOUNT", value: onboarding.accounts[0] });
    }
  }, [account, onboarding.accounts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }, [currency]);

  useEffect(() => {
    if (type === "transfer" && forValue) {
      const isAccountValue = onboarding.accounts.includes(forValue);
      if (!isAccountValue) {
        dispatch({ type: "SET_FOR", value: "" });
      }
    }
  }, [type, forValue, onboarding.accounts]);

  useEffect(() => {
    if (type === "transfer" && account && forValue === account) {
      dispatch({ type: "SET_FOR", value: "" });
    }
  }, [type, account, forValue]);

  useEffect(() => {
    if (type === "transfer") {
      return;
    }
    if (!forValue || !FOR_OPTIONS.includes(forValue)) {
      dispatch({ type: "SET_FOR", value: "Me" });
    }
  }, [type, forValue]);

  function handleToast(message: string, action?: ToastAction) {
    dispatch({ type: "OPEN_TOAST", message, action });
    window.setTimeout(() => dispatch({ type: "CLOSE_TOAST" }), 4000);
  }

  function scheduleReceiptTransition(callback: () => void, delay: number) {
    if (receiptTimeoutRef.current) {
      window.clearTimeout(receiptTimeoutRef.current);
    }
    receiptTimeoutRef.current = window.setTimeout(callback, delay);
  }

  async function handleResync() {
    if (isResyncing) {
      return;
    }
    if (!isOnline) {
      handleToast("Go online to sync accounts and categories");
      return;
    }
    setIsResyncing(true);
    try {
      const changed = await refreshOnboarding();
      handleToast(
        changed
          ? "Accounts and categories refreshed"
          : "Accounts and categories are up to date"
      );
    } catch (error) {
      handleToast(
        error instanceof Error
          ? error.message
          : "Failed to sync accounts and categories"
      );
    } finally {
      setIsResyncing(false);
    }
  }

  function resetFlow() {
    dispatch({ type: "RESET_FLOW" });
  }

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  async function handleSubmit() {
    if (!type || !category || !amount) {
      handleToast("Complete all fields");
      return;
    }
    if (Number.isNaN(formattedAmount) || formattedAmount <= 0) {
      handleToast("Enter a valid amount");
      return;
    }
    if (!account) {
      handleToast("Select an account");
      return;
    }
    const trimmedFor = forValue.trim();
    const trimmedNote = note.trim();
    if (type === "transfer") {
      if (onboarding.accounts.length < 2) {
        handleToast("Add another account to log transfers");
        return;
      }
      if (!trimmedFor) {
        handleToast("Select a destination account");
        return;
      }
      if (trimmedFor === account) {
        handleToast("Pick two different accounts");
        return;
      }
    }
    const resolvedFor = trimmedFor || forValue;
    const receiptData: ReceiptData = {
      type,
      category,
      amount,
      currency,
      account,
      forValue: resolvedFor,
      dateObject,
      note: trimmedNote,
    };
    dispatch({ type: "BEGIN_RECEIPT", data: receiptData });
    dispatch({ type: "SET_STEP", value: 2 });
    try {
      await addTransaction({
        type,
        amount: formattedAmount,
        currency,
        account,
        for: resolvedFor,
        category,
        date: format(dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
        note: trimmedNote || undefined,
      });
      dispatch({ type: "SET_RECEIPT_STATUS", status: "success" });
      handleToast("Saved", { label: "Undo", onClick: () => void handleUndo() });
      scheduleReceiptTransition(() => resetFlow(), 1400);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save transaction";
      dispatch({ type: "SET_RECEIPT_STATUS", status: "error", message });
      handleToast(message);
      scheduleReceiptTransition(() => {
        dispatch({ type: "SET_STEP", value: 0 });
        dispatch({ type: "CLEAR_RECEIPT" });
      }, 2000);
    }
  }

  const receiptSnapshot: ReceiptData = receipt.data ?? {
    type: type ?? TYPE_OPTIONS[0],
    category: category ?? "",
    amount,
    currency,
    account: account ?? "",
    forValue,
    dateObject,
    note,
  };

  const steps: StepDefinition[] = [
    {
      key: "step-type-category",
      label: "Type & category",
      className: "h-full min-h-0",
      content: (
        <StepCategory
          type={type ?? TYPE_OPTIONS[0]}
          categoryGroups={categoryGroups}
          selected={category}
          dateObject={dateObject}
          onSelectType={(value) => dispatch({ type: "SELECT_TYPE", value })}
          onSelectCategory={(value) =>
            dispatch({ type: "SELECT_CATEGORY", value })
          }
          onDateChange={(value) => dispatch({ type: "SET_DATE", value })}
          onConfirm={() => dispatch({ type: "SET_STEP", value: 1 })}
        />
      ),
    },
    {
      key: "step-amount",
      label: "Amount",
      className: "space-y-5",
      content: (
        <StepAmount
          type={type}
          amount={amount}
          currency={currency}
          account={account}
          forValue={forValue}
          note={note}
          accounts={onboarding.accounts}
          onBack={() => dispatch({ type: "SET_STEP", value: 0 })}
          onAmountChange={(value) => dispatch({ type: "SET_AMOUNT", value })}
          onCurrencyChange={(value) =>
            dispatch({ type: "SET_CURRENCY", value })
          }
          onAccountSelect={(value) => dispatch({ type: "SET_ACCOUNT", value })}
          onForChange={(value) => dispatch({ type: "SET_FOR", value })}
          onNoteChange={(value) => dispatch({ type: "SET_NOTE", value })}
          onSubmit={handleSubmit}
        />
      ),
    },
    {
      key: "step-receipt",
      label: "Receipt",
      className: "space-y-6",
      content: (
        <StepReceipt
          {...receiptSnapshot}
          status={receipt.status}
          message={receipt.message}
        />
      ),
    },
  ];

  const activeStep = steps[step] ?? steps[0];
  const isCategoryStep = activeStep.key === "step-type-category";

  return (
    <main className="h-full from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6">
      <ServiceWorker />
      {true || isOnboarded ? (
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
            <StepCard
              animationKey={activeStep.key}
              className={activeStep.className}
            >
              {activeStep.content}
            </StepCard>
          )}
        </div>
      ) : (
        <OnboardingFlow onToast={handleToast} />
      )}

      <Toast
        open={toast.open}
        message={toast.message}
        actionLabel={toast.actionLabel}
        onAction={toast.action}
        onClose={() => dispatch({ type: "CLOSE_TOAST" })}
      />
    </main>
  );
}
