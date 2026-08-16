import { useMutation } from '@tanstack/react-query';
import { useUpdateOnboarding } from './useOnboardingQuery';
import type { CategoryItem, TransactionType } from '../lib/types';
import {
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
} from '../lib/icons';

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
  const { mutateAsync: updateOnboarding } = useUpdateOnboarding();

  const addCategory = useMutation({
    mutationFn: async ({ name, categoryType }: AddCategoryParams) => {
      const newCategory: CategoryItem = {
        name,
        icon:
          SUGGESTED_CATEGORY_ICONS[name] ||
          DEFAULT_CATEGORY_ICONS[categoryType],
        color:
          SUGGESTED_CATEGORY_COLORS[name] ||
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
    onError: () => onToast("Failed to add category"),
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
    onError: () => onToast("Failed to remove category"),
  });

  const updateCategoryMeta = useMutation({
    mutationFn: async ({
      name,
      categoryType,
      icon,
      color,
    }: UpdateCategoryMetaParams) => {
      return updateOnboarding((current) => ({
        categories: {
          ...current.categories,
          [categoryType]: current.categories[categoryType].map((category) =>
            category.name === name
              ? {
                  ...category,
                  ...(icon !== undefined && { icon }),
                  ...(color !== undefined && { color }),
                }
              : category,
          ),
        },
        categoriesConfirmed: true,
      }));
    },
    onError: () => onToast("Failed to update category"),
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
    onError: () => onToast("Failed to reorder categories"),
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
