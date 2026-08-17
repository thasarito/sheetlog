import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import type {
  ExchangeRateRecord,
  TransactionRecord,
  TransactionType,
} from '../../lib/types';
import { useAnalyticsSync } from './useAnalyticsSync';

const state = vi.hoisted(() => ({
  sheetId: 'sheet-a' as string | null,
  isOnline: true,
  history: {
    records: [] as TransactionRecord[],
    meta: {
      sheetId: 'sheet-a',
      capturedAt: '2026-08-17T10:00:00.000Z',
      sourceLastRow: 1,
      rowCount: 0,
    },
    error: null as Error | null,
    remoteError: null as Error | null,
    hasCompleteCache: true,
    hasLocalSnapshot: true,
    isLoading: false,
    isRefreshing: false,
    isDownloading: false,
    remoteStatus: 'pending' as 'pending' | 'error' | 'success',
    remoteFetchedAt: undefined as number | undefined,
    isOnline: true,
    refresh: vi.fn(),
  },
  historyEnabled: vi.fn(),
  readRates: vi.fn(),
  backfill: vi.fn(),
  metadataWriteError: null as Error | null,
  metadataWriteCount: 0,
}));

vi.mock('../../app/providers', () => ({
  useConnectivity: () => ({ isOnline: state.isOnline }),
  useWorkspace: () => ({ sheetId: state.sheetId }),
}));

vi.mock('./useTransactionHistoryQuery', () => ({
  useTransactionHistoryQuery: (enabled: boolean) => {
    state.historyEnabled(enabled);
    return state.history;
  },
}));

vi.mock('./exchangeRates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exchangeRates')>()),
  readHistoricalRates: state.readRates,
  backfillHistoricalRateChunks: state.backfill,
}));

vi.mock('./analyticsSyncMetadata', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('./analyticsSyncMetadata')
  >();
  return {
    ...original,
    writeAnalyticsSyncMetadata: async (
      ...args: Parameters<typeof original.writeAnalyticsSyncMetadata>
    ) => {
      state.metadataWriteCount += 1;
      if (state.metadataWriteError) throw state.metadataWriteError;
      return original.writeAnalyticsSyncMetadata(...args);
    },
  };
});

function transaction(
  currency = 'USD',
  type: TransactionType = 'expense',
): TransactionRecord {
  return {
    id: `transaction-${currency}`,
    type,
    amount: 3,
    currency,
    account: 'Cash',
    for: 'Me',
    category: 'Dining',
    date: '2026-08-17T09:00:00',
    status: 'synced',
    createdAt: '2026-08-17T09:00:00',
    updatedAt: '2026-08-17T09:00:00',
  };
}

function usdRate(): ExchangeRateRecord {
  return {
    id: 'THB:USD:2026-08-17',
    base: 'THB',
    quote: 'USD',
    date: '2026-08-17',
    rate: 0.03,
    fetchedAt: '2026-08-17T10:00:00.000Z',
  };
}

function eurRate(): ExchangeRateRecord {
  return {
    id: 'THB:EUR:2026-08-17',
    base: 'THB',
    quote: 'EUR',
    date: '2026-08-17',
    rate: 0.025,
    fetchedAt: '2026-08-17T10:00:00.000Z',
  };
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, wrapper: Wrapper };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useAnalyticsSync', () => {
  beforeEach(async () => {
    state.sheetId = 'sheet-a';
    state.isOnline = true;
    state.history.records = [transaction()];
    state.history.meta = {
      sheetId: 'sheet-a',
      capturedAt: '2026-08-17T10:00:00.000Z',
      sourceLastRow: 2,
      rowCount: 1,
    };
    state.history.error = null;
    state.history.remoteError = null;
    state.history.hasCompleteCache = true;
    state.history.hasLocalSnapshot = true;
    state.history.isLoading = false;
    state.history.isRefreshing = false;
    state.history.isDownloading = true;
    state.history.remoteStatus = 'pending';
    state.history.remoteFetchedAt = undefined;
    state.history.isOnline = true;
    state.history.refresh.mockReset();
    state.historyEnabled.mockReset();
    state.readRates.mockReset().mockResolvedValue({
      rates: [usdRate()],
      refreshFailed: false,
    });
    state.backfill.mockReset().mockResolvedValue({ completed: [], failed: [] });
    state.metadataWriteError = null;
    state.metadataWriteCount = 0;
    await db.settings.clear();
  });

  afterEach(async () => {
    cleanup();
    await db.settings.clear();
  });

  it('eagerly enables history and publishes cached rates during remote refresh', async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(result.current.rates).toEqual([usdRate()]));
    expect(state.historyEnabled).toHaveBeenCalledWith(true);
    expect(result.current.records).toEqual([transaction()]);
    expect(result.current.hasLocalHistory).toBe(true);
    expect(result.current.status).toBe('syncing');
    expect(state.backfill).not.toHaveBeenCalled();
  });

  it('backfills unresolved chunks and republishes rates incrementally', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.readRates
      .mockResolvedValueOnce({ rates: [], refreshFailed: false })
      .mockResolvedValue({ rates: [usdRate()], refreshFailed: false });
    state.backfill.mockImplementation(async (_requests, options) => {
      await options.onChunkStored?.(_requests[0]);
      return { completed: _requests, failed: [] };
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    expect(state.backfill.mock.calls[0][0]).toEqual([
      { base: 'THB', quotes: ['USD'], from: '2026-08-10', to: '2026-08-17' },
    ]);
    await waitFor(() => expect(result.current.rates).toEqual([usdRate()]));
  });

  it('stays syncing and avoids duplicate chunks when history updates mid-backfill', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.readRates.mockResolvedValue({ rates: [], refreshFailed: false });
    const backfill = deferred<{
      completed: Array<{ base: string; quotes: string[]; from: string; to: string }>;
      failed: [];
    }>();
    state.backfill.mockReturnValue(backfill.promise);
    const { wrapper } = createHarness();
    const rendered = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    expect(rendered.result.current.status).toBe('syncing');
    act(() => {
      state.history.meta = {
        ...state.history.meta,
        capturedAt: '2026-08-17T10:01:00.000Z',
      };
      rendered.rerender();
    });

    expect(rendered.result.current.status).toBe('syncing');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(state.backfill).toHaveBeenCalledTimes(1);
    backfill.resolve({
      completed: [state.backfill.mock.calls[0][0][0]],
      failed: [],
    });
  });

  it('keeps a replacement currency scope syncing while prior work settles', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.readRates.mockResolvedValue({ rates: [], refreshFailed: false });
    const backfill = deferred<{
      completed: Array<{ base: string; quotes: string[]; from: string; to: string }>;
      failed: [];
    }>();
    state.backfill.mockReturnValue(backfill.promise);
    const { wrapper } = createHarness();
    const rendered = renderHook(
      ({ baseCurrency }) => useAnalyticsSync(baseCurrency),
      { initialProps: { baseCurrency: 'THB' }, wrapper },
    );

    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    act(() => rendered.rerender({ baseCurrency: 'USD' }));
    await waitFor(async () =>
      expect(await db.settings.get('analytics-sync:sheet-a:USD')).toBeDefined(),
    );
    expect(rendered.result.current.status).toBe('syncing');

    backfill.resolve({
      completed: [state.backfill.mock.calls[0][0][0]],
      failed: [],
    });
    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));
  });

  it('waits offline without starting background requests', async () => {
    state.isOnline = false;
    state.history.isOnline = false;
    state.history.isDownloading = false;
    state.readRates.mockResolvedValue({ rates: [], refreshFailed: false });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(state.readRates).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('offline');
    expect(state.backfill).not.toHaveBeenCalled();
  });

  it('immediately schedules a newly observed foreign transaction, including a transfer', async () => {
    state.history.records = [transaction('THB')];
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.readRates.mockResolvedValue({ rates: [], refreshFailed: false });
    const { wrapper } = createHarness();
    const { rerender } = renderHook(() => useAnalyticsSync('THB'), { wrapper });
    await waitFor(() => expect(state.historyEnabled).toHaveBeenCalledWith(true));
    expect(state.backfill).not.toHaveBeenCalled();

    act(() => {
      state.history.records = [
        transaction('THB'),
        transaction('EUR', 'transfer'),
      ];
      rerender();
    });

    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    expect(state.backfill.mock.calls[0][0]).toEqual([
      { base: 'THB', quotes: ['EUR'], from: '2026-08-10', to: '2026-08-17' },
    ]);
  });

  it('records completion only after fresh history and every rate are available', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(result.current.rates).toEqual([usdRate()]));
    await waitFor(async () =>
      expect(await db.settings.get('analytics-sync:sheet-a:THB')).toBeDefined(),
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(result.current.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const stored = await db.settings.get('analytics-sync:sheet-a:THB');
    expect(JSON.parse(stored?.value ?? '{}').requirementsFingerprint).toMatch(
      /^1:[0-9a-f]{16}$/,
    );
  });

  it('does not reuse a prior synced marker after the current history refresh fails', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    const { wrapper } = createHarness();
    const rendered = renderHook(() => useAnalyticsSync('THB'), { wrapper });
    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));

    act(() => {
      state.history.remoteStatus = 'error';
      state.history.remoteError = new Error('Google unavailable');
      rendered.rerender();
    });

    expect(rendered.result.current.status).toBe('incomplete');
  });

  it('reports one metadata write failure without retrying in a render loop', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.metadataWriteError = new Error('IndexedDB unavailable');
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(state.metadataWriteCount).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.status).toBe('incomplete'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.metadataWriteCount).toBe(1);
  });

  it('replaces a stale completion marker when local FX requirements change', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    const { wrapper } = createHarness();
    const rendered = renderHook(() => useAnalyticsSync('THB'), { wrapper });

    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));
    const firstRecord = await db.settings.get('analytics-sync:sheet-a:THB');
    const firstFingerprint = JSON.parse(
      firstRecord?.value ?? '{}',
    ).requirementsFingerprint;

    state.readRates.mockResolvedValue({
      rates: [usdRate(), eurRate()],
      refreshFailed: false,
    });
    act(() => {
      state.history.records = [transaction(), transaction('EUR', 'transfer')];
      rendered.rerender();
    });

    await waitFor(async () => {
      const nextRecord = await db.settings.get('analytics-sync:sheet-a:THB');
      expect(JSON.parse(nextRecord?.value ?? '{}').requirementsFingerprint).not.toBe(
        firstFingerprint,
      );
    });
    expect(rendered.result.current.status).toBe('synced');
  });

  it('force-refreshes history and all discovered chunks on manual resync', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.history.refresh.mockResolvedValue({
      data: {
        records: [transaction('EUR')],
        meta: state.history.meta,
      },
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useAnalyticsSync('THB'), { wrapper });
    await waitFor(() => expect(result.current.rates).toEqual([usdRate()]));
    state.backfill.mockClear();

    act(() => result.current.resync());

    await waitFor(() => expect(state.history.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    expect(state.backfill.mock.calls[0][0]).toEqual([
      {
        base: 'THB',
        quotes: ['EUR', 'USD'],
        from: '2026-08-10',
        to: '2026-08-17',
      },
    ]);
  });

  it('does not start automatic and forced backfills concurrently', async () => {
    state.history.records = [transaction('THB')];
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.readRates.mockResolvedValue({ rates: [], refreshFailed: false });
    const refresh = deferred<{
      data: { records: TransactionRecord[]; meta: typeof state.history.meta };
    }>();
    state.history.refresh.mockReturnValue(refresh.promise);
    const { wrapper } = createHarness();
    const rendered = renderHook(() => useAnalyticsSync('THB'), { wrapper });
    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));
    state.backfill.mockClear();

    act(() => rendered.result.current.resync());
    await waitFor(() => expect(state.history.refresh).toHaveBeenCalledTimes(1));
    act(() => {
      state.history.records = [transaction('THB'), transaction('EUR')];
      rendered.rerender();
    });
    await waitFor(() => expect(state.readRates).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(state.backfill).not.toHaveBeenCalled();

    await act(async () => {
      refresh.resolve({
        data: { records: [transaction('EUR')], meta: state.history.meta },
      });
    });
    await waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
  });

  it('reports an incomplete manual resync when a forced rate refresh fails', async () => {
    state.history.isDownloading = false;
    state.history.remoteStatus = 'success';
    state.history.refresh.mockResolvedValue({
      data: { records: state.history.records, meta: state.history.meta },
    });
    const { wrapper } = createHarness();
    const rendered = renderHook(
      ({ baseCurrency }) => useAnalyticsSync(baseCurrency),
      { initialProps: { baseCurrency: 'THB' }, wrapper },
    );
    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));
    state.backfill.mockResolvedValue({
      completed: [],
      failed: [
        {
          request: { base: 'THB', quotes: ['USD'], from: '2026-08-10', to: '2026-08-17' },
          error: new Error('provider unavailable'),
        },
      ],
    });

    act(() => rendered.result.current.resync());

    await waitFor(() => expect(rendered.result.current.isResyncing).toBe(false));
    await waitFor(() => expect(rendered.result.current.status).toBe('incomplete'));
    expect(await db.settings.get('analytics-sync:sheet-a:THB')).toBeUndefined();

    act(() => rendered.rerender({ baseCurrency: 'USD' }));
    await waitFor(() => expect(rendered.result.current.status).toBe('synced'));
    expect(await db.settings.get('analytics-sync:sheet-a:USD')).toBeDefined();
  });
});
