import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession, useWorkspace } from '../app/providers';
import {
  mutateLegacyQuickNotes,
  mutateLocalQuickNotes,
} from '../lib/settingsLocalRepository';
import {
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
} from '../lib/settingsSync';
import type { QuickNote, QuickNotesConfig, TransactionType } from '../lib/types';
import { settingsKeys } from './useOnboardingQuery';

const DEFAULT_KEY_PREFIX = 'default';

export const quickNotesKeys = {
  all: ['quickNotes'] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['quickNotes', 'state', sheetId, userId] as const,
};

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
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  return useQuery({
    queryKey: quickNotesKeys.state(sheetId, userId),
    queryFn: async () => {
      if (sheetId && userId) {
        const scoped = await readQuickNotesConfig(sheetId);
        if (scoped !== null) return scoped;
      }
      return (await readLegacyQuickNotesConfig()) ?? {};
    },
    networkMode: 'always',
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
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;
  const queryKey = quickNotesKeys.state(sheetId, userId);

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
      const key = buildQuickNotesKey(type, categoryName);
      if (sheetId && userId) {
        const result = await mutateLocalQuickNotes(
          sheetId,
          userId,
          (current) => ({ ...current, [key]: notes }),
        );
        queryClient.setQueryData(
          settingsKeys.state(sheetId, userId),
          result.state,
        );
        return result.settings.quickNotes;
      }
      return mutateLegacyQuickNotes((current) => ({
        ...current,
        [key]: notes,
      }));
    },
    networkMode: 'always',
    retry: false,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      if (sheetId && userId) {
        void queryClient.invalidateQueries({
          queryKey: settingsKeys.sync(sheetId, userId),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}

/**
 * Mutation hook to update default quick notes for a transaction type
 */
export function useUpdateDefaultQuickNotes() {
  const queryClient = useQueryClient();
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;
  const queryKey = quickNotesKeys.state(sheetId, userId);

  return useMutation({
    mutationFn: async ({
      type,
      notes,
    }: {
      type: TransactionType;
      notes: QuickNote[];
    }): Promise<QuickNotesConfig> => {
      const key = buildDefaultQuickNotesKey(type);
      if (sheetId && userId) {
        const result = await mutateLocalQuickNotes(
          sheetId,
          userId,
          (current) => ({ ...current, [key]: notes }),
        );
        queryClient.setQueryData(
          settingsKeys.state(sheetId, userId),
          result.state,
        );
        return result.settings.quickNotes;
      }
      return mutateLegacyQuickNotes((current) => ({
        ...current,
        [key]: notes,
      }));
    },
    networkMode: 'always',
    retry: false,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      if (sheetId && userId) {
        void queryClient.invalidateQueries({
          queryKey: settingsKeys.sync(sheetId, userId),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
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
