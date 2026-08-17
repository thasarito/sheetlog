import { useQuery } from '@tanstack/react-query';
import {
  readHistoricalRates,
  type HistoricalRateRequest,
} from './exchangeRates';

export const exchangeRateKeys = {
  all: ['exchangeRates'] as const,
  cached: (request: HistoricalRateRequest | null) =>
    request
      ? ([
          ...exchangeRateKeys.all,
          request.base,
          [...new Set(request.quotes)].sort(),
          request.from,
          request.to,
        ] as const)
      : ([...exchangeRateKeys.all, 'idle'] as const),
  backfill: (sheetId: string | null, base: string, chunkKeys: string[]) =>
    [
      ...exchangeRateKeys.all,
      'backfill',
      sheetId,
      base,
      [...chunkKeys].sort(),
    ] as const,
  historical: (request: HistoricalRateRequest | null) =>
    exchangeRateKeys.cached(request),
};

export function useHistoricalRatesQuery(
  request: HistoricalRateRequest | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: exchangeRateKeys.cached(request),
    queryFn: () =>
      request
        ? readHistoricalRates(request)
        : Promise.resolve({ rates: [], refreshFailed: false }),
    enabled: enabled && request !== null,
    networkMode: 'always',
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
