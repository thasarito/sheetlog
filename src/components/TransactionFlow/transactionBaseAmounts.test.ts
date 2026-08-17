import { describe, expect, it } from 'vitest';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import {
  buildTransactionBaseAmountStates,
  buildTransactionBaseAmounts,
  formatTransactionBaseAmount,
  getTransactionBaseAmountAccessibleText,
  getTransactionBaseAmountRateRequest,
} from './transactionBaseAmounts';

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: 'expense',
    amount: 3,
    currency: 'USD',
    account: 'Wallet',
    for: 'Me',
    category: id,
    date: '2026-08-15T12:00:00',
    status: 'synced',
    createdAt: '2026-08-15T12:00:00',
    updatedAt: '2026-08-15T12:00:00',
    ...overrides,
  };
}

const rates: ExchangeRateRecord[] = [
  {
    id: 'THB:USD:2026-08-14',
    base: 'THB',
    quote: 'USD',
    date: '2026-08-14',
    rate: 0.03,
    fetchedAt: '2026-08-17T00:00:00.000Z',
  },
];

describe('transaction base amounts', () => {
  it('builds one deduplicated request with a seven-day lookback', () => {
    expect(
      getTransactionBaseAmountRateRequest(
        [
          transaction('usd-new'),
          transaction('usd-old', { date: '2026-08-10T09:00:00' }),
          transaction('eur', {
            currency: 'EUR',
            date: '2026-08-12T09:00:00',
          }),
          transaction('base', { currency: 'THB' }),
          transaction('invalid', { currency: 'GBP', date: 'invalid' }),
        ],
        'THB',
      ),
    ).toEqual({
      base: 'THB',
      quotes: ['EUR', 'USD'],
      from: '2026-08-03',
      to: '2026-08-15',
    });
  });

  it('returns no request when no valid foreign date needs a rate', () => {
    expect(
      getTransactionBaseAmountRateRequest(
        [
          transaction('base', { currency: 'THB' }),
          transaction('bad', { date: 'bad' }),
        ],
        'THB',
      ),
    ).toBeNull();
  });

  it('divides by the closest prior base-to-quote rate without mutating rows', () => {
    const usd = transaction('usd');
    const base = transaction('base', { amount: 25, currency: 'THB' });

    expect(buildTransactionBaseAmounts([usd, base], 'THB', rates)).toEqual({
      usd: 100,
      base: 25,
    });
    expect(usd).toMatchObject({ amount: 3, currency: 'USD' });
  });

  it('separates loading, ready, unavailable, and same-currency states', () => {
    const rows = [
      transaction('ready'),
      transaction('missing', { currency: 'EUR' }),
      transaction('base', { currency: 'THB' }),
    ];

    expect(buildTransactionBaseAmountStates(rows, 'THB', {}, true)).toEqual({
      ready: { status: 'loading', currency: 'THB' },
      missing: { status: 'loading', currency: 'THB' },
    });
    expect(
      buildTransactionBaseAmountStates(
        rows,
        'THB',
        { ready: 100, base: 3 },
        false,
      ),
    ).toEqual({
      ready: { status: 'ready', currency: 'THB', amount: 100 },
      missing: { status: 'unavailable', currency: 'THB' },
    });
  });

  it('formats quiet visible and explicit spoken values', () => {
    const expense = transaction('expense');
    const income = transaction('income', { type: 'income' });
    const ready = {
      status: 'ready',
      currency: 'THB',
      amount: 100,
    } as const;
    const unavailable = {
      status: 'unavailable',
      currency: 'THB',
    } as const;

    expect(formatTransactionBaseAmount(expense, ready)).toBe('≈ −฿100.00');
    expect(formatTransactionBaseAmount(income, ready)).toBe('≈ +฿100.00');
    expect(formatTransactionBaseAmount(expense, unavailable)).toBe('≈ ฿—');
    expect(getTransactionBaseAmountAccessibleText(expense, ready)).toBe(
      'approximately minus 100.00 THB',
    );
    expect(
      getTransactionBaseAmountAccessibleText(expense, unavailable),
    ).toBe('base amount unavailable in THB');
  });
});
