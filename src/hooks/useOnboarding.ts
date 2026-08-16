import { onlineManager } from '@tanstack/react-query';
import { getDefaultOnboardingState } from '../lib/settings';
import type {
  SettingsReconciliationResult,
  SettingsReconciliationStatus,
} from '../lib/settingsReconciliation';
import type { SettingsSyncState } from '../lib/settingsSync';
import {
  useImportLegacyQuickNotes,
  useOnboardingQuery,
  useOnboardingSync,
  useSettingsStateQuery,
  useUpdateOnboarding,
} from './useOnboardingQuery';

export function deriveSettingsSyncStatus(
  state: SettingsSyncState | null | undefined,
  result: SettingsReconciliationResult | null | undefined,
  error: unknown,
): SettingsReconciliationStatus {
  if (
    error ||
    result?.status === 'error' ||
    (state && Object.keys(state.errors).length > 0)
  ) {
    return 'error';
  }
  if (
    !state ||
    state.dirty.length > 0 ||
    state.quickNotesMigration !== undefined ||
    result?.status === 'pending'
  ) {
    return 'pending';
  }
  return 'synced';
}

export function useOnboarding() {
  const onboardingQuery = useOnboardingQuery();
  const settingsStateQuery = useSettingsStateQuery();
  const settingsSyncQuery = useOnboardingSync();
  const updateMutation = useUpdateOnboarding();
  const importMutation = useImportLegacyQuickNotes();
  const onboarding = onboardingQuery.data ?? getDefaultOnboardingState();
  const settingsSyncResult = settingsSyncQuery.data ?? undefined;
  const settingsSyncState =
    settingsStateQuery.data ?? settingsSyncResult?.state ?? null;
  const currentImportError =
    importMutation.error &&
    settingsSyncQuery.dataUpdatedAt <= importMutation.submittedAt
      ? importMutation.error
      : null;
  const operationError =
    onboardingQuery.error ??
    settingsStateQuery.error ??
    currentImportError ??
    settingsSyncQuery.error;
  const settingsSyncStatus = deriveSettingsSyncStatus(
    settingsSyncState,
    settingsSyncResult,
    operationError,
  );
  const durableError = settingsSyncState
    ? Object.values(settingsSyncState.errors)[0]
    : undefined;
  const settingsSyncError =
    operationError instanceof Error
      ? operationError
      : durableError
        ? new Error(durableError)
        : null;
  const legacyQuickNotesMigration = settingsSyncState?.quickNotesMigration;

  const refreshSettings = async () => {
    if (!onlineManager.isOnline()) {
      throw new Error('Go online to refresh settings from Google Sheets.');
    }
    const refreshed = await settingsSyncQuery.refetch({ throwOnError: true });
    return refreshed.data ?? undefined;
  };

  return {
    onboarding,
    isLoading: onboardingQuery.isLoading,
    isSyncing: settingsSyncQuery.isFetching || importMutation.isPending,
    updateOnboarding: updateMutation.mutateAsync,
    refreshSettings,
    refreshOnboarding: async () => {
      const result = await refreshSettings();
      return Boolean(
        result?.changed.some(
          (section) => section === 'accounts' || section === 'categories',
        ),
      );
    },
    settingsSyncResult,
    settingsSyncState,
    settingsSyncStatus,
    settingsSyncError,
    legacyQuickNotesMigration,
    hasLegacyQuickNotesMigrationPrompt:
      legacyQuickNotesMigration?.intent === 'prompt',
    importLegacyQuickNotes: importMutation.mutateAsync,
    isImportingLegacyQuickNotes: importMutation.isPending,
  };
}
