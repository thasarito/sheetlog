import type { HistoricalRateRequest } from './exchangeRates';

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
