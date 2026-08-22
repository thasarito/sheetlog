import type { TransactionRecord } from '../../lib/types';
import type { TransactionBaseAmountState } from './transactionBaseAmounts';

export type DailyNetAmountState =
  | { status: 'loading'; currency: string }
  | { status: 'unavailable'; currency: string }
  | {
      status: 'ready';
      currency: string;
      amount: number;
      approximate: boolean;
    };

function normalizedCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function currencyPrefix(currency: string): string {
  if (currency === 'THB') return '฿';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

function compactAmount(amount: number): string {
  return Math.abs(amount).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function accessibleAmount(amount: number): string {
  return Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildDailyNetAmountState(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>,
): DailyNetAmountState {
  const currency = normalizedCurrency(baseCurrency);
  let amount = 0;
  let approximate = false;
  let isLoading = false;
  let isUnavailable = false;

  for (const transaction of transactions) {
    if (transaction.type === 'transfer') continue;

    const transactionAmount = Number(transaction.amount);
    if (!Number.isFinite(transactionAmount)) {
      isUnavailable = true;
      continue;
    }

    let convertedAmount = transactionAmount;
    if (normalizedCurrency(transaction.currency) !== currency) {
      approximate = true;
      const state = baseAmountStates[transaction.id];
      if (!state || state.status === 'unavailable') {
        isUnavailable = true;
        continue;
      }
      if (state.status === 'loading') {
        isLoading = true;
        continue;
      }
      if (!Number.isFinite(state.amount)) {
        isUnavailable = true;
        continue;
      }
      convertedAmount = state.amount;
    }

    amount += transaction.type === 'income' ? convertedAmount : -convertedAmount;
  }

  if (isLoading) return { status: 'loading', currency };
  if (isUnavailable) return { status: 'unavailable', currency };
  return { status: 'ready', currency, amount, approximate };
}

export function formatDailyNetAmount(state: DailyNetAmountState): string {
  const prefix = currencyPrefix(state.currency);
  if (state.status === 'loading') return '';
  if (state.status === 'unavailable') return `≈ ${prefix}—`;

  const sign = state.amount > 0 ? '+' : state.amount < 0 ? '−' : '';
  const approximation = state.approximate ? '≈ ' : '';
  return `${approximation}${sign}${prefix}${compactAmount(state.amount)}`;
}

export function getDailyNetAccessibleText(state: DailyNetAmountState): string {
  if (state.status === 'loading') {
    return `Daily net loading in ${state.currency}`;
  }
  if (state.status === 'unavailable') {
    return `Daily net unavailable in ${state.currency}`;
  }

  const direction =
    state.amount > 0 ? 'plus ' : state.amount < 0 ? 'minus ' : '';
  const approximation = state.approximate ? 'approximately ' : '';
  return `Daily net ${approximation}${direction}${accessibleAmount(state.amount)} ${state.currency}`;
}
