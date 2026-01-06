import { useQuery } from '@tanstack/react-query';
import { getRecentTransactions } from '../../lib/google';
import type { TransactionRecord } from '../../lib/types';
import { useAuth } from '../providers';

export function useRecentTransactionsQuery(limit: number = 50) {
  const { accessToken, sheetId } = useAuth();

  return useQuery<TransactionRecord[]>({
    queryKey: ['recentTransactions', sheetId, limit],
    queryFn: async () => {
      if (!accessToken || !sheetId) {
        return [];
      }
      return getRecentTransactions(accessToken, sheetId, limit);
    },
    enabled: !!accessToken && !!sheetId,
    // Keep data fresh for 1 minute, but allow stale data usage while offline/loading
    staleTime: 1000 * 60,
  });
}
