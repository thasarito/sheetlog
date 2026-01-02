"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plug } from "lucide-react";
import {
  useAuthStorage,
  useConnectivity,
  useOnboarding,
} from "./providers";
import { StatusDot } from "./StatusDot";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import type { TransactionType } from "../lib/types";

const CATEGORY_LABELS: Record<TransactionType, string> = {
  expense: "Expense categories",
  income: "Income categories",
  transfer: "Transfer categories",
};

interface OnboardingFlowProps {
  onToast: (message: string) => void;
}

export function OnboardingFlow({ onToast }: OnboardingFlowProps) {
  const { isOnline } = useConnectivity();
  const { accessToken, sheetId, isConnecting, connect, refreshSheet } =
    useAuthStorage();
  const { onboarding, updateOnboarding } = useOnboarding();
  const [locationMode, setLocationMode] = useState<"root" | "folder">(
    onboarding.sheetFolderId ? "folder" : "root"
  );
  const [folderIdInput, setFolderIdInput] = useState(
    onboarding.sheetFolderId ?? ""
  );
  const [accountInput, setAccountInput] = useState("");
  const [categoryInputs, setCategoryInputs] = useState<
    Record<TransactionType, string>
  >({
    expense: "",
    income: "",
    transfer: "",
  });
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (onboarding.sheetFolderId) {
      setLocationMode("folder");
      setFolderIdInput(onboarding.sheetFolderId);
    }
  }, [onboarding.sheetFolderId]);

  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;
  const hasCategories =
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0;
  const accountsReady =
    onboarding.accountsConfirmed && onboarding.accounts.length > 0;
  const categoriesReady = onboarding.categoriesConfirmed && hasCategories;

  const stepIndex = !accessToken
    ? 0
    : !sheetId
    ? 1
    : !accountsReady
    ? 2
    : !categoriesReady
    ? 3
    : 4;

  const steps = useMemo(
    () => [
      { label: "OAuth login", done: Boolean(accessToken) },
      { label: "Sheet location", done: Boolean(sheetId) },
      { label: "Accounts", done: accountsReady },
      { label: "Categories", done: categoriesReady },
    ],
    [accessToken, sheetId, accountsReady, categoriesReady]
  );

  async function handleConnect() {
    try {
      await connect();
      onToast("Connected to Google");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Failed to connect");
    }
  }

  async function handleSheetSetup() {
    if (locationMode === "folder" && !folderIdInput.trim()) {
      onToast("Enter a Drive folder ID");
      return;
    }
    const folderId = locationMode === "folder" ? folderIdInput.trim() : null;
    setIsSettingUpSheet(true);
    try {
      await refreshSheet(folderId);
      await updateOnboarding({ sheetFolderId: folderId });
      onToast("Sheet ready");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Failed to set up sheet"
      );
    } finally {
      setIsSettingUpSheet(false);
    }
  }

  async function addAccount() {
    const nextValue = accountInput.trim();
    if (!nextValue) {
      onToast("Enter an account name");
      return;
    }
    const exists = onboarding.accounts.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast("Account already added");
      return;
    }
    try {
      await updateOnboarding({
        accounts: [...onboarding.accounts, nextValue],
      });
      setAccountInput("");
    } catch {
      onToast("Failed to add account");
    }
  }

  async function removeAccount(name: string) {
    const next = onboarding.accounts.filter((item) => item !== name);
    try {
      await updateOnboarding({ accounts: next });
    } catch {
      onToast("Failed to remove account");
    }
  }

  async function confirmAccounts() {
    if (onboarding.accounts.length === 0) {
      onToast("Add at least one account");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({ accountsConfirmed: true });
    } catch (error) {
      onToast("Failed to save accounts to sheet");
    } finally {
      setIsSaving(false);
    }
  }

  async function addCategory(type: TransactionType) {
    const nextValue = categoryInputs[type].trim();
    if (!nextValue) {
      onToast("Enter a category");
      return;
    }
    const current = categories[type] ?? [];
    const exists = current.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast("Category already added");
      return;
    }
    const next = { ...categories, [type]: [...current, nextValue] };
    try {
      await updateOnboarding({ categories: next });
      setCategoryInputs((prev) => ({ ...prev, [type]: "" }));
    } catch {
      onToast("Failed to add category");
    }
  }

  async function removeCategory(type: TransactionType, name: string) {
    const current = categories[type] ?? [];
    const next = {
      ...categories,
      [type]: current.filter((item) => item !== name),
    };
    try {
      await updateOnboarding({ categories: next });
    } catch {
      onToast("Failed to remove category");
    }
  }

  async function confirmCategories() {
    if (!hasCategories) {
      onToast("Add at least one category per type");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({ categoriesConfirmed: true });
    } catch (error) {
      onToast("Failed to save categories to sheet");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              SheetLog
            </p>
            <h1 className="text-2xl font-semibold">Get set up</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <StatusDot online={isOnline} />
            <span className="text-muted-foreground">
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card/70 px-4 py-4">
          <div className="space-y-3 text-sm">
            {steps.map((step, index) => (
              <div
                key={step.label}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                      step.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-foreground">{step.label}</span>
                </div>
                {step.done ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-border bg-card/70 p-6">
        <AnimatePresence mode="wait">
          {stepIndex === 0 ? (
            <motion.div
              key="step-auth"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                  <Plug className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Connect Google</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in to authorize SheetLog_DB.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect Google Account"}
              </button>
              <p className="text-xs text-muted-foreground">
                Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your env.
              </p>
            </motion.div>
          ) : null}

          {stepIndex === 1 ? (
            <motion.div
              key="step-sheet"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-lg font-semibold">Pick sheet location</h2>
                <p className="text-sm text-muted-foreground">
                  Choose where SheetLog_DB should live in Drive.
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sheet-location"
                    checked={locationMode === "root"}
                    onChange={() => setLocationMode("root")}
                    className="h-4 w-4"
                  />
                  <span>My Drive (default)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sheet-location"
                    checked={locationMode === "folder"}
                    onChange={() => setLocationMode("folder")}
                    className="h-4 w-4"
                  />
                  <span>Specific folder</span>
                </label>
              </div>
              {locationMode === "folder" ? (
                <input
                  type="text"
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="Drive folder ID"
                  value={folderIdInput}
                  onChange={(event) => setFolderIdInput(event.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                onClick={handleSheetSetup}
                disabled={
                  isSettingUpSheet ||
                  (locationMode === "folder" && !folderIdInput.trim())
                }
              >
                {isSettingUpSheet ? "Setting up..." : "Create or Locate Sheet"}
              </button>
              <p className="text-xs text-muted-foreground">
                We will create or reuse SheetLog_DB and add the headers.
              </p>
            </motion.div>
          ) : null}

          {stepIndex === 2 ? (
            <motion.div
              key="step-accounts"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-lg font-semibold">Set up accounts</h2>
                <p className="text-sm text-muted-foreground">
                  Add your bank accounts, cards, or wallets.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="e.g. Chase Checking"
                  value={accountInput}
                  onChange={(event) => setAccountInput(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addAccount();
                  }}
                />
                <button
                  type="button"
                  className="rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
                  onClick={addAccount}
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {onboarding.accounts.map((account) => (
                  <div
                    key={account}
                    className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
                  >
                    <span>{account}</span>
                    <button
                      type="button"
                      className="text-muted-foreground"
                      onClick={() => removeAccount(account)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={confirmAccounts}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Continue"}
              </button>
            </motion.div>
          ) : null}

          {stepIndex === 3 ? (
            <motion.div
              key="step-categories"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-lg font-semibold">Set up categories</h2>
                <p className="text-sm text-muted-foreground">
                  Customize the categories used in logging.
                </p>
              </div>
              {(["expense", "income", "transfer"] as TransactionType[]).map(
                (type) => (
                  <div key={type} className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {CATEGORY_LABELS[type]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(categories[type] ?? []).map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            className="text-muted-foreground"
                            onClick={() => removeCategory(type, item)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                        placeholder="Add a category"
                        value={categoryInputs[type]}
                        onChange={(event) =>
                          setCategoryInputs((prev) => ({
                            ...prev,
                            [type]: event.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addCategory(type);
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
                        onClick={() => addCategory(type)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )
              )}
              <button
                type="button"
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={confirmCategories}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Finish setup"}
              </button>
            </motion.div>
          ) : null}

          {stepIndex === 4 ? (
            <motion.div
              key="step-done"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="space-y-2 text-center"
            >
              <h2 className="text-lg font-semibold">All set</h2>
              <p className="text-sm text-muted-foreground">
                You can start logging now.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
