import { useQuery } from '@tanstack/react-query';
import { getRecentTransactions as realGetRecentTransactions } from '../../lib/google';
import type { TransactionRecord } from '../../lib/types';
import { IS_DEV_MODE, getRecentTransactions as mockGetRecentTransactions } from '../../lib/mock';
import { useSession, useWorkspace } from '../../app/providers';
import { transactionQueryKeys } from './transactionQueryKeys';

const getRecentTransactions = IS_DEV_MODE ? mockGetRecentTransactions : realGetRecentTransactions;

export function useRecentTransactionsQuery(limit: number = 50) {
  const { accessToken, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId = userProfile?.id ?? null;

  return useQuery<TransactionRecord[]>({
    queryKey: transactionQueryKeys.recent(sheetId, userId, limit),
    queryFn: async () => {
      if (!accessToken || !sheetId) {
        return [];
      }
      return getRecentTransactions(accessToken, sheetId, limit);
    },
    enabled: Boolean(accessToken && sheetId && userId),
    // Keep data fresh for 1 minute, but allow stale data usage while offline/loading
    staleTime: 1000 * 60,
  });
}
