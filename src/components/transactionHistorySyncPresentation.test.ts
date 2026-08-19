import { describe, expect, it } from 'vitest';
import {
  getTransactionHistorySyncDetail,
  isTransactionHistorySyncBusy,
} from './transactionHistorySyncPresentation';

const formatSavedAt = () => 'Aug 19, 13:42';
const base = {
  transactionCount: 327,
  capturedAt: '2026-08-19T13:42:00.000Z',
  status: 'synced' as const,
  isLoading: false,
  isDownloading: false,
  isRefreshing: false,
  isResyncing: false,
};

describe('transactionHistorySyncPresentation', () => {
  it('shows the unfiltered count and last saved timestamp', () => {
    expect(getTransactionHistorySyncDetail(base, formatSavedAt)).toBe(
      '327 transactions · Last saved Aug 19, 13:42',
    );
  });

  it('uses the singular transaction label', () => {
    expect(
      getTransactionHistorySyncDetail(
        { ...base, transactionCount: 1 },
        formatSavedAt,
      ),
    ).toBe('1 transaction · Last saved Aug 19, 13:42');
  });

  it('prioritizes active refresh over a saved timestamp', () => {
    const state = { ...base, isRefreshing: true };
    expect(getTransactionHistorySyncDetail(state, formatSavedAt)).toBe(
      '327 transactions · Updating…',
    );
    expect(isTransactionHistorySyncBusy(state)).toBe(true);
  });

  it('reports an initial history download', () => {
    const state = {
      ...base,
      capturedAt: undefined,
      status: 'syncing' as const,
      isDownloading: true,
    };
    expect(getTransactionHistorySyncDetail(state, formatSavedAt)).toBe(
      '327 transactions · Downloading…',
    );
    expect(isTransactionHistorySyncBusy(state)).toBe(true);
  });

  it('reports offline state before stale or loading metadata', () => {
    expect(
      getTransactionHistorySyncDetail(
        {
          ...base,
          status: 'offline',
          isLoading: true,
          isDownloading: true,
          isRefreshing: true,
          isResyncing: true,
        },
        formatSavedAt,
      ),
    ).toBe('327 transactions · Offline');
    expect(
      isTransactionHistorySyncBusy({
        ...base,
        status: 'offline',
        isLoading: true,
        isDownloading: true,
        isRefreshing: true,
        isResyncing: true,
      }),
    ).toBe(false);
  });

  it('reports when history has not been downloaded', () => {
    expect(
      getTransactionHistorySyncDetail(
        {
          ...base,
          transactionCount: 0,
          capturedAt: undefined,
          status: 'incomplete',
        },
        formatSavedAt,
      ),
    ).toBe('0 transactions · Not downloaded');
  });

  it('falls back safely for invalid counts and timestamps', () => {
    expect(
      getTransactionHistorySyncDetail(
        {
          ...base,
          transactionCount: Number.NaN,
          capturedAt: 'not-a-date',
          status: 'incomplete',
        },
        formatSavedAt,
      ),
    ).toBe('0 transactions · Not downloaded');
  });
});
