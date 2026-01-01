"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import {
  useAuthStorage,
  useConnectivity,
  useOnboarding,
  useTransactions,
} from "./providers";
import { StatusDot } from "./StatusDot";
import { Keypad } from "./Keypad";
import { TagChips } from "./TagChips";
import { CategoryGrid } from "./CategoryGrid";
import { Toast } from "./Toast";
import { ServiceWorker } from "./ServiceWorker";
import { CurrencyPicker } from "./CurrencyPicker";
import { DateScroller } from "./DateScroller";
import { TimePicker } from "./TimePicker";
import { OnboardingFlow } from "./OnboardingFlow";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import type { TransactionType } from "../lib/types";

const TAGS = [
  "Trip",
  "Business",
  "Family",
  "Groceries",
  "Home",
  "Subscription",
];

const TYPE_OPTIONS: TransactionType[] = [
  "expense",
  "income",
  "transfer",
];

type ToastAction = { label: string; onClick: () => void };

type FlowState = {
  step: number;
  type: TransactionType | null;
  category: string | null;
  tags: string[];
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
  | { type: "TOGGLE_TAG"; value: string }
  | { type: "SET_AMOUNT"; value: string }
  | { type: "SET_CURRENCY"; value: string }
  | { type: "SET_ACCOUNT"; value: string | null }
  | { type: "SET_FOR"; value: string }
  | { type: "SET_DATE"; value: Date }
  | { type: "SET_NOTE"; value: string }
  | { type: "RESET_FLOW" }
  | { type: "OPEN_TOAST"; message: string; action?: ToastAction }
  | { type: "CLOSE_TOAST" };

const createInitialState = (_?: unknown): FlowState => ({
  step: 0,
  type: null,
  category: null,
  tags: [],
  amount: "",
  currency: "THB",
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
      return { ...state, type: action.value, step: 1 };
    case "SELECT_CATEGORY":
      return { ...state, category: action.value, step: 2 };
    case "SET_STEP":
      return { ...state, step: action.value };
    case "TOGGLE_TAG":
      return state.tags.includes(action.value)
        ? { ...state, tags: state.tags.filter((tag) => tag !== action.value) }
        : { ...state, tags: [...state.tags, action.value] };
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
        type: null,
        category: null,
        tags: [],
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

type FlowHeaderProps = {
  isOnline: boolean;
  queueCount: number;
  sheetId: string | null;
  onSync: () => void;
  onRefreshSheet: () => void;
};

function FlowHeader({
  isOnline,
  queueCount,
  sheetId,
  onSync,
  onRefreshSheet,
}: FlowHeaderProps) {
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            SheetLog
          </p>
          <h1 className="text-2xl font-semibold">Fast log to your sheet</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <StatusDot online={isOnline} />
          <span className="text-slate-300">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
        <span>Queue: {queueCount} pending</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-100"
            onClick={onSync}
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
          {sheetId ? (
            <span className="text-emerald-300">Sheet ready</span>
          ) : (
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-100"
              onClick={onRefreshSheet}
            >
              Setup Sheet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

type StepCardProps = {
  stepIndex: number;
  totalSteps: number;
  label: string;
  animationKey: string;
  className: string;
  children: React.ReactNode;
};

function StepCard({
  stepIndex,
  totalSteps,
  label,
  animationKey,
  className,
  children,
}: StepCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
        <span>
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <span>{label}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={animationKey}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className={className}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

type StepTypeProps = {
  onSelect: (value: TransactionType) => void;
};

function StepType({ onSelect }: StepTypeProps) {
  return (
    <>
      <h2 className="text-lg font-semibold">What are you logging?</h2>
      <div className="grid grid-cols-1 gap-3">
        {TYPE_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left text-lg font-semibold capitalize transition hover:border-emerald-400"
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  );
}

type StepCategoryProps = {
  frequent: string[];
  others: string[];
  selected: string | null;
  tags: string[];
  onBack: () => void;
  onSelectCategory: (value: string) => void;
  onToggleTag: (value: string) => void;
};

function StepCategory({
  frequent,
  others,
  selected,
  tags,
  onBack,
  onSelectCategory,
  onToggleTag,
}: StepCategoryProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Choose a category</h2>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={onBack}
        >
          Back
        </button>
      </div>
      <CategoryGrid
        frequent={frequent}
        others={others}
        selected={selected}
        onSelect={onSelectCategory}
      />
      <div className="pt-2">
        <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">
          Tags
        </p>
        <TagChips tags={TAGS} selected={tags} onToggle={onToggleTag} />
      </div>
    </>
  );
}

type AccountButtonsProps = {
  accounts: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  isDisabled?: (value: string) => boolean;
};

function AccountButtons({
  accounts,
  selected,
  onSelect,
  isDisabled,
}: AccountButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((item) => {
        const isActive = selected === item;
        const disabled = isDisabled?.(item) ?? false;
        return (
          <button
            key={item}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              isActive
                ? "bg-emerald-400 text-slate-950"
                : "bg-white/10 text-slate-200"
            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
            onClick={() => onSelect(item)}
            aria-pressed={isActive}
            disabled={disabled}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

type StepAmountProps = {
  type: TransactionType | null;
  amount: string;
  currency: string;
  account: string | null;
  forValue: string;
  dateObject: Date;
  note: string;
  accounts: string[];
  onBack: () => void;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onAccountSelect: (value: string) => void;
  onForChange: (value: string) => void;
  onDateChange: (value: Date) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

function StepAmount({
  type,
  amount,
  currency,
  account,
  forValue,
  dateObject,
  note,
  accounts,
  onBack,
  onAmountChange,
  onCurrencyChange,
  onAccountSelect,
  onForChange,
  onDateChange,
  onNoteChange,
  onSubmit,
}: StepAmountProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Amount & details</h2>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-2xl font-semibold">
          <span>{amount ? amount : "0"}</span>
          <CurrencyPicker value={currency} onChange={onCurrencyChange} />
        </div>
      </div>

      <Keypad value={amount} onChange={onAmountChange} />

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          {type === "transfer" ? "From account" : "Account"}
        </p>
        <AccountButtons
          accounts={accounts}
          selected={account}
          onSelect={onAccountSelect}
        />
      </div>

      {type === "transfer" ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            To account
          </p>
          <AccountButtons
            accounts={accounts}
            selected={forValue}
            onSelect={onForChange}
            isDisabled={(item) => item === account}
          />
          {accounts.length < 2 ? (
            <p className="text-xs text-slate-400">
              Add another account in onboarding to log transfers.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <label
            htmlFor="forValue"
            className="text-xs uppercase tracking-widest text-slate-400"
          >
            For
          </label>
          <input
            type="text"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
            placeholder="Optional"
            value={forValue}
            onChange={(event) => onForChange(event.target.value)}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          Date & Time
        </p>
        <DateScroller value={dateObject} onChange={onDateChange} />
        <TimePicker value={dateObject} onChange={onDateChange} />
      </div>

      <div>
        <label
          htmlFor="note"
          className="text-xs uppercase tracking-widest text-slate-400"
        >
          Note
        </label>
        <input
          type="text"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
          placeholder="Optional"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
        onClick={onSubmit}
      >
        <Check className="h-4 w-4" />
        Submit
      </button>
    </>
  );
}

export function TransactionFlow() {
  const { isOnline } = useConnectivity();
  const { accessToken, sheetId, refreshSheet } = useAuthStorage();
  const { queueCount, recentCategories, addTransaction, undoLast, syncNow } =
    useTransactions();
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
    tags,
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

  const typeCategories = type ? categories[type] ?? [] : [];
  const frequentCategories = useMemo(() => {
    if (!type) {
      return [];
    }
    const recent = recentCategories[type] ?? [];
    const combined = [...recent, ...typeCategories];
    const unique = combined.filter(
      (item, index) => combined.indexOf(item) === index
    );
    return unique.slice(0, 4);
  }, [type, typeCategories, recentCategories]);

  const otherCategories = useMemo(() => {
    if (!type) {
      return [];
    }
    return typeCategories.filter((item) => !frequentCategories.includes(item));
  }, [type, typeCategories, frequentCategories]);

  const formattedAmount = amount ? Number.parseFloat(amount) : 0;

  useEffect(() => {
    if (!account && onboarding.accounts.length === 1) {
      dispatch({ type: "SET_ACCOUNT", value: onboarding.accounts[0] });
    }
  }, [account, onboarding.accounts]);

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

  async function handleRefreshSheet() {
    try {
      await refreshSheet(onboarding.sheetFolderId);
      handleToast("Sheet ready");
    } catch (error) {
      handleToast(
        error instanceof Error ? error.message : "Failed to refresh sheet"
      );
    }
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
      tags,
      date: format(dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
      note: note.trim() || undefined,
    });
    handleToast("Saved", { label: "Undo", onClick: () => void handleUndo() });
    resetFlow();
  }

  function toggleTag(tag: string) {
    dispatch({ type: "TOGGLE_TAG", value: tag });
  }

  const steps: StepDefinition[] = [
    {
      key: "step-type",
      label: "Type",
      className: "space-y-4",
      content: (
        <StepType
          onSelect={(value) => dispatch({ type: "SELECT_TYPE", value })}
        />
      ),
    },
    {
      key: "step-category",
      label: "Category",
      className: "space-y-5",
      content: (
        <StepCategory
          frequent={frequentCategories}
          others={otherCategories}
          selected={category}
          tags={tags}
          onBack={() => dispatch({ type: "SET_STEP", value: 0 })}
          onSelectCategory={(value) =>
            dispatch({ type: "SELECT_CATEGORY", value })
          }
          onToggleTag={toggleTag}
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
          dateObject={dateObject}
          note={note}
          accounts={onboarding.accounts}
          onBack={() => dispatch({ type: "SET_STEP", value: 1 })}
          onAmountChange={(value) =>
            dispatch({ type: "SET_AMOUNT", value })
          }
          onCurrencyChange={(value) =>
            dispatch({ type: "SET_CURRENCY", value })
          }
          onAccountSelect={(value) =>
            dispatch({ type: "SET_ACCOUNT", value })
          }
          onForChange={(value) => dispatch({ type: "SET_FOR", value })}
          onDateChange={(value) => dispatch({ type: "SET_DATE", value })}
          onNoteChange={(value) => dispatch({ type: "SET_NOTE", value })}
          onSubmit={handleSubmit}
        />
      ),
    },
  ];

  const activeStep = steps[step] ?? steps[0];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-5 pb-20 pt-10">
      <ServiceWorker />
      {isOnboarded ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <FlowHeader
            isOnline={isOnline}
            queueCount={queueCount}
            sheetId={sheetId}
            onSync={syncNow}
            onRefreshSheet={handleRefreshSheet}
          />

          <StepCard
            stepIndex={step}
            totalSteps={steps.length}
            label={activeStep.label}
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
