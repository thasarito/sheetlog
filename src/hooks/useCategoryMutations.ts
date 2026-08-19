import { useMutation } from '@tanstack/react-query';
import {
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from '../lib/icons';
import type { CategoryItem, TransactionType } from '../lib/types';
import { useUpdateOnboarding } from './useOnboardingQuery';

type AddCategoryParams = {
  name: string;
  categoryType: TransactionType;
  icon?: string;
  color?: string;
};
type RemoveCategoryParams = { name: string; categoryType: TransactionType };
type UpdateCategoryMetaParams = {
  previousName?: string;
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
  const { mutateAsync: updateOnboarding } = useUpdateOnboarding();

  const addCategory = useMutation({
    mutationFn: async ({
      name,
      categoryType,
      icon,
      color,
    }: AddCategoryParams) => {
      const newCategory: CategoryItem = {
        name,
        icon:
          icon ??
          SUGGESTED_CATEGORY_ICONS[name] ??
          DEFAULT_CATEGORY_ICONS[categoryType],
        color:
          color ??
          SUGGESTED_CATEGORY_COLORS[name] ??
          DEFAULT_CATEGORY_COLORS[categoryType],
      };
      return updateOnboarding((current) => ({
        categories: {
          ...current.categories,
          [categoryType]: [...current.categories[categoryType], newCategory],
        },
        categoriesConfirmed: true,
      }));
    },
    onError: () => onToast('Failed to add category'),
  });

  const removeCategory = useMutation({
    mutationFn: async ({ name, categoryType }: RemoveCategoryParams) => {
      return updateOnboarding((current) => ({
        categories: {
          ...current.categories,
          [categoryType]: current.categories[categoryType].filter(
            (category) => category.name !== name,
          ),
        },
        categoriesConfirmed: true,
      }));
    },
    onError: () => onToast('Failed to remove category'),
  });

  const updateCategoryMeta = useMutation({
    mutationFn: async ({
      previousName,
      name,
      categoryType,
      icon,
      color,
    }: UpdateCategoryMetaParams) => {
      const identity = previousName ?? name;
      return updateOnboarding((current) => ({
        categories: {
          ...current.categories,
          [categoryType]: current.categories[categoryType].map((category) =>
            category.name === identity
              ? {
                  ...category,
                  name,
                  ...(icon !== undefined && { icon }),
                  ...(color !== undefined && { color }),
                }
              : category,
          ),
        },
        categoriesConfirmed: true,
      }));
    },
    onError: () => onToast('Failed to update category'),
  });

  const reorderCategories = useMutation({
    mutationFn: async ({
      categories,
      categoryType,
    }: ReorderCategoriesParams) => {
      return updateOnboarding((current) => ({
        categories: {
          ...current.categories,
          [categoryType]: categories,
        },
        categoriesConfirmed: true,
      }));
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
