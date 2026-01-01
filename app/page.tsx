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
} from "../components/providers";
import { StatusDot } from "../components/StatusDot";
import { Keypad } from "../components/Keypad";
import { TagChips } from "../components/TagChips";
import { CategoryGrid } from "../components/CategoryGrid";
import { Toast } from "../components/Toast";
import { ServiceWorker } from "../components/ServiceWorker";
import { CurrencyPicker } from "../components/CurrencyPicker";
import { DateScroller } from "../components/DateScroller";
import { TimePicker } from "../components/TimePicker";
import { OnboardingFlow } from "../components/OnboardingFlow";
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

export default function HomePage() {
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

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  function toggleTag(tag: string) {
    dispatch({ type: "TOGGLE_TAG", value: tag });
  }

  const steps = [
    {
      key: "step-type",
      label: "Type",
      className: "space-y-4",
      render: () => (
        <>
          <h2 className="text-lg font-semibold">What are you logging?</h2>
          <div className="grid grid-cols-1 gap-3">
            {(["expense", "income", "transfer"] as TransactionType[]).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left text-lg font-semibold capitalize transition hover:border-emerald-400"
                  onClick={() => dispatch({ type: "SELECT_TYPE", value: item })}
                >
                  {item}
                </button>
              )
            )}
          </div>
        </>
      ),
    },
    {
      key: "step-category",
      label: "Category",
      className: "space-y-5",
      render: () => (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Choose a category</h2>
            <button
              type="button"
              className="text-xs text-slate-400"
              onClick={() => dispatch({ type: "SET_STEP", value: 0 })}
            >
              Back
            </button>
          </div>
          <CategoryGrid
            frequent={frequentCategories}
            others={otherCategories}
            selected={category}
            onSelect={(value) => dispatch({ type: "SELECT_CATEGORY", value })}
          />
          <div className="pt-2">
            <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">
              Tags
            </p>
            <TagChips tags={TAGS} selected={tags} onToggle={toggleTag} />
          </div>
        </>
      ),
    },
    {
      key: "step-amount",
      label: "Amount",
      className: "space-y-5",
      render: () => (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Amount & details</h2>
            <button
              type="button"
              className="text-xs text-slate-400"
              onClick={() => dispatch({ type: "SET_STEP", value: 1 })}
            >
              Back
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-2xl font-semibold flex justify-between items-center">
              <span>{amount ? amount : "0"}</span>
              <CurrencyPicker
                value={currency}
                onChange={(value) => dispatch({ type: "SET_CURRENCY", value })}
              />
            </div>
          </div>

          <Keypad
            value={amount}
            onChange={(value) => dispatch({ type: "SET_AMOUNT", value })}
          />

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">
              {type === "transfer" ? "From account" : "Account"}
            </p>
            <div className="flex flex-wrap gap-2">
              {onboarding.accounts.map((item) => {
                const isActive = account === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      isActive
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-white/10 text-slate-200"
                    }`}
                    onClick={() =>
                      dispatch({ type: "SET_ACCOUNT", value: item })
                    }
                    aria-pressed={isActive}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "transfer" ? (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-slate-400">
                To account
              </p>
              <div className="flex flex-wrap gap-2">
                {onboarding.accounts.map((item) => {
                  const isActive = forValue === item;
                  const isDisabled = item === account;
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        isActive
                          ? "bg-emerald-400 text-slate-950"
                          : "bg-white/10 text-slate-200"
                      } ${isDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                      onClick={() => dispatch({ type: "SET_FOR", value: item })}
                      aria-pressed={isActive}
                      disabled={isDisabled}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              {onboarding.accounts.length < 2 ? (
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
                onChange={(event) =>
                  dispatch({ type: "SET_FOR", value: event.target.value })
                }
              />
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">
              Date & Time
            </p>
            <DateScroller
              value={dateObject}
              onChange={(value) => dispatch({ type: "SET_DATE", value })}
            />
            <TimePicker
              value={dateObject}
              onChange={(value) => dispatch({ type: "SET_DATE", value })}
            />
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
              onChange={(event) =>
                dispatch({ type: "SET_NOTE", value: event.target.value })
              }
            />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
            onClick={handleSubmit}
          >
            <Check className="h-4 w-4" />
            Submit
          </button>
        </>
      ),
    },
  ];

  const activeStep = steps[step] ?? steps[0];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-5 pb-20 pt-10">
      <ServiceWorker />
      {isOnboarded ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <header className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  SheetLog
                </p>
                <h1 className="text-2xl font-semibold">
                  Fast log to your sheet
                </h1>
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
                  onClick={syncNow}
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
                    onClick={handleRefreshSheet}
                  >
                    Setup Sheet
                  </button>
                )}
              </div>
            </div>
          </header>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <span>{activeStep.label}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep.key}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className={activeStep.className}
              >
                {activeStep.render()}
              </motion.div>
            </AnimatePresence>
          </section>
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
