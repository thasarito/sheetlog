import { describe, expect, it, vi } from 'vitest';
import {
  fetchHistoricalRates,
  findHistoricalQuoteRate,
  loadHistoricalRates,
  type ExchangeRateStore,
} from './exchangeRates';

const records = [
  {
    id: 'THB:USD:2026-08-14',
    base: 'THB',
    quote: 'USD',
    date: '2026-08-14',
    rate: 0.03,
    fetchedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: 'THB:USD:2026-08-17',
    base: 'THB',
    quote: 'USD',
    date: '2026-08-17',
    rate: 0.031,
    fetchedAt: '2026-08-17T00:00:00.000Z',
  },
];

describe('findHistoricalQuoteRate', () => {
  it('uses the exact or preceding observation and never a future one', () => {
    expect(findHistoricalQuoteRate(records, 'USD', '2026-08-17')).toBe(0.031);
    expect(findHistoricalQuoteRate(records, 'USD', '2026-08-16')).toBe(0.03);
    expect(findHistoricalQuoteRate(records, 'USD', '2026-08-13')).toBeNull();
  });
});

describe('fetchHistoricalRates', () => {
  it('requests one bounded range and rejects invalid rows', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { date: '2026-08-14', base: 'THB', quote: 'USD', rate: 0.03 },
        { date: '2026-08-14', base: 'THB', quote: 'EUR', rate: -1 },
        { date: '2026-08-14', base: 'EUR', quote: 'USD', rate: 1.2 },
      ],
    });
    const result = await fetchHistoricalRates(
      { base: 'THB', quotes: ['USD', 'EUR', 'USD'], from: '2026-08-10', to: '2026-08-17' },
      fetcher,
      new Date('2026-08-17T12:00:00.000Z'),
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v2/rates?base=THB&quotes=EUR%2CUSD&from=2026-08-10&to=2026-08-17',
    );
    expect(result).toEqual([
      {
        id: 'THB:USD:2026-08-14',
        base: 'THB',
        quote: 'USD',
        date: '2026-08-14',
        rate: 0.03,
        fetchedAt: '2026-08-17T12:00:00.000Z',
      },
    ]);
  });

  it('requires an array response', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: [] }),
    });

    await expect(
      fetchHistoricalRates(
        { base: 'THB', quotes: ['USD'], from: '2026-08-10', to: '2026-08-17' },
        fetcher,
      ),
    ).rejects.toThrow();
  });
});

describe('loadHistoricalRates', () => {
  it('returns cached records offline without fetching', async () => {
    const store: ExchangeRateStore = {
      read: vi.fn().mockResolvedValue(records),
      write: vi.fn(),
    };
    const fetcher = vi.fn();
    const result = await loadHistoricalRates(
      { base: 'THB', quotes: ['USD'], from: '2026-08-10', to: '2026-08-17' },
      { isOnline: false, store, fetcher },
    );

    expect(result.rates).toEqual(records);
    expect(result.refreshFailed).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to cached records when an online refresh fails', async () => {
    const store: ExchangeRateStore = {
      read: vi.fn().mockResolvedValue(records),
      write: vi.fn(),
    };
    const result = await loadHistoricalRates(
      { base: 'THB', quotes: ['USD'], from: '2026-08-10', to: '2026-08-17' },
      {
        isOnline: true,
        store,
        fetcher: vi.fn().mockRejectedValue(new Error('unavailable')),
      },
    );

    expect(result.rates).toEqual(records);
    expect(result.refreshFailed).toBe(true);
  });

  it('skips storage and network when no foreign quote is required', async () => {
    const store: ExchangeRateStore = {
      read: vi.fn(),
      write: vi.fn(),
    };
    const fetcher = vi.fn();
    const result = await loadHistoricalRates(
      { base: 'THB', quotes: [], from: '2026-08-10', to: '2026-08-17' },
      { isOnline: true, store, fetcher },
    );

    expect(result).toEqual({ rates: [], refreshFailed: false });
    expect(store.read).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
