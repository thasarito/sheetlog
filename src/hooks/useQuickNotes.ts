import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession, useWorkspace } from '../app/providers';
import { getSessionTokenGeneration } from '../app/providers/session/session.generation';
import {
  mutateLegacyQuickNotes,
  mutateLocalQuickNotes,
} from '../lib/settingsLocalRepository';
import {
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
} from '../lib/settingsSync';
import {
  createQuickNotesQuerySnapshot,
  type QuickNotesQuerySnapshot,
} from '../lib/quickNotesView';
import type { QuickNote, QuickNotesConfig, TransactionType } from '../lib/types';
import {
  publishSettingsLocalMutation,
  settingsKeys,
} from './useOnboardingQuery';

const DEFAULT_KEY_PREFIX = 'default';

export const quickNotesKeys = {
  all: ['quickNotes'] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['quickNotes', 'state', sheetId, userId] as const,
};

export function buildQuickNotesKey(type: TransactionType, categoryName: string): string {
  return `${type}:${categoryName}`;
}

export function buildDefaultQuickNotesKey(type: TransactionType): string {
  return `${DEFAULT_KEY_PREFIX}:${type}`;
}

export function useQuickNotesQuery() {
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  const query = useQuery<QuickNotesQuerySnapshot>({
    queryKey: quickNotesKeys.state(sheetId, userId),
    queryFn: async () => {
      if (sheetId && userId) {
        const scoped = await readQuickNotesConfig(sheetId);
        if (scoped !== null) {
          return createQuickNotesQuerySnapshot(scoped, null);
        }
      }
      return createQuickNotesQuerySnapshot(
        null,
        await readLegacyQuickNotesConfig(),
      );
    },
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  return {
    ...query,
    data: query.data?.config,
    provenance: query.data?.provenance ?? null,
    isLegacyFallback: query.data?.provenance === 'legacy',
  };
}

export function useQuickNotesForCategory(type: TransactionType, categoryName: string): QuickNote[] {
  const { data: config } = useQuickNotesQuery();
  return getQuickNotesForCategory(config, type, categoryName);
}

function useQuickNotesMutationContext() {
  const queryClient = useQueryClient();
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;
  const queryKey = quickNotesKeys.state(sheetId, userId);
  return { queryClient, queryKey, sheetId, userId };
}

async function persistQuickNotesConfig({
  config,
  queryClient,
  queryKey,
  sheetId,
  userId,
}: {
  config: QuickNotesConfig;
  queryClient: ReturnType<typeof useQueryClient>;
  queryKey: ReturnType<typeof quickNotesKeys.state>;
  sheetId: string | null;
  userId: string | null;
}): Promise<QuickNotesConfig> {
  const sessionGeneration = getSessionTokenGeneration();
  if (sheetId && userId) {
    const result = await mutateLocalQuickNotes(
      sheetId,
      userId,
      () => config,
      { legacyFallbackReadOnly: true },
    );
    const next = result.settings.quickNotes;
    if (getSessionTokenGeneration() === sessionGeneration) {
      queryClient.setQueryData(settingsKeys.state(sheetId, userId), result.state);
      queryClient.setQueryData(queryKey, createQuickNotesQuerySnapshot(next, null));
      publishSettingsLocalMutation(
        queryClient,
        sheetId,
        userId,
        sessionGeneration,
      );
    }
    return next;
  }

  const next = await mutateLegacyQuickNotes(() => config);
  if (getSessionTokenGeneration() === sessionGeneration) {
    queryClient.setQueryData(
      queryKey,
      createQuickNotesQuerySnapshot(null, next),
    );
  }
  return next;
}

export function useReplaceQuickNotesConfig() {
  const context = useQuickNotesMutationContext();
  return useMutation({
    mutationFn: ({ config }: { config: QuickNotesConfig }) =>
      persistQuickNotesConfig({ config, ...context }),
    networkMode: 'always',
    retry: false,
  });
}

export function useUpdateQuickNotes() {
  const context = useQuickNotesMutationContext();

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
      const sessionGeneration = getSessionTokenGeneration();
      const key = buildQuickNotesKey(type, categoryName);
      const { queryClient, queryKey, sheetId, userId } = context;
      if (sheetId && userId) {
        const result = await mutateLocalQuickNotes(
          sheetId,
          userId,
          (current) => ({ ...current, [key]: notes }),
          { legacyFallbackReadOnly: true },
        );
        const next = result.settings.quickNotes;
        if (getSessionTokenGeneration() === sessionGeneration) {
          queryClient.setQueryData(settingsKeys.state(sheetId, userId), result.state);
          queryClient.setQueryData(queryKey, createQuickNotesQuerySnapshot(next, null));
          publishSettingsLocalMutation(
            queryClient,
            sheetId,
            userId,
            sessionGeneration,
          );
        }
        return next;
      }
      const next = await mutateLegacyQuickNotes((current) => ({
        ...current,
        [key]: notes,
      }));
      if (getSessionTokenGeneration() === sessionGeneration) {
        queryClient.setQueryData(
          queryKey,
          createQuickNotesQuerySnapshot(null, next),
        );
      }
      return next;
    },
    networkMode: 'always',
    retry: false,
  });
}

export function useUpdateDefaultQuickNotes() {
  const context = useQuickNotesMutationContext();

  return useMutation({
    mutationFn: async ({
      type,
      notes,
    }: {
      type: TransactionType;
      notes: QuickNote[];
    }): Promise<QuickNotesConfig> => {
      const sessionGeneration = getSessionTokenGeneration();
      const key = buildDefaultQuickNotesKey(type);
      const { queryClient, queryKey, sheetId, userId } = context;
      if (sheetId && userId) {
        const result = await mutateLocalQuickNotes(
          sheetId,
          userId,
          (current) => ({ ...current, [key]: notes }),
          { legacyFallbackReadOnly: true },
        );
        const next = result.settings.quickNotes;
        if (getSessionTokenGeneration() === sessionGeneration) {
          queryClient.setQueryData(settingsKeys.state(sheetId, userId), result.state);
          queryClient.setQueryData(queryKey, createQuickNotesQuerySnapshot(next, null));
          publishSettingsLocalMutation(
            queryClient,
            sheetId,
            userId,
            sessionGeneration,
          );
        }
        return next;
      }
      const next = await mutateLegacyQuickNotes((current) => ({
        ...current,
        [key]: notes,
      }));
      if (getSessionTokenGeneration() === sessionGeneration) {
        queryClient.setQueryData(
          queryKey,
          createQuickNotesQuerySnapshot(null, next),
        );
      }
      return next;
    },
    networkMode: 'always',
    retry: false,
  });
}

export function getQuickNotesForCategory(
  config: QuickNotesConfig | undefined,
  type: TransactionType,
  categoryName: string,
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
  type: TransactionType,
): QuickNote[] {
  if (!config) return [];
  const defaultKey = buildDefaultQuickNotesKey(type);
  return config[defaultKey] ?? [];
}
