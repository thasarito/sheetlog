import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from '../lib/icons';
import type {
  CategoryConfigWithMeta,
  CategoryItem,
  OnboardingState,
  TransactionType,
} from '../lib/types';
import { onboardingKeys, useUpdateOnboarding } from './useOnboardingQuery';

type AddCategoryParams = { name: string; categoryType: TransactionType };
type RemoveCategoryParams = { name: string; categoryType: TransactionType };
type UpdateCategoryMetaParams = {
  name: string;
  categoryType: TransactionType;
  icon?: string;
  color?: string;
};
type ReorderCategoriesParams = {
  categories: CategoryItem[];
  categoryType: TransactionType;
};

export function useCategoryMutations(onToast: (message: string) => void) {
  const queryClient = useQueryClient();
  const { mutateAsync: updateOnboarding } = useUpdateOnboarding();

  const getCurrentCategories = (): CategoryConfigWithMeta => {
    const state = queryClient.getQueryData<OnboardingState>(onboardingKeys.all);
    return state?.categories ?? { expense: [], income: [], transfer: [] };
  };

  const addCategory = useMutation({
    mutationFn: async ({ name, categoryType }: AddCategoryParams) => {
      const categories = getCurrentCategories();
      const list = categories[categoryType] ?? [];
      const newCategory: CategoryItem = {
        name,
        icon: SUGGESTED_CATEGORY_ICONS[name] || DEFAULT_CATEGORY_ICONS[categoryType],
        color: SUGGESTED_CATEGORY_COLORS[name] || DEFAULT_CATEGORY_COLORS[categoryType],
      };
      return updateOnboarding({
        categories: {
          ...categories,
          [categoryType]: [...list, newCategory],
        },
        categoriesConfirmed: true,
      });
    },
    onError: () => onToast('Failed to add category'),
  });

  const removeCategory = useMutation({
    mutationFn: async ({ name, categoryType }: RemoveCategoryParams) => {
      const categories = getCurrentCategories();
      const list = categories[categoryType] ?? [];
      return updateOnboarding({
        categories: {
          ...categories,
          [categoryType]: list.filter((c) => c.name !== name),
        },
        categoriesConfirmed: true,
      });
    },
    onError: () => onToast('Failed to remove category'),
  });

  const updateCategoryMeta = useMutation({
    mutationFn: async ({ name, categoryType, icon, color }: UpdateCategoryMetaParams) => {
      const categories = getCurrentCategories();
      const list = categories[categoryType] ?? [];
      const updated = list.map((c) =>
        c.name === name
          ? {
              ...c,
              ...(icon !== undefined && { icon }),
              ...(color !== undefined && { color }),
            }
          : c,
      );
      return updateOnboarding({
        categories: {
          ...categories,
          [categoryType]: updated,
        },
        categoriesConfirmed: true,
      });
    },
    onError: () => onToast('Failed to update category'),
  });

  const reorderCategories = useMutation({
    mutationFn: async ({ categories, categoryType }: ReorderCategoriesParams) => {
      const allCategories = getCurrentCategories();
      return updateOnboarding({
        categories: {
          ...allCategories,
          [categoryType]: categories,
        },
        categoriesConfirmed: true,
      });
    },
    onError: () => onToast('Failed to reorder categories'),
  });

  const isSaving =
    addCategory.isPending ||
    removeCategory.isPending ||
    updateCategoryMeta.isPending ||
    reorderCategories.isPending;

  return {
    addCategory,
    removeCategory,
    updateCategoryMeta,
    reorderCategories,
    isSaving,
  };
}
