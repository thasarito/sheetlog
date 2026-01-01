'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plug } from 'lucide-react';
import { useApp } from './AppProvider';
import { StatusDot } from './StatusDot';
import { DEFAULT_CATEGORIES } from '../lib/categories';
import type { TransactionType } from '../lib/types';

const CATEGORY_LABELS: Record<TransactionType, string> = {
  expense: 'Expense categories',
  income: 'Income categories',
  transfer: 'Transfer categories'
};

interface OnboardingFlowProps {
  onToast: (message: string) => void;
}

export function OnboardingFlow({ onToast }: OnboardingFlowProps) {
  const {
    isOnline,
    accessToken,
    sheetId,
    isConnecting,
    onboarding,
    connect,
    refreshSheet,
    updateOnboarding
  } = useApp();
  const [locationMode, setLocationMode] = useState<'root' | 'folder'>(
    onboarding.sheetFolderId ? 'folder' : 'root'
  );
  const [folderIdInput, setFolderIdInput] = useState(
    onboarding.sheetFolderId ?? ''
  );
  const [accountInput, setAccountInput] = useState('');
  const [categoryInputs, setCategoryInputs] = useState<
    Record<TransactionType, string>
  >({
    expense: '',
    income: '',
    transfer: ''
  });
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);

  useEffect(() => {
    if (onboarding.sheetFolderId) {
      setLocationMode('folder');
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
      { label: 'OAuth login', done: Boolean(accessToken) },
      { label: 'Sheet location', done: Boolean(sheetId) },
      { label: 'Accounts', done: accountsReady },
      { label: 'Categories', done: categoriesReady }
    ],
    [accessToken, sheetId, accountsReady, categoriesReady]
  );

  async function handleConnect() {
    try {
      await connect();
      onToast('Connected to Google');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Failed to connect');
    }
  }

  async function handleSheetSetup() {
    if (locationMode === 'folder' && !folderIdInput.trim()) {
      onToast('Enter a Drive folder ID');
      return;
    }
    const folderId = locationMode === 'folder' ? folderIdInput.trim() : null;
    setIsSettingUpSheet(true);
    try {
      await refreshSheet(folderId);
      await updateOnboarding({ sheetFolderId: folderId });
      onToast('Sheet ready');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Failed to set up sheet');
    } finally {
      setIsSettingUpSheet(false);
    }
  }

  function addAccount() {
    const nextValue = accountInput.trim();
    if (!nextValue) {
      onToast('Enter an account name');
      return;
    }
    const exists = onboarding.accounts.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast('Account already added');
      return;
    }
    void updateOnboarding({
      accounts: [...onboarding.accounts, nextValue]
    });
    setAccountInput('');
  }

  function removeAccount(name: string) {
    const next = onboarding.accounts.filter((item) => item !== name);
    void updateOnboarding({ accounts: next });
  }

  async function confirmAccounts() {
    if (onboarding.accounts.length === 0) {
      onToast('Add at least one account');
      return;
    }
    await updateOnboarding({ accountsConfirmed: true });
  }

  function addCategory(type: TransactionType) {
    const nextValue = categoryInputs[type].trim();
    if (!nextValue) {
      onToast('Enter a category');
      return;
    }
    const current = categories[type] ?? [];
    const exists = current.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast('Category already added');
      return;
    }
    const next = { ...categories, [type]: [...current, nextValue] };
    void updateOnboarding({ categories: next });
    setCategoryInputs((prev) => ({ ...prev, [type]: '' }));
  }

  function removeCategory(type: TransactionType, name: string) {
    const current = categories[type] ?? [];
    const next = {
      ...categories,
      [type]: current.filter((item) => item !== name)
    };
    void updateOnboarding({ categories: next });
  }

  async function confirmCategories() {
    if (!hasCategories) {
      onToast('Add at least one category per type');
      return;
    }
    await updateOnboarding({ categoriesConfirmed: true });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              SheetLog
            </p>
            <h1 className="text-2xl font-semibold">Get set up</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <StatusDot online={isOnline} />
            <span className="text-slate-300">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
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
                        ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                        : 'border-white/10 text-slate-300'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-slate-100">{step.label}</span>
                </div>
                {step.done ? (
                  <Check className="h-4 w-4 text-emerald-300" />
                ) : (
                  <span className="text-xs text-slate-400">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
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
                <div className="rounded-2xl bg-emerald-400/20 p-3 text-emerald-300">
                  <Plug className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Connect Google</h2>
                  <p className="text-sm text-slate-300">
                    Sign in to authorize SheetLog_DB.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Google Account'}
              </button>
              <p className="text-xs text-slate-400">
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
                <p className="text-sm text-slate-300">
                  Choose where SheetLog_DB should live in Drive.
                </p>
              </div>
              <div className="space-y-2 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sheet-location"
                    checked={locationMode === 'root'}
                    onChange={() => setLocationMode('root')}
                    className="h-4 w-4"
                  />
                  <span>My Drive (default)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sheet-location"
                    checked={locationMode === 'folder'}
                    onChange={() => setLocationMode('folder')}
                    className="h-4 w-4"
                  />
                  <span>Specific folder</span>
                </label>
              </div>
              {locationMode === 'folder' ? (
                <input
                  type="text"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
                  placeholder="Drive folder ID"
                  value={folderIdInput}
                  onChange={(event) => setFolderIdInput(event.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="w-full rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
                onClick={handleSheetSetup}
                disabled={
                  isSettingUpSheet ||
                  (locationMode === 'folder' && !folderIdInput.trim())
                }
              >
                {isSettingUpSheet ? 'Setting up...' : 'Create or Locate Sheet'}
              </button>
              <p className="text-xs text-slate-400">
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
                <p className="text-sm text-slate-300">
                  Add your bank accounts, cards, or wallets.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
                  placeholder="e.g. Chase Checking"
                  value={accountInput}
                  onChange={(event) => setAccountInput(event.target.value)}
                />
                <button
                  type="button"
                  className="rounded-2xl border border-white/10 px-4 text-sm font-semibold text-slate-100"
                  onClick={addAccount}
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {onboarding.accounts.map((account) => (
                  <div
                    key={account}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100"
                  >
                    <span>{account}</span>
                    <button
                      type="button"
                      className="text-slate-400"
                      onClick={() => removeAccount(account)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
                onClick={confirmAccounts}
              >
                Continue
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
                <p className="text-sm text-slate-300">
                  Customize the categories used in logging.
                </p>
              </div>
              {(['expense', 'income', 'transfer'] as TransactionType[]).map(
                (type) => (
                  <div key={type} className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-slate-400">
                      {CATEGORY_LABELS[type]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(categories[type] ?? []).map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            className="text-slate-400"
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
                        className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100"
                        placeholder="Add a category"
                        value={categoryInputs[type]}
                        onChange={(event) =>
                          setCategoryInputs((prev) => ({
                            ...prev,
                            [type]: event.target.value
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="rounded-2xl border border-white/10 px-4 text-sm font-semibold text-slate-100"
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
                className="w-full rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
                onClick={confirmCategories}
              >
                Finish setup
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
              <p className="text-sm text-slate-300">
                You can start logging now.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
