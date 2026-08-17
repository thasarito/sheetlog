import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession, useWorkspace, useConnectivity } from '../app/providers';
import { getSessionTokenGeneration } from '../app/providers/session/session.generation';
import {
  readAnalyticsBaseCurrencySetting as readRealAnalyticsBaseCurrencySetting,
  writeAnalyticsBaseCurrencySetting as writeRealAnalyticsBaseCurrencySetting,
} from '../lib/google';
import { isGoogleAuthError } from '../lib/googleErrors';
import {
  IS_DEV_MODE,
  readAnalyticsBaseCurrencySetting as readMockAnalyticsBaseCurrencySetting,
  writeAnalyticsBaseCurrencySetting as writeMockAnalyticsBaseCurrencySetting,
} from '../lib/mock';
import { mergeOnboardingState } from '../lib/onboarding';
import {
  mutateLocalOnboarding,
  mutatePreSheetOnboarding,
  readLocalOnboardingState,
  readPreSheetOnboardingState,
} from '../lib/settingsLocalRepository';
import { runSettingsReconciliation } from '../lib/settingsReconciliationRunner';
import type { SettingsReconciliationResult } from '../lib/settingsReconciliation';
import { createQuickNotesQuerySnapshot } from '../lib/quickNotesView';
import {
  countRememberedSettingsWorkspaces,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
} from '../lib/settingsSync';
import type { OnboardingState } from '../lib/types';

const readAnalyticsBaseCurrencySetting = IS_DEV_MODE
  ? readMockAnalyticsBaseCurrencySetting
  : readRealAnalyticsBaseCurrencySetting;
const writeAnalyticsBaseCurrencySetting = IS_DEV_MODE
  ? writeMockAnalyticsBaseCurrencySetting
  : writeRealAnalyticsBaseCurrencySetting;

export const settingsKeys = {
  all: ['settings'] as const,
  sync: (sheetId: string | null, userId: string | null) =>
    ['settings', 'sync', sheetId, userId] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['settings', 'state', sheetId, userId] as const,
  mutationRevision: (sheetId: string | null, userId: string | null) =>
    ['settings', 'mutationRevision', sheetId, userId] as const,
  completedRevision: (sheetId: string | null, userId: string | null) =>
    ['settings', 'completedRevision', sheetId, userId] as const,
  claimedRevision: (sheetId: string | null, userId: string | null) =>
    ['settings', 'claimedRevision', sheetId, userId] as const,
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
  void queryClient.invalidateQueries({
    queryKey: settingsKeys.sync(sheetId, userId),
    exact: true,
    refetchType: 'none',
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
  const quickNotes = createQuickNotesQuerySnapshot(
    scopedQuickNotes,
    scopedQuickNotes === null ? await readLegacyQuickNotesConfig() : null,
  );
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

async function reconcileAnalyticsBaseCurrency(
  accessToken: string,
  sheetId: string,
  userId: string,
): Promise<void> {
  const remoteSetting = await readAnalyticsBaseCurrencySetting(
    accessToken,
    sheetId,
  );
  const remoteConfig = remoteSetting
    ? { analyticsBaseCurrency: remoteSetting }
    : {};
  const current = await readLocalOnboardingState(sheetId);
  if (mergeOnboardingState(current, remoteConfig).changed) {
    await mutateLocalOnboarding(sheetId, userId, (latest) =>
      mergeOnboardingState(latest, remoteConfig).next,
    );
  }

  const latest = await readLocalOnboardingState(sheetId);
  const result = mergeOnboardingState(latest, remoteConfig);
  if (result.settingsNeedPush && result.next.analyticsBaseCurrencyUpdatedAt) {
    await writeAnalyticsBaseCurrencySetting(accessToken, sheetId, {
      currency: result.next.analyticsBaseCurrency,
      updatedAt: result.next.analyticsBaseCurrencyUpdatedAt,
    });
  }
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
  const completedRevisionQuery = useQuery({
    queryKey: settingsKeys.completedRevision(sheetId, userId),
    queryFn: () => 0,
    initialData: 0,
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const claimedRevisionQuery = useQuery({
    queryKey: settingsKeys.claimedRevision(sheetId, userId),
    queryFn: () => 0,
    initialData: 0,
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

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
      const revisionAtStart =
        queryClient.getQueryData<number>(
          settingsKeys.mutationRevision(sheetId, userId),
        ) ?? 0;
      try {
        const result = await runSettingsReconciliation({
          accessToken,
          sheetId,
          verifiedUserId: userId,
          verifiedWorkspaceCount: rememberedWorkspaceCount(sheetId, userId),
          signOut,
        });
        await reconcileAnalyticsBaseCurrency(accessToken, sheetId, userId);
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          sessionGeneration,
        );
        if (sessionGenerationIsCurrent(sessionGeneration)) {
          queryClient.setQueryData<number>(
            settingsKeys.completedRevision(sheetId, userId),
            (current = 0) => Math.max(current, revisionAtStart),
          );
        }
        return result;
      } catch (error) {
        if (isGoogleAuthError(error)) {
          signOut(accessToken);
        }
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

  useEffect(() => {
    const state = settingsStateQuery.data;
    const mutationRevision = mutationRevisionQuery.data;
    if (
      !enabled ||
      syncQuery.isFetching ||
      !state ||
      mutationRevision <= completedRevisionQuery.data ||
      mutationRevision <= claimedRevisionQuery.data
    ) {
      return;
    }
    let claimed = false;
    queryClient.setQueryData<number>(
      settingsKeys.claimedRevision(sheetId, userId),
      (current = 0) => {
        if (current >= mutationRevision) return current;
        claimed = true;
        return mutationRevision;
      },
    );
    if (claimed) {
      void syncQuery.refetch({ cancelRefetch: false });
    }
  }, [
    claimedRevisionQuery.data,
    completedRevisionQuery.data,
    enabled,
    mutationRevisionQuery.data,
    queryClient,
    sheetId,
    settingsStateQuery.data,
    syncQuery.isFetching,
    syncQuery.refetch,
    userId,
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
