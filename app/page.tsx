'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plug, RefreshCw } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useApp } from '../components/AppProvider';
import { StatusDot } from '../components/StatusDot';
import { Keypad } from '../components/Keypad';
import { TagChips } from '../components/TagChips';
import { CategoryGrid } from '../components/CategoryGrid';
import { Toast } from '../components/Toast';
import { ServiceWorker } from '../components/ServiceWorker';
import type { TransactionType } from '../lib/types';

const TAGS = ['Trip', 'Business', 'Family', 'Groceries', 'Home', 'Subscription'];

const CATEGORIES: Record<TransactionType, string[]> = {
  expense: ['Food', 'Transport', 'Rent', 'Utilities', 'Health', 'Shopping', 'Entertainment', 'Other'],
  income: ['Salary', 'Bonus', 'Gift', 'Interest', 'Other'],
  transfer: ['Savings', 'Invest', 'Credit Card', 'Other']
};

const STEP_LABELS = ['Type', 'Category', 'Amount'];

export default function HomePage() {
  const {
    isOnline,
    accessToken,
    sheetId,
    isConnecting,
    queueCount,
    recentCategories,
    connect,
    refreshSheet,
    addTransaction,
    undoLast,
    syncNow
  } = useApp();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<TransactionType | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const todayValue = format(new Date(), 'yyyy-MM-dd');
  const yesterdayValue = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const [dateValue, setDateValue] = useState(todayValue);
  const [note, setNote] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastActionLabel, setToastActionLabel] = useState<string | undefined>(undefined);
  const [toastAction, setToastAction] = useState<(() => void) | undefined>(undefined);

  const typeCategories = type ? CATEGORIES[type] : [];
  const frequentCategories = useMemo(() => {
    if (!type) {
      return [];
    }
    const recent = recentCategories[type] ?? [];
    const combined = [...recent, ...typeCategories];
    const unique = combined.filter((item, index) => combined.indexOf(item) === index);
    return unique.slice(0, 4);
  }, [type, typeCategories, recentCategories]);

  const otherCategories = useMemo(() => {
    if (!type) {
      return [];
    }
    return typeCategories.filter((item) => !frequentCategories.includes(item));
  }, [type, typeCategories, frequentCategories]);

  const formattedAmount = amount ? Number.parseFloat(amount) : 0;

  function handleToast(message: string, action?: { label: string; onClick: () => void }) {
    setToastMessage(message);
    setToastActionLabel(action?.label);
    setToastAction(() => action?.onClick);
    setToastOpen(true);
    window.setTimeout(() => setToastOpen(false), 4000);
  }

  function resetFlow() {
    setStep(0);
    setType(null);
    setCategory(null);
    setTags([]);
    setAmount('');
    setNote('');
    setDateValue(todayValue);
  }

  async function handleConnect() {
    try {
      await connect();
      handleToast('Connected to Google');
    } catch (error) {
      handleToast(error instanceof Error ? error.message : 'Failed to connect');
    }
  }

  async function handleRefreshSheet() {
    try {
      await refreshSheet();
      handleToast('Sheet ready');
    } catch (error) {
      handleToast(error instanceof Error ? error.message : 'Failed to refresh sheet');
    }
  }

  async function handleSubmit() {
    if (!type || !category || !amount) {
      handleToast('Complete all fields');
      return;
    }
    if (Number.isNaN(formattedAmount) || formattedAmount <= 0) {
      handleToast('Enter a valid amount');
      return;
    }
    await addTransaction({
      type,
      amount: formattedAmount,
      category,
      tags,
      date: dateValue,
      note: note.trim() || undefined
    });
    handleToast('Saved', { label: 'Undo', onClick: () => void handleUndo() });
    resetFlow();
  }

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  function setToday() {
    setDateValue(todayValue);
  }

  function setYesterday() {
    setDateValue(yesterdayValue);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-5 pb-20 pt-10">
      <ServiceWorker />
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">SheetLog</p>
              <h1 className="text-2xl font-semibold">Fast log to your sheet</h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <StatusDot online={isOnline} />
              <span className="text-slate-300">{isOnline ? 'Online' : 'Offline'}</span>
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

        {!accessToken ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400/20 p-3 text-emerald-300">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Connect Google Account</h2>
                <p className="text-sm text-slate-300">Authorize access to SheetLog_DB.</p>
              </div>
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Google Account'}
            </button>
            <p className="mt-3 text-xs text-slate-400">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your env.</p>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
            <span>Step {step + 1} of 3</span>
            <span>{STEP_LABELS[step]}</span>
          </div>

          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.div
                key="step-type"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-semibold">What are you logging?</h2>
                <div className="grid grid-cols-1 gap-3">
                  {(['expense', 'income', 'transfer'] as TransactionType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left text-lg font-semibold capitalize transition hover:border-emerald-400"
                      onClick={() => {
                        setType(item);
                        setStep(1);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}

            {step === 1 && type ? (
              <motion.div
                key="step-category"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Choose a category</h2>
                  <button
                    type="button"
                    className="text-xs text-slate-400"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </button>
                </div>
                <CategoryGrid
                  frequent={frequentCategories}
                  others={otherCategories}
                  selected={category}
                  onSelect={(value) => {
                    setCategory(value);
                    setStep(2);
                  }}
                />
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">Tags</p>
                  <TagChips tags={TAGS} selected={tags} onToggle={toggleTag} />
                </div>
              </motion.div>
            ) : null}

            {step === 2 && type ? (
              <motion.div
                key="step-amount"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Amount & details</h2>
                  <button
                    type="button"
                    className="text-xs text-slate-400"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-2xl font-semibold">
                  {amount ? `$${amount}` : '$0.00'}
                </div>

                <Keypad value={amount} onChange={setAmount} />

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Date</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        dateValue === todayValue ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-white/10'
                      }`}
                      onClick={setToday}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        dateValue === yesterdayValue
                          ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                          : 'border-white/10'
                      }`}
                      onClick={setYesterday}
                    >
                      Yesterday
                    </button>
                    <input
                      type="date"
                      className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-xs font-semibold text-slate-100"
                      value={dateValue}
                      onChange={(event) => setDateValue(event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-400">Note</label>
                  <input
                    type="text"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
                    placeholder="Optional"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
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
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      </div>

      <Toast
        open={toastOpen}
        message={toastMessage}
        actionLabel={toastActionLabel}
        onAction={toastAction}
        onClose={() => setToastOpen(false)}
      />
    </main>
  );
}
