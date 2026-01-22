import { useMutation, useQueryClient } from '@tanstack/react-query';
import { onboardingKeys, useUpdateOnboarding } from './useOnboardingQuery';
import type { OnboardingState, AccountItem } from '../lib/types';
import { useWorkspace } from '../app/providers';
import {
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_ACCOUNT_COLOR,
} from '../lib/icons';

type AddAccountParams = { name: string };
type RemoveAccountParams = { name: string };
type UpdateAccountMetaParams = { name: string; icon?: string; color?: string };
type ReorderAccountsParams = { accounts: AccountItem[] };

export function useAccountMutations(onToast: (message: string) => void) {
  const queryClient = useQueryClient();
  const { sheetId } = useWorkspace();
  const { mutateAsync: updateOnboarding } = useUpdateOnboarding();

  const getCurrentAccounts = (): AccountItem[] => {
    const state = queryClient.getQueryData<OnboardingState>(
      onboardingKeys.state(sheetId)
    );
    return state?.accounts ?? [];
  };

  const addAccount = useMutation({
    mutationFn: async ({ name }: AddAccountParams) => {
      const accounts = getCurrentAccounts();
      const newAccount: AccountItem = {
        name,
        icon: DEFAULT_ACCOUNT_ICON,
        color: DEFAULT_ACCOUNT_COLOR,
      };
      return updateOnboarding({
        accounts: [...accounts, newAccount],
        accountsConfirmed: true,
      });
    },
    onError: () => onToast("Failed to add account"),
  });

  const removeAccount = useMutation({
    mutationFn: async ({ name }: RemoveAccountParams) => {
      const accounts = getCurrentAccounts();
      return updateOnboarding({
        accounts: accounts.filter((a) => a.name !== name),
        accountsConfirmed: true,
      });
    },
    onError: () => onToast("Failed to remove account"),
  });

  const updateAccountMeta = useMutation({
    mutationFn: async ({ name, icon, color }: UpdateAccountMetaParams) => {
      const accounts = getCurrentAccounts();
      const updated = accounts.map((a) =>
        a.name === name
          ? {
              ...a,
              ...(icon !== undefined && { icon }),
              ...(color !== undefined && { color }),
            }
          : a
      );
      return updateOnboarding({
        accounts: updated,
        accountsConfirmed: true,
      });
    },
    onError: () => onToast("Failed to update account"),
  });

  const reorderAccounts = useMutation({
    mutationFn: async ({ accounts }: ReorderAccountsParams) => {
      return updateOnboarding({
        accounts,
        accountsConfirmed: true,
      });
    },
    onError: () => onToast("Failed to reorder accounts"),
  });

  const isSaving =
    addAccount.isPending ||
    removeAccount.isPending ||
    updateAccountMeta.isPending ||
    reorderAccounts.isPending;

  return {
    addAccount,
    removeAccount,
    updateAccountMeta,
    reorderAccounts,
    isSaving,
  };
}
