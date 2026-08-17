import { useQuery } from '@tanstack/react-query';
import { useConnectivity } from '../../app/providers';
import {
  loadHistoricalRates,
  type HistoricalRateRequest,
} from './exchangeRates';

export const exchangeRateKeys = {
  all: ['exchangeRates'] as const,
  historical: (request: HistoricalRateRequest | null) =>
    request
      ? ([
          ...exchangeRateKeys.all,
          request.base,
          [...new Set(request.quotes)].sort(),
          request.from,
          request.to,
        ] as const)
      : ([...exchangeRateKeys.all, 'idle'] as const),
};

export function useHistoricalRatesQuery(
  request: HistoricalRateRequest | null,
  enabled: boolean,
) {
  const { isOnline } = useConnectivity();
  return useQuery({
    queryKey: exchangeRateKeys.historical(request),
    queryFn: () => {
      if (!request) return Promise.resolve({ rates: [], refreshFailed: false });
      return loadHistoricalRates(request, { isOnline });
    },
    enabled: enabled && request !== null,
    networkMode: 'always',
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
    retry: false,
  });
}
