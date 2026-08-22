import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  buildDailyNetAmountState,
  formatDailyNetAmount,
  getDailyNetAccessibleText,
} from './transactionDailyNet';

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'THB',
    account: 'Wallet',
    for: 'Me',
    category: `Category ${id}`,
    date: '2026-08-17T12:00:00',
    status: 'synced',
    createdAt: '2026-08-17T12:00:00',
    updatedAt: '2026-08-17T12:00:00',
    ...overrides,
  };
}

describe('transactionDailyNet', () => {
  it('subtracts expenses from income and excludes transfers', () => {
    const state = buildDailyNetAmountState(
      [
        transaction('expense', { amount: 120 }),
        transaction('income', { type: 'income', amount: 500 }),
        transaction('transfer', { type: 'transfer', amount: 900 }),
      ],
      'THB',
      {},
    );

    expect(state).toEqual({
      status: 'ready',
      currency: 'THB',
      amount: 380,
      approximate: false,
    });
    expect(formatDailyNetAmount(state)).toBe('+฿380');
    expect(getDailyNetAccessibleText(state)).toBe('Daily net plus 380.00 THB');
  });

  it('uses converted foreign amounts and marks the total approximate', () => {
    const state = buildDailyNetAmountState(
      [
        transaction('foreign-expense', { amount: 3, currency: 'USD' }),
        transaction('income', { type: 'income', amount: 500 }),
      ],
      'THB',
      {
        'foreign-expense': {
          status: 'ready',
          currency: 'THB',
          amount: 100,
        },
      },
    );

    expect(state).toEqual({
      status: 'ready',
      currency: 'THB',
      amount: 400,
      approximate: true,
    });
    expect(formatDailyNetAmount(state)).toBe('≈ +฿400');
    expect(getDailyNetAccessibleText(state)).toBe(
      'Daily net approximately plus 400.00 THB',
    );
  });

  it('ignores foreign transfer conversion states', () => {
    const state = buildDailyNetAmountState(
      [
        transaction('expense', { amount: 120 }),
        transaction('foreign-transfer', {
          type: 'transfer',
          amount: 3,
          currency: 'USD',
        }),
      ],
      'THB',
      {
        'foreign-transfer': { status: 'loading', currency: 'THB' },
      },
    );

    expect(state).toEqual({
      status: 'ready',
      currency: 'THB',
      amount: -120,
      approximate: false,
    });
  });

  it('keeps the daily total loading until every included conversion resolves', () => {
    const state = buildDailyNetAmountState(
      [transaction('foreign', { currency: 'USD' })],
      'THB',
      { foreign: { status: 'loading', currency: 'THB' } },
    );

    expect(state).toEqual({ status: 'loading', currency: 'THB' });
    expect(getDailyNetAccessibleText(state)).toBe('Daily net loading in THB');
  });

  it('does not present a partial total when an included conversion is unavailable', () => {
    const state = buildDailyNetAmountState(
      [
        transaction('base', { amount: 120 }),
        transaction('foreign', { currency: 'USD' }),
      ],
      'THB',
      { foreign: { status: 'unavailable', currency: 'THB' } },
    );

    expect(state).toEqual({ status: 'unavailable', currency: 'THB' });
    expect(formatDailyNetAmount(state)).toBe('≈ ฿—');
    expect(getDailyNetAccessibleText(state)).toBe(
      'Daily net unavailable in THB',
    );
  });
});
