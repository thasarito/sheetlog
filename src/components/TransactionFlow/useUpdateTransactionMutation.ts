import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TransactionInput } from '../../lib/types';
import { useTransactions } from '../providers';

export function useUpdateTransactionMutation() {
  const { updateTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      sheetRow,
      input,
    }: {
      id: string;
      sheetRow?: number;
      input: Partial<TransactionInput>;
    }) => {
      await updateTransaction(id, input, sheetRow);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['recentTransactions'] });
    },
  });
}
