import { format, parseISO, subDays } from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import { buildHistoricalRateResolver } from './analyticsSync';
import type { HistoricalRateRequest } from './exchangeRates';

export type TransactionBaseAmountState =
  | { status: 'loading'; currency: string }
  | { status: 'ready'; currency: string; amount: number }
  | { status: 'unavailable'; currency: string };

function normalizedCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function transactionDateKey(transaction: TransactionRecord): string | null {
  const date = tryParseDate(transaction.date);
  return date ? format(date, 'yyyy-MM-dd') : null;
}

function currencyPrefix(currency: string): string {
  if (currency === 'THB') return '฿';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

export function getTransactionBaseAmountRateRequest(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
): HistoricalRateRequest | null {
  const base = normalizedCurrency(baseCurrency);
  const quotes = new Set<string>();
  const dates: string[] = [];

  for (const transaction of transactions) {
    const quote = normalizedCurrency(transaction.currency);
    if (quote === base) continue;
    const date = transactionDateKey(transaction);
    if (!date) continue;
    quotes.add(quote);
    dates.push(date);
  }

  if (quotes.size === 0 || dates.length === 0) return null;
  dates.sort();
  const earliestDate = dates[0];
  const latestDate = dates.at(-1);
  if (!earliestDate || !latestDate) return null;

  return {
    base,
    quotes: [...quotes].sort(),
    from: format(subDays(parseISO(earliestDate), 7), 'yyyy-MM-dd'),
    to: latestDate,
  };
}

export function buildTransactionBaseAmounts(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  rates: readonly ExchangeRateRecord[],
  rateResolver?: (quote: string, date: string) => number | null,
): Record<string, number> {
  const base = normalizedCurrency(baseCurrency);
  const resolveRate = rateResolver ?? buildHistoricalRateResolver(rates, base);
  const amounts: Record<string, number> = {};

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) continue;
    const quote = normalizedCurrency(transaction.currency);
    if (quote === base) {
      amounts[transaction.id] = amount;
      continue;
    }
    const date = transactionDateKey(transaction);
    if (!date) continue;
    const rate = resolveRate(quote, date);
    if (rate !== null) amounts[transaction.id] = amount / rate;
  }

  return amounts;
}

export function buildTransactionBaseAmountStates(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  amounts: Readonly<Record<string, number>>,
  isLoading: boolean,
): Record<string, TransactionBaseAmountState> {
  const base = normalizedCurrency(baseCurrency);
  const states: Record<string, TransactionBaseAmountState> = {};

  for (const transaction of transactions) {
    if (normalizedCurrency(transaction.currency) === base) continue;
    if (isLoading) {
      states[transaction.id] = { status: 'loading', currency: base };
      continue;
    }
    states[transaction.id] = Object.hasOwn(amounts, transaction.id)
      ? {
          status: 'ready',
          currency: base,
          amount: amounts[transaction.id],
        }
      : { status: 'unavailable', currency: base };
  }

  return states;
}

export function formatTransactionBaseAmount(
  transaction: TransactionRecord,
  state: Exclude<TransactionBaseAmountState, { status: 'loading' }>,
): string {
  const prefix = currencyPrefix(state.currency);
  if (state.status === 'unavailable') return `≈ ${prefix}—`;
  const sign = transaction.type === 'expense' ? '−' : '+';
  const amount = Math.abs(state.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `≈ ${sign}${prefix}${amount}`;
}

export function getTransactionBaseAmountAccessibleText(
  transaction: TransactionRecord,
  state: TransactionBaseAmountState,
): string | null {
  if (state.status === 'loading') return null;
  if (state.status === 'unavailable') {
    return `base amount unavailable in ${state.currency}`;
  }
  const sign = transaction.type === 'expense' ? 'minus' : 'plus';
  const amount = Math.abs(state.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `approximately ${sign} ${amount} ${state.currency}`;
}
