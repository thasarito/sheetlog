import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { useHistoricalRatesQuery } from './exchangeRateQueries';
import { useTransactionBaseAmounts } from './useTransactionBaseAmounts';

vi.mock('./exchangeRateQueries', () => ({
  useHistoricalRatesQuery: vi.fn(),
}));

const row = {
  id: 'usd',
  type: 'expense',
  amount: 3,
  currency: 'USD',
  account: 'Wallet',
  for: 'Me',
  category: 'Coffee',
  date: '2026-08-15T12:00:00',
  status: 'synced',
  createdAt: '2026-08-15T12:00:00',
  updatedAt: '2026-08-15T12:00:00',
} satisfies TransactionRecord;

const refetch = vi.fn();

function rateQueryResult(
  overrides: Partial<ReturnType<typeof useHistoricalRatesQuery>> = {},
): ReturnType<typeof useHistoricalRatesQuery> {
  return {
    data: undefined,
    error: null,
    isFetching: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useHistoricalRatesQuery>;
}

beforeEach(() => {
  refetch.mockReset();
  vi.mocked(useHistoricalRatesQuery).mockReset();
});

describe('useTransactionBaseAmounts', () => {
  it('returns loading state while the list-level rate query is pending', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue(
      rateQueryResult({ isFetching: true }),
    );

    const { result } = renderHook(() =>
      useTransactionBaseAmounts([row], 'THB', true),
    );

    expect(useHistoricalRatesQuery).toHaveBeenCalledWith(
      {
        base: 'THB',
        quotes: ['USD'],
        from: '2026-08-08',
        to: '2026-08-15',
      },
      true,
    );
    expect(result.current.states.usd).toEqual({
      status: 'loading',
      currency: 'THB',
    });
    expect(result.current.isRefreshing).toBe(true);
  });

  it('returns ready state from resolved historical rates', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue(
      rateQueryResult({
        data: {
          rates: [
            {
              id: 'THB:USD:2026-08-15',
              base: 'THB',
              quote: 'USD',
              date: '2026-08-15',
              rate: 0.03,
              fetchedAt: '2026-08-17T00:00:00.000Z',
            },
          ],
          refreshFailed: false,
        },
      }),
    );

    const { result } = renderHook(() =>
      useTransactionBaseAmounts([row], 'THB', true),
    );

    expect(result.current.states.usd).toEqual({
      status: 'ready',
      currency: 'THB',
      amount: 100,
    });
    expect(result.current.refetch).toBe(refetch);
  });

  it('rekeys and reverses which row needs a subline when base currency changes', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue(
      rateQueryResult({
        data: { rates: [], refreshFailed: false },
      }),
    );
    const baseRow = { ...row, id: 'thb', amount: 100, currency: 'THB' };
    const rendered = renderHook(
      ({ baseCurrency }) =>
        useTransactionBaseAmounts([row, baseRow], baseCurrency, true),
      { initialProps: { baseCurrency: 'THB' } },
    );

    expect(rendered.result.current.states).toHaveProperty('usd');
    expect(rendered.result.current.states).not.toHaveProperty('thb');

    rendered.rerender({ baseCurrency: 'USD' });

    expect(rendered.result.current.states).not.toHaveProperty('usd');
    expect(rendered.result.current.states).toHaveProperty('thb');
    expect(useHistoricalRatesQuery).toHaveBeenLastCalledWith(
      {
        base: 'USD',
        quotes: ['THB'],
        from: '2026-08-08',
        to: '2026-08-15',
      },
      true,
    );
  });
});
