import type { TransactionRecord } from '../../lib/types';
import type { TransactionBaseAmountState } from './transactionBaseAmounts';

export type DailyNetAmountState =
  | { status: 'loading'; currency: string }
  | { status: 'ready'; currency: string; amount: number; approximate: boolean }
  | { status: 'unavailable'; currency: string };

export function buildDailyNetAmountState(
  _transactions: readonly TransactionRecord[],
  baseCurrency: string,
  _baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>,
): DailyNetAmountState {
  return {
    status: 'ready',
    currency: baseCurrency.trim().toUpperCase(),
    amount: 0,
    approximate: false,
  };
}

export function formatDailyNetAmount(_state: DailyNetAmountState): string {
  return '';
}

export function getDailyNetAccessibleText(_state: DailyNetAmountState): string {
  return '';
}
