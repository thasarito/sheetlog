import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSession, useWorkspace, useConnectivity } from '../app/providers';
import { getSessionTokenGeneration } from '../app/providers/session/session.generation';
import {
  mutateLocalOnboarding,
  mutatePreSheetOnboarding,
  readLocalOnboardingState,
  readPreSheetOnboardingState,
} from '../lib/settingsLocalRepository';
import { runSettingsReconciliation } from '../lib/settingsReconciliationRunner';
import type { SettingsReconciliationResult } from '../lib/settingsReconciliation';
import {
  countRememberedSettingsWorkspaces,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
} from '../lib/settingsSync';
import type { OnboardingState } from '../lib/types';

export const settingsKeys = {
  all: ['settings'] as const,
  sync: (sheetId: string | null, userId: string | null) =>
    ['settings', 'sync', sheetId, userId] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['settings', 'state', sheetId, userId] as const,
  mutationRevision: (sheetId: string | null, userId: string | null) =>
    ['settings', 'mutationRevision', sheetId, userId] as const,
};

export const onboardingKeys = {
  all: ['onboarding'] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['onboarding', 'state', sheetId, userId] as const,
  sync: (sheetId: string | null, userId: string | null) =>
    settingsKeys.sync(sheetId, userId),
};

/**
 * Main query that reads onboarding state from IndexedDB
 */
export function useOnboardingQuery() {
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  return useQuery({
    queryKey: onboardingKeys.state(sheetId, userId),
    queryFn: () =>
      sheetId && userId
        ? readLocalOnboardingState(sheetId)
        : readPreSheetOnboardingState(),
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useSettingsStateQuery() {
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  return useQuery({
    queryKey: settingsKeys.state(sheetId, userId),
    queryFn: () =>
      sheetId && userId ? readSettingsSyncState(sheetId, userId) : null,
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

function rememberedWorkspaceCount(sheetId: string, userId: string): number {
  return countRememberedSettingsWorkspaces(
    typeof window === 'undefined' ? null : window.localStorage,
    { verifiedUserId: userId, sheetId },
  );
}

function sessionGenerationIsCurrent(sessionGeneration: number): boolean {
  return getSessionTokenGeneration() === sessionGeneration;
}

export function publishSettingsLocalMutation(
  queryClient: QueryClient,
  sheetId: string,
  userId: string,
  sessionGeneration: number,
): void {
  if (!sessionGenerationIsCurrent(sessionGeneration)) return;
  queryClient.setQueryData<number>(
    settingsKeys.mutationRevision(sheetId, userId),
    (current = 0) => current + 1,
  );
  const syncKey = settingsKeys.sync(sheetId, userId);
  const fetchStatus = queryClient.getQueryState(syncKey)?.fetchStatus;
  void queryClient.invalidateQueries({
    queryKey: syncKey,
    exact: true,
    refetchType:
      fetchStatus === 'fetching' || fetchStatus === 'paused'
        ? 'none'
        : 'active',
  });
}

async function refreshSettingsCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  sheetId: string,
  userId: string,
  sessionGeneration: number,
): Promise<void> {
  if (!sessionGenerationIsCurrent(sessionGeneration)) return;
  const [onboarding, durableState, scopedQuickNotes] = await Promise.all([
    readLocalOnboardingState(sheetId),
    readSettingsSyncState(sheetId, userId),
    readQuickNotesConfig(sheetId),
  ]);
  const quickNotes =
    scopedQuickNotes ?? (await readLegacyQuickNotesConfig()) ?? {};
  if (!sessionGenerationIsCurrent(sessionGeneration)) return;
  queryClient.setQueryData(
    onboardingKeys.state(sheetId, userId),
    onboarding,
  );
  queryClient.setQueryData(
    settingsKeys.state(sheetId, userId),
    durableState,
  );
  queryClient.setQueryData(
    ['quickNotes', 'state', sheetId, userId],
    quickNotes,
  );
}

/**
 * Background sync query for Sheets hydration
 * Only runs when authenticated and online
 */
export function useOnboardingSync() {
  const { accessToken, signOut, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const queryClient = useQueryClient();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;
  const settingsStateQuery = useSettingsStateQuery();
  const mutationRevisionQuery = useQuery({
    queryKey: settingsKeys.mutationRevision(sheetId, userId),
    queryFn: () => 0,
    initialData: 0,
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const wasFetchingRef = useRef(false);
  const fetchStartRevisionRef = useRef(0);
  const queuedRevisionRef = useRef<number | null>(null);
  const followUpRunningRef = useRef(false);

  const enabled = Boolean(
    accessToken && status === 'authenticated' && userId && sheetId,
  );
  const syncQuery = useQuery({
    queryKey: settingsKeys.sync(sheetId, userId),
    queryFn: async () => {
      const sessionGeneration = getSessionTokenGeneration();
      if (!accessToken || !userId || !sheetId) {
        return null;
      }
      try {
        const result = await runSettingsReconciliation({
          accessToken,
          sheetId,
          verifiedUserId: userId,
          verifiedWorkspaceCount: rememberedWorkspaceCount(sheetId, userId),
          signOut,
        });
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          sessionGeneration,
        );
        return result;
      } catch (error) {
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          sessionGeneration,
        );
        throw error;
      }
    },
    enabled,
    networkMode: 'online',
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });

  const scopeKey = `${sheetId ?? ''}\u0000${userId ?? ''}`;
  const scopeResetRef = useRef(scopeKey);
  useEffect(() => {
    if (scopeResetRef.current === scopeKey) {
      return;
    }
    scopeResetRef.current = scopeKey;
    wasFetchingRef.current = false;
    fetchStartRevisionRef.current = 0;
    queuedRevisionRef.current = null;
    followUpRunningRef.current = false;
  }, [scopeKey]);

  useEffect(() => {
    const state = settingsStateQuery.data;
    const hasPrompt = state?.quickNotesMigration?.intent === 'prompt';
    const hasErrors = Boolean(
      syncQuery.error || (state && Object.keys(state.errors).length > 0),
    );
    const hasSafeDirty = Boolean(
      enabled && state && state.dirty.length > 0 && !hasErrors && !hasPrompt,
    );
    if (syncQuery.isFetching) {
      if (!wasFetchingRef.current) {
        wasFetchingRef.current = true;
        fetchStartRevisionRef.current = mutationRevisionQuery.data;
      }
      if (
        hasSafeDirty &&
        mutationRevisionQuery.data > fetchStartRevisionRef.current
      ) {
        queuedRevisionRef.current = mutationRevisionQuery.data;
      }
      return;
    }
    if (wasFetchingRef.current) {
      wasFetchingRef.current = false;
      followUpRunningRef.current = false;
    }
    if (!hasSafeDirty) {
      queuedRevisionRef.current = null;
      return;
    }
    if (queuedRevisionRef.current === null || followUpRunningRef.current) {
      return;
    }
    queuedRevisionRef.current = null;
    followUpRunningRef.current = true;
    void syncQuery.refetch();
  }, [
    enabled,
    mutationRevisionQuery.data,
    settingsStateQuery.data,
    syncQuery.error,
    syncQuery.isFetching,
    syncQuery.refetch,
  ]);

  return syncQuery;
}

export function useImportLegacyQuickNotes() {
  const queryClient = useQueryClient();
  const { accessToken, signOut, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  return useMutation({
    mutationFn: async (): Promise<SettingsReconciliationResult> => {
      const sessionGeneration = getSessionTokenGeneration();
      if (!accessToken || !sheetId || !userId || !isOnline) {
        throw new Error(
          'Go online with a verified Google account and Sheet to import legacy Quick Notes.',
        );
      }
      let result: SettingsReconciliationResult;
      try {
        result = await runSettingsReconciliation({
          accessToken,
          sheetId,
          verifiedUserId: userId,
          verifiedWorkspaceCount: rememberedWorkspaceCount(sheetId, userId),
          importLegacyQuickNotes: true,
          signOut,
        });
      } catch (error) {
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          sessionGeneration,
        );
        throw error;
      }
      if (sessionGenerationIsCurrent(sessionGeneration)) {
        queryClient.setQueryData(settingsKeys.sync(sheetId, userId), result);
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          sessionGeneration,
        );
      }
      return result;
    },
    networkMode: 'online',
    retry: false,
  });
}

export type OnboardingUpdate =
  | Partial<OnboardingState>
  | ((current: OnboardingState) => Partial<OnboardingState> | OnboardingState);

function applyOnboardingUpdate(
  current: OnboardingState,
  update: OnboardingUpdate,
): OnboardingState {
  const patch = typeof update === 'function' ? update(current) : update;
  return { ...current, ...patch };
}

/**
 * Base mutation with optimistic updates for updating onboarding state
 */
export function useUpdateOnboarding() {
  const queryClient = useQueryClient();
  const { accessToken, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;
  const queryKey = onboardingKeys.state(sheetId, userId);

  return useMutation({
    mutationFn: async (update: OnboardingUpdate): Promise<OnboardingState> => {
      const sessionGeneration = getSessionTokenGeneration();
      if (sheetId && userId) {
        const result = await mutateLocalOnboarding(
          sheetId,
          userId,
          (current) => applyOnboardingUpdate(current, update),
        );
        const next = await readLocalOnboardingState(sheetId);
        if (sessionGenerationIsCurrent(sessionGeneration)) {
          queryClient.setQueryData(
            settingsKeys.state(sheetId, userId),
            result.state,
          );
          queryClient.setQueryData(queryKey, next);
          publishSettingsLocalMutation(
            queryClient,
            sheetId,
            userId,
            sessionGeneration,
          );
        }
        return next;
      }
      const next = await mutatePreSheetOnboarding((current) =>
        applyOnboardingUpdate(current, update),
      );
      if (sessionGenerationIsCurrent(sessionGeneration)) {
        queryClient.setQueryData(queryKey, next);
      }
      return next;
    },
    networkMode: 'always',
    retry: false,
  });
}
