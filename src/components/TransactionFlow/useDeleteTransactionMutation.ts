import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTransactions } from '../providers';

export function useDeleteTransactionMutation() {
  const { deleteTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, sheetRow }: { id: string; sheetRow?: number }) => {
      return deleteTransaction(id, sheetRow);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['recentTransactions'] });
    },
  });
}
