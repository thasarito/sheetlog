import { describe, expect, it, vi } from 'vitest';
import {
  backfillHistoricalRateChunks,
  fetchHistoricalRates,
  findHistoricalQuoteRate,
  loadHistoricalRates,
  readHistoricalRates,
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

  it('does not reuse an observation more than seven calendar days old', () => {
    expect(findHistoricalQuoteRate(records, 'USD', '2026-08-21')).toBe(0.031);
    expect(findHistoricalQuoteRate(records, 'USD', '2026-08-25')).toBeNull();
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

describe('background rate loading', () => {
  const requests = Array.from({ length: 5 }, (_, index) => ({
    base: 'THB',
    quotes: [`Q${index}`],
    from: `2026-0${index + 1}-01`,
    to: `2026-0${index + 1}-28`,
  }));

  it('publishes cached records without invoking the network', async () => {
    const store: ExchangeRateStore = {
      read: vi.fn().mockResolvedValue(records),
      write: vi.fn(),
    };

    await expect(readHistoricalRates(requests[0], store)).resolves.toMatchObject({
      rates: records,
      refreshFailed: false,
    });
    expect(store.read).toHaveBeenCalledTimes(1);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('stores chunks incrementally without exceeding the concurrency limit', async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const fetcher = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return { ok: true, json: async () => [] };
    });
    const store: ExchangeRateStore = {
      read: vi.fn(),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const onChunkStored = vi.fn();

    const pending = backfillHistoricalRateChunks(requests, {
      concurrency: 3,
      fetcher,
      store,
      onChunkStored,
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(maximumActive).toBe(3);

    releases.shift()?.();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(onChunkStored).toHaveBeenCalledTimes(1);
    while (releases.length > 0) releases.shift()?.();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    while (releases.length > 0) releases.shift()?.();

    await expect(pending).resolves.toEqual({ completed: requests, failed: [] });
    expect(maximumActive).toBe(3);
    expect(store.write).toHaveBeenCalledTimes(5);
    expect(onChunkStored).toHaveBeenCalledTimes(5);
  });

  it('keeps successful chunks when another request fails', async () => {
    const store: ExchangeRateStore = {
      read: vi.fn(),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const error = new Error('provider unavailable');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ ok: true, json: async () => [] });

    const result = await backfillHistoricalRateChunks(requests.slice(0, 2), {
      fetcher,
      store,
    });

    expect(result.completed).toEqual([requests[1]]);
    expect(result.failed).toEqual([{ request: requests[0], error }]);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('does no work when background sync is offline', async () => {
    const fetcher = vi.fn();
    const store: ExchangeRateStore = { read: vi.fn(), write: vi.fn() };

    await expect(
      backfillHistoricalRateChunks(requests, { isOnline: false, fetcher, store }),
    ).resolves.toEqual({ completed: [], failed: [] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });
});
