import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/db';
import type { QuickNote, QuickNotesConfig, TransactionType } from '../lib/types';

const STORAGE_KEY = 'quickNotes';
const DEFAULT_KEY_PREFIX = 'default';

export const quickNotesKeys = {
  all: ['quickNotes'] as const,
};

async function getQuickNotesConfig(): Promise<QuickNotesConfig> {
  const record = await db.settings.get(STORAGE_KEY);
  if (!record?.value) {
    return {};
  }
  try {
    return JSON.parse(record.value) as QuickNotesConfig;
  } catch {
    return {};
  }
}

async function setQuickNotesConfig(config: QuickNotesConfig): Promise<void> {
  await db.settings.put({
    key: STORAGE_KEY,
    value: JSON.stringify(config),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Build the key for a category's quick notes
 */
export function buildQuickNotesKey(type: TransactionType, categoryName: string): string {
  return `${type}:${categoryName}`;
}

/**
 * Build the key for a transaction type's default quick notes
 */
export function buildDefaultQuickNotesKey(type: TransactionType): string {
  return `${DEFAULT_KEY_PREFIX}:${type}`;
}

/**
 * Query hook to read all quick notes config from IndexedDB
 */
export function useQuickNotesQuery() {
  return useQuery({
    queryKey: quickNotesKeys.all,
    queryFn: getQuickNotesConfig,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Get quick notes for a specific category
 */
export function useQuickNotesForCategory(type: TransactionType, categoryName: string): QuickNote[] {
  const { data: config } = useQuickNotesQuery();
  return getQuickNotesForCategory(config, type, categoryName);
}

/**
 * Mutation hook to update quick notes for a category
 */
export function useUpdateQuickNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      categoryName,
      notes,
    }: {
      type: TransactionType;
      categoryName: string;
      notes: QuickNote[];
    }): Promise<QuickNotesConfig> => {
      const current =
        queryClient.getQueryData<QuickNotesConfig>(quickNotesKeys.all) ?? {};
      const key = buildQuickNotesKey(type, categoryName);
      const next = { ...current, [key]: notes };

      await setQuickNotesConfig(next);
      return next;
    },
    onMutate: async ({ type, categoryName, notes }) => {
      await queryClient.cancelQueries({ queryKey: quickNotesKeys.all });

      const previous = queryClient.getQueryData<QuickNotesConfig>(quickNotesKeys.all);
      const key = buildQuickNotesKey(type, categoryName);

      if (previous) {
        queryClient.setQueryData(quickNotesKeys.all, { ...previous, [key]: notes });
      }

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(quickNotesKeys.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: quickNotesKeys.all });
    },
  });
}

/**
 * Mutation hook to update default quick notes for a transaction type
 */
export function useUpdateDefaultQuickNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      notes,
    }: {
      type: TransactionType;
      notes: QuickNote[];
    }): Promise<QuickNotesConfig> => {
      const current =
        queryClient.getQueryData<QuickNotesConfig>(quickNotesKeys.all) ?? {};
      const key = buildDefaultQuickNotesKey(type);
      const next = { ...current, [key]: notes };

      await setQuickNotesConfig(next);
      return next;
    },
    onMutate: async ({ type, notes }) => {
      await queryClient.cancelQueries({ queryKey: quickNotesKeys.all });

      const previous = queryClient.getQueryData<QuickNotesConfig>(quickNotesKeys.all);
      const key = buildDefaultQuickNotesKey(type);

      if (previous) {
        queryClient.setQueryData(quickNotesKeys.all, { ...previous, [key]: notes });
      }

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(quickNotesKeys.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: quickNotesKeys.all });
    },
  });
}

/**
 * Helper to get quick notes for a category from config
 */
export function getQuickNotesForCategory(
  config: QuickNotesConfig | undefined,
  type: TransactionType,
  categoryName: string
): QuickNote[] {
  if (!config) return [];
  const categoryKey = buildQuickNotesKey(type, categoryName);
  const categoryNotes = config[categoryKey];
  if (categoryNotes !== undefined) return categoryNotes;

  const defaultKey = buildDefaultQuickNotesKey(type);
  return config[defaultKey] ?? [];
}

export function getDefaultQuickNotes(
  config: QuickNotesConfig | undefined,
  type: TransactionType
): QuickNote[] {
  if (!config) return [];
  const defaultKey = buildDefaultQuickNotesKey(type);
  return config[defaultKey] ?? [];
}
