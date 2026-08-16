import { useMutation } from '@tanstack/react-query';
import { useUpdateOnboarding } from './useOnboardingQuery';
import type { AccountItem } from '../lib/types';
import {
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_ACCOUNT_COLOR,
} from '../lib/icons';

type AddAccountParams = { name: string };
type RemoveAccountParams = { name: string };
type UpdateAccountMetaParams = { name: string; icon?: string; color?: string };
type ReorderAccountsParams = { accounts: AccountItem[] };

export function useAccountMutations(onToast: (message: string) => void) {
  const { mutateAsync: updateOnboarding } = useUpdateOnboarding();

  const addAccount = useMutation({
    mutationFn: async ({ name }: AddAccountParams) => {
      const newAccount: AccountItem = {
        name,
        icon: DEFAULT_ACCOUNT_ICON,
        color: DEFAULT_ACCOUNT_COLOR,
      };
      return updateOnboarding((current) => ({
        accounts: [...current.accounts, newAccount],
        accountsConfirmed: true,
      }));
    },
    onError: () => onToast("Failed to add account"),
  });

  const removeAccount = useMutation({
    mutationFn: async ({ name }: RemoveAccountParams) => {
      return updateOnboarding((current) => ({
        accounts: current.accounts.filter((account) => account.name !== name),
        accountsConfirmed: true,
      }));
    },
    onError: () => onToast("Failed to remove account"),
  });

  const updateAccountMeta = useMutation({
    mutationFn: async ({ name, icon, color }: UpdateAccountMetaParams) => {
      return updateOnboarding((current) => ({
        accounts: current.accounts.map((account) =>
          account.name === name
            ? {
                ...account,
                ...(icon !== undefined && { icon }),
                ...(color !== undefined && { color }),
              }
            : account,
        ),
        accountsConfirmed: true,
      }));
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
