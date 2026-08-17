import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useHistoricalRatesQuery } from './exchangeRateQueries';
import { readHistoricalRates } from './exchangeRates';

vi.mock('./exchangeRates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exchangeRates')>()),
  readHistoricalRates: vi.fn().mockResolvedValue({
    rates: [],
    refreshFailed: false,
  }),
}));

describe('useHistoricalRatesQuery', () => {
  it('reads only the local FX cache when a transaction list is rendered', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    const request = {
      base: 'THB',
      quotes: ['USD'],
      from: '2026-08-10',
      to: '2026-08-17',
    };

    const { result } = renderHook(() => useHistoricalRatesQuery(request, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readHistoricalRates).toHaveBeenCalledWith(request);
  });
});
