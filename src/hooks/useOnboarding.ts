import { onlineManager } from '@tanstack/react-query';
import { useRef } from 'react';
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
  const importAttemptRef = useRef(0);
  const importErrorRef = useRef<unknown>(importMutation.error);
  importErrorRef.current = importMutation.error;
  const onboarding = onboardingQuery.data ?? getDefaultOnboardingState();
  const retainedSettingsSyncResult = settingsSyncQuery.data ?? undefined;
  const settingsSyncResult =
    settingsSyncQuery.error || importMutation.error
      ? undefined
      : retainedSettingsSyncResult;
  const settingsSyncState =
    settingsStateQuery.data ?? retainedSettingsSyncResult?.state ?? null;
  const operationError =
    onboardingQuery.error ??
    settingsStateQuery.error ??
    importMutation.error ??
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
    const failedImportAtStart = importErrorRef.current;
    const importAttemptAtStart = importAttemptRef.current;
    const refreshed = await settingsSyncQuery.refetch({ throwOnError: true });
    if (
      failedImportAtStart &&
      importAttemptRef.current === importAttemptAtStart &&
      importErrorRef.current === failedImportAtStart
    ) {
      importErrorRef.current = null;
      importMutation.reset();
    }
    return refreshed.data ?? undefined;
  };

  const importLegacyQuickNotes = async () => {
    importAttemptRef.current += 1;
    return importMutation.mutateAsync();
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
    importLegacyQuickNotes,
    isImportingLegacyQuickNotes: importMutation.isPending,
  };
}
