import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSelectedAppId, setSelectedAppId } from '../lib/settings';
import type { SheetlogAppId } from '../lib/sheetlogApps';

export const selectedAppKeys = {
  all: ['selectedApp'] as const,
};

export function useSelectedAppQuery() {
  return useQuery({
    queryKey: selectedAppKeys.all,
    queryFn: getSelectedAppId,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useSetSelectedApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appId: SheetlogAppId | null) => {
      await setSelectedAppId(appId);
      return appId;
    },
    onMutate: async (appId) => {
      await queryClient.cancelQueries({ queryKey: selectedAppKeys.all });
      const previous = queryClient.getQueryData<SheetlogAppId | null>(selectedAppKeys.all) ?? null;
      queryClient.setQueryData(selectedAppKeys.all, appId);
      return { previous };
    },
    onError: (_error, _appId, context) => {
      queryClient.setQueryData(selectedAppKeys.all, context?.previous ?? null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: selectedAppKeys.all });
    },
  });
}
