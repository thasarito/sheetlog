import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession, useWorkspace, useConnectivity } from '../app/providers';
import { getOnboardingState, setOnboardingState } from '../lib/settings';
import {
  mutateLocalOnboarding,
  readLocalOnboardingState,
} from '../lib/settingsLocalRepository';
import { runSettingsReconciliation } from '../lib/settingsReconciliationRunner';
import type { SettingsReconciliationResult } from '../lib/settingsReconciliation';
import {
  countRememberedSettingsWorkspaces,
  readSettingsSyncState,
  type SettingsSyncState,
} from '../lib/settingsSync';
import type { OnboardingState } from '../lib/types';

export const settingsKeys = {
  all: ['settings'] as const,
  sync: (sheetId: string | null, userId: string | null) =>
    ['settings', 'sync', sheetId, userId] as const,
  state: (sheetId: string | null, userId: string | null) =>
    ['settings', 'state', sheetId, userId] as const,
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
        : getOnboardingState(null),
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

async function refreshSettingsCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  sheetId: string,
  userId: string,
  knownState?: SettingsSyncState,
): Promise<void> {
  const [onboarding, durableState] = await Promise.all([
    readLocalOnboardingState(sheetId),
    knownState
      ? Promise.resolve(knownState)
      : readSettingsSyncState(sheetId, userId),
  ]);
  queryClient.setQueryData(
    onboardingKeys.state(sheetId, userId),
    onboarding,
  );
  queryClient.setQueryData(
    settingsKeys.state(sheetId, userId),
    durableState,
  );
  await queryClient.invalidateQueries({
    queryKey: ['quickNotes', 'state', sheetId, userId],
  });
}

/**
 * Background sync query for Sheets hydration
 * Only runs when authenticated and online
 */
export function useOnboardingSync() {
  const { accessToken, signOut, status, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const userId =
    accessToken && status === 'authenticated' ? userProfile?.id ?? null : null;

  return useQuery({
    queryKey: settingsKeys.sync(sheetId, userId),
    queryFn: async () => {
      if (!accessToken || !userId || !sheetId || !isOnline) {
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
          result.state,
        );
        return result;
      } catch (error) {
        await refreshSettingsCaches(queryClient, sheetId, userId);
        throw error;
      }
    },
    enabled: Boolean(
      accessToken &&
        status === 'authenticated' &&
        userId &&
        sheetId &&
        isOnline,
    ),
    networkMode: 'online',
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
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
      if (!accessToken || !sheetId || !userId || !isOnline) {
        throw new Error(
          'Go online with a verified Google account and Sheet to import legacy Quick Notes.',
        );
      }
      return runSettingsReconciliation({
        accessToken,
        sheetId,
        verifiedUserId: userId,
        verifiedWorkspaceCount: rememberedWorkspaceCount(sheetId, userId),
        importLegacyQuickNotes: true,
        signOut,
      });
    },
    networkMode: 'online',
    retry: false,
    onSuccess: async (result) => {
      if (sheetId && userId) {
        queryClient.setQueryData(settingsKeys.sync(sheetId, userId), result);
        await refreshSettingsCaches(
          queryClient,
          sheetId,
          userId,
          result.state,
        );
      }
    },
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
      if (sheetId && userId) {
        const result = await mutateLocalOnboarding(
          sheetId,
          userId,
          (current) => applyOnboardingUpdate(current, update),
        );
        queryClient.setQueryData(
          settingsKeys.state(sheetId, userId),
          result.state,
        );
        return readLocalOnboardingState(sheetId);
      }
      const current = await getOnboardingState(null);
      const next = applyOnboardingUpdate(current, update);
      await setOnboardingState(next, null);
      return next;
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
