"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { format } from "date-fns";
import { useAuthStorage, useOnboarding, useTransactions } from "../providers";
import { OnboardingFlow } from "../OnboardingFlow";
import { ServiceWorker } from "../ServiceWorker";
import { Toast } from "../Toast";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../lib/currencies";
import type { TransactionType } from "../../lib/types";
import { StepCard } from "./StepCard";
import { StepAmount } from "./StepAmount";
import { StepCategory } from "./StepCategory";
import { TYPE_OPTIONS } from "./constants";

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
  forValue: "",
  dateObject: new Date(),
  note: "",
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
    case "RESET_FLOW":
      return {
        ...state,
        step: 0,
        type: TYPE_OPTIONS[0],
        category: null,
        amount: "",
        forValue: "",
        note: "",
        dateObject: new Date(),
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
  const { onboarding } = useOnboarding();

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
    toast,
  } = state;

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

  function handleToast(message: string, action?: ToastAction) {
    dispatch({ type: "OPEN_TOAST", message, action });
    window.setTimeout(() => dispatch({ type: "CLOSE_TOAST" }), 4000);
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
    await addTransaction({
      type,
      amount: formattedAmount,
      currency,
      account,
      for: trimmedFor,
      category,
      date: format(dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
      note: note.trim() || undefined,
    });
    handleToast("Saved", { label: "Undo", onClick: () => void handleUndo() });
    resetFlow();
  }

  const steps: StepDefinition[] = [
    {
      key: "step-type-category",
      label: "Type & category",
      className: "space-y-6",
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
  ];

  const activeStep = steps[step] ?? steps[0];

  return (
    <main className="min-h-screen from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6">
      <ServiceWorker />
      {isOnboarded ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <StepCard
            animationKey={activeStep.key}
            className={activeStep.className}
          >
            {activeStep.content}
          </StepCard>
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
