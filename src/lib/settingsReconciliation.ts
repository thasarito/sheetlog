import type {
  SheetSettingsReadResult,
  SheetSettingsSectionReadResult,
} from './googleSettings';
import { sanitizeQuickNotes } from './quickNoteSheet';
import {
  classifyLegacyQuickNotesMigration,
  clearSettingsSectionDirty,
  clearSettingsSectionError,
  createDefaultSettingsSyncState,
  fingerprintSettingsSection,
  fingerprintQuickNotesConfig,
  markSettingsSectionDirty,
  setSettingsSectionError,
  type LegacyQuickNotesMigrationDecision,
  type QuickNotesMigrationState,
  type SettingsSection,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import type { QuickNotesConfig } from './types';

export interface LocalSettingsSnapshot extends SheetSettingsConfig {
  accountsConfirmed: boolean;
  categoriesConfirmed: boolean;
  quickNotesPresent: boolean;
}

export interface LocalSettingsSectionSnapshot<Section extends SettingsSection> {
  value: SheetSettingsConfig[Section];
  ready: boolean;
}

export interface LocalSettingsCompareAndSetResult {
  applied: boolean;
  settings: LocalSettingsSnapshot;
}

export interface SettingsLocalRepository {
  readSettings(sheetId: string): Promise<LocalSettingsSnapshot>;
  updateSyncState(
    sheetId: string,
    verifiedUserId: string,
    update: (state: SettingsSyncState | null) => SettingsSyncState,
  ): Promise<SettingsSyncState>;
  compareAndSetSection<Section extends SettingsSection>(
    sheetId: string,
    section: Section,
    expected: LocalSettingsSectionSnapshot<Section>,
    value: SheetSettingsConfig[Section],
  ): Promise<LocalSettingsCompareAndSetResult>;
  readLegacyQuickNotes(): Promise<QuickNotesConfig | null>;
  deleteLegacyQuickNotesIfUnchanged(expected: QuickNotesConfig): Promise<boolean>;
}

export interface SettingsRemoteAdapter {
  readSettings(sheetId: string): Promise<SheetSettingsReadResult>;
  readSection<Section extends SettingsSection>(
    sheetId: string,
    section: Section,
  ): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>>;
  replaceSection<Section extends SettingsSection>(
    sheetId: string,
    section: Section,
    value: SheetSettingsConfig[Section],
  ): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>>;
}

export type SettingsReconciliationStatus = 'synced' | 'pending' | 'error';

export interface SettingsReconciliationResult {
  state: SettingsSyncState;
  changed: SettingsSection[];
  pushed: SettingsSection[];
  conflicts: SettingsSection[];
  errors: Partial<Record<SettingsSection, string>>;
  migrationDecision: LegacyQuickNotesMigrationDecision;
  migrationApplied: boolean;
  status: SettingsReconciliationStatus;
}

export interface ReconcileSettingsOptions {
  sheetId: string;
  verifiedUserId: string;
  verifiedWorkspaceCount: number;
  importLegacyQuickNotes?: boolean;
  local: SettingsLocalRepository;
  remote: SettingsRemoteAdapter;
  now?: () => string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Settings sync failed.';
}

function withoutQuickNotesMigration(state: SettingsSyncState): SettingsSyncState {
  const { quickNotesMigration: _migration, ...rest } = state;
  return rest;
}

export async function reconcileSettings(
  options: ReconcileSettingsOptions,
): Promise<SettingsReconciliationResult> {
  const { sheetId, verifiedUserId, local, remote } = options;
  const initialSettings = await local.readSettings(sheetId);
  let state = await local.updateSyncState(sheetId, verifiedUserId, (storedState) => {
    if (storedState) return storedState;
    let initialState = createDefaultSettingsSyncState(verifiedUserId);
    if (initialSettings.accountsConfirmed) {
      initialState = markSettingsSectionDirty(initialState, 'accounts');
    }
    if (initialSettings.categoriesConfirmed) {
      initialState = markSettingsSectionDirty(initialState, 'categories');
    }
    if (initialSettings.quickNotesPresent) {
      initialState = markSettingsSectionDirty(initialState, 'quickNotes');
    }
    return initialState;
  });
  const updateState = async (
    update: (latest: SettingsSyncState) => SettingsSyncState,
  ): Promise<SettingsSyncState> => {
    state = await local.updateSyncState(sheetId, verifiedUserId, (latest) =>
      update(latest ?? createDefaultSettingsSyncState(verifiedUserId)),
    );
    return state;
  };

  const remoteSettings = await remote.readSettings(sheetId);
  let currentSettings = initialSettings;
  const changed: SettingsSection[] = [];
  const pushed: SettingsSection[] = [];
  const conflicts: SettingsSection[] = [];
  const legacyQuickNotes = await local.readLegacyQuickNotes();
  const legacySourceFingerprint = legacyQuickNotes
    ? fingerprintQuickNotesConfig(legacyQuickNotes)
    : null;
  let migrationState: QuickNotesMigrationState | undefined = state.quickNotesMigration;
  const hadPersistedMigrationState = migrationState !== undefined;
  if (!legacyQuickNotes || !legacySourceFingerprint) {
    migrationState = undefined;
  } else if (
    migrationState &&
    migrationState.sourceFingerprint !== legacySourceFingerprint
  ) {
    migrationState = {
      intent: 'prompt',
      sourceFingerprint: legacySourceFingerprint,
    };
  } else if (!migrationState) {
    const classified = classifyLegacyQuickNotesMigration({
      legacyConfig: legacyQuickNotes,
      scopedConfig: initialSettings.quickNotesPresent ? initialSettings.quickNotes : null,
      verifiedWorkspaceCount: options.verifiedWorkspaceCount,
      remoteQuickNoteTabExists: remoteSettings.quickNotes.present,
    });
    migrationState =
      classified === 'none'
        ? undefined
        : { intent: classified, sourceFingerprint: legacySourceFingerprint };
  }
  if (
    options.importLegacyQuickNotes &&
    migrationState?.intent === 'prompt' &&
    legacySourceFingerprint
  ) {
    migrationState = {
      intent: 'explicit-import',
      sourceFingerprint: legacySourceFingerprint,
    };
  }
  await updateState((latest) => {
    let next = migrationState
      ? { ...latest, quickNotesMigration: migrationState }
      : withoutQuickNotesMigration(latest);
    if (migrationState?.intent === 'auto-import' && !hadPersistedMigrationState) {
      next = markSettingsSectionDirty(
        {
          ...next,
          baselines: { ...next.baselines, quickNotes: '' },
        },
        'quickNotes',
      );
    }
    return next;
  });
  let migrationDecision: LegacyQuickNotesMigrationDecision =
    migrationState?.intent === 'auto-import'
      ? 'auto-import'
      : migrationState
        ? 'prompt'
        : 'none';
  let migrationApplied = false;
  let quickNotesMigrationUploadVerified = false;

  const sectionFingerprint = (
    section: SettingsSection,
    value: SheetSettingsConfig[SettingsSection],
  ): string =>
    fingerprintSettingsSection(
      { ...currentSettings, [section]: value } as SheetSettingsConfig,
      section,
    );
  const remember = (list: SettingsSection[], section: SettingsSection): void => {
    if (!list.includes(section)) list.push(section);
  };
  const sectionReady = (
    settings: LocalSettingsSnapshot,
    section: SettingsSection,
  ): boolean => {
    if (section === 'accounts') return settings.accountsConfirmed;
    if (section === 'categories') return settings.categoriesConfirmed;
    return settings.quickNotesPresent;
  };
  const compareAndSetWinner = async <Section extends SettingsSection>(
    section: Section,
    observed: LocalSettingsSnapshot,
    value: SheetSettingsConfig[Section],
  ): Promise<boolean> => {
    const expected = {
      value: observed[section] as SheetSettingsConfig[Section],
      ready: sectionReady(observed, section),
    };
    const valueChanged =
      !expected.ready ||
      fingerprintSettingsSection(observed, section) !==
        fingerprintSettingsSection(
          { ...observed, [section]: value } as SheetSettingsConfig,
          section,
        );
    const result = await local.compareAndSetSection(sheetId, section, expected, value);
    currentSettings = result.settings;
    if (result.applied && valueChanged) remember(changed, section);
    return result.applied;
  };

  for (const section of ['accounts', 'categories', 'quickNotes'] as const) {
    currentSettings = await local.readSettings(sheetId);
    const observedLocalFingerprint = sectionFingerprint(
      section,
      currentSettings[section] as SheetSettingsConfig[SettingsSection],
    );
    await updateState((latest) =>
      sectionReady(currentSettings, section) &&
      observedLocalFingerprint !== latest.baselines[section]
        ? markSettingsSectionDirty(latest, section)
        : latest,
    );

    if (
      section === 'quickNotes' &&
      migrationState?.intent === 'prompt'
    ) {
      const readResult = remoteSettings.quickNotes;
      if (readResult.status === 'invalid') {
        await updateState((latest) =>
          setSettingsSectionError(latest, 'quickNotes', readResult.error),
        );
      } else {
        const remoteFingerprint = readResult.present
          ? sectionFingerprint('quickNotes', readResult.value)
          : '';
        await updateState((latest) => ({
          ...clearSettingsSectionDirty(
            clearSettingsSectionError(latest, 'quickNotes'),
            'quickNotes',
          ),
          baselines: { ...latest.baselines, quickNotes: remoteFingerprint },
        }));
      }
      continue;
    }

    if (
      section === 'quickNotes' &&
      legacyQuickNotes &&
      (migrationState?.intent === 'auto-import' ||
        migrationState?.intent === 'explicit-import')
    ) {
      const imported = await compareAndSetWinner(
        'quickNotes',
        currentSettings,
        legacyQuickNotes,
      );
      const importedFingerprint = sectionFingerprint(
        'quickNotes',
        currentSettings.quickNotes,
      );
      await updateState((latest) =>
        importedFingerprint === latest.baselines.quickNotes
          ? clearSettingsSectionDirty(latest, 'quickNotes')
          : markSettingsSectionDirty(latest, 'quickNotes'),
      );
      migrationApplied = imported;

      if (
        migrationState.intent === 'explicit-import' &&
        remoteSettings.quickNotes.status === 'ok'
      ) {
        const remoteQuickNotesFingerprint = remoteSettings.quickNotes.present
          ? sectionFingerprint('quickNotes', remoteSettings.quickNotes.value)
          : '';
        await updateState((latest) => ({
          ...latest,
          baselines: {
            ...latest.baselines,
            quickNotes: remoteQuickNotesFingerprint,
          },
        }));
      }
    }

    if (section === 'quickNotes' && currentSettings.quickNotesPresent) {
      const sanitized = sanitizeQuickNotes(
        currentSettings.quickNotes,
        currentSettings.accounts,
        currentSettings.categories,
      );
      if (
        sectionFingerprint('quickNotes', sanitized) !==
        sectionFingerprint('quickNotes', currentSettings.quickNotes)
      ) {
        await compareAndSetWinner('quickNotes', currentSettings, sanitized);
        await updateState((latest) => markSettingsSectionDirty(latest, 'quickNotes'));
      }
    }
    let readResult: SheetSettingsSectionReadResult<
      SheetSettingsConfig[SettingsSection]
    > = remoteSettings[section];
    if (readResult.status === 'ok') {
      const localValue = currentSettings[section] as SheetSettingsConfig[SettingsSection];
      const localFingerprint = sectionFingerprint(section, localValue);
      let remoteFingerprint = readResult.present
        ? sectionFingerprint(section, readResult.value)
        : '';
      const baseline = state.baselines[section];
      if (
        section === 'quickNotes' &&
        migrationState &&
        readResult.present &&
        remoteFingerprint === migrationState.sourceFingerprint &&
        localFingerprint === remoteFingerprint
      ) {
        quickNotesMigrationUploadVerified = true;
      }

      if (state.dirty.includes(section)) {
        let initialRemoteMatch =
          baseline === '' && remoteFingerprint !== '' && localFingerprint === remoteFingerprint;
        if (!initialRemoteMatch && baseline === remoteFingerprint) {
          try {
            readResult = await remote.readSection(sheetId, section);
          } catch (error) {
            await updateState((latest) =>
              setSettingsSectionError(latest, section, errorMessage(error)),
            );
            throw error;
          }
          if (readResult.status === 'invalid') {
            const invalidError = readResult.error;
            await updateState((latest) =>
              setSettingsSectionError(latest, section, invalidError),
            );
            continue;
          }
          remoteFingerprint = readResult.present
            ? sectionFingerprint(section, readResult.value)
            : '';
          if (
            section === 'quickNotes' &&
            migrationState &&
            readResult.present &&
            remoteFingerprint === migrationState.sourceFingerprint &&
            localFingerprint === remoteFingerprint
          ) {
            quickNotesMigrationUploadVerified = true;
          }
          initialRemoteMatch =
            baseline === '' &&
            remoteFingerprint !== '' &&
            localFingerprint === remoteFingerprint;
        }
        if (initialRemoteMatch) {
          await updateState((latest) => ({
            ...clearSettingsSectionDirty(clearSettingsSectionError(latest, section), section),
            baselines: { ...latest.baselines, [section]: remoteFingerprint },
          }));
        } else if (baseline === remoteFingerprint) {
          const attemptedValue = localValue;
          let writeResult: SheetSettingsSectionReadResult<
            SheetSettingsConfig[SettingsSection]
          >;
          try {
            writeResult = await remote.replaceSection(sheetId, section, attemptedValue);
          } catch (error) {
            await updateState((latest) =>
              setSettingsSectionError(latest, section, errorMessage(error)),
            );
            throw error;
          }
          if (writeResult.status === 'ok') {
            pushed.push(section);
            const readbackFingerprint = sectionFingerprint(section, writeResult.value);
            const readbackDiverged = readbackFingerprint !== localFingerprint;
            if (readbackDiverged) {
              remember(conflicts, section);
            }
            if (
              section === 'quickNotes' &&
              migrationState &&
              (readbackDiverged ||
                readbackFingerprint !== migrationState.sourceFingerprint)
            ) {
              migrationState = { ...migrationState, intent: 'prompt' };
              migrationDecision = 'prompt';
            }
            const localRevisionUnchanged = await compareAndSetWinner(
              section,
              currentSettings,
              writeResult.value,
            );
            await updateState((latest) => {
              let next = {
                ...latest,
                baselines: {
                  ...latest.baselines,
                  [section]: sectionFingerprint(section, writeResult.value),
                },
              };
              if (localRevisionUnchanged) {
                next = clearSettingsSectionDirty(next, section);
              }
              if (section === 'quickNotes' && migrationState) {
                next = { ...next, quickNotesMigration: migrationState };
              }
              return clearSettingsSectionError(next, section);
            });
            currentSettings = await local.readSettings(sheetId);
            if (
              section === 'quickNotes' &&
              migrationState &&
              sectionFingerprint(section, writeResult.value) ===
                migrationState.sourceFingerprint
            ) {
              quickNotesMigrationUploadVerified = true;
            }
          } else {
            await updateState((latest) =>
              setSettingsSectionError(latest, section, writeResult.error),
            );
          }
        } else {
          const winnerValue =
            section === 'quickNotes'
              ? sanitizeQuickNotes(
                  readResult.value as SheetSettingsConfig['quickNotes'],
                  currentSettings.accounts,
                  currentSettings.categories,
                )
              : readResult.value;
          const winnerFingerprint = sectionFingerprint(section, winnerValue);
          const winnerNeedsPush = winnerFingerprint !== remoteFingerprint;
          const localWinnerApplied =
            winnerFingerprint === localFingerprint &&
            sectionReady(currentSettings, section)
              ? true
              : await compareAndSetWinner(section, currentSettings, winnerValue);
          await updateState((latest) => {
            let next = {
              ...latest,
              baselines: { ...latest.baselines, [section]: remoteFingerprint },
            };
            next = localWinnerApplied && !winnerNeedsPush
              ? clearSettingsSectionDirty(next, section)
              : markSettingsSectionDirty(next, section);
            return clearSettingsSectionError(next, section);
          });
          conflicts.push(section);
        }
      } else {
        if (baseline !== remoteFingerprint) {
          const winnerValue =
            section === 'quickNotes'
              ? sanitizeQuickNotes(
                  readResult.value as SheetSettingsConfig['quickNotes'],
                  currentSettings.accounts,
                  currentSettings.categories,
                )
              : readResult.value;
          const winnerFingerprint = sectionFingerprint(section, winnerValue);
          const winnerNeedsPush = winnerFingerprint !== remoteFingerprint;
          const localWinnerApplied =
            localFingerprint === winnerFingerprint &&
            sectionReady(currentSettings, section)
              ? true
              : await compareAndSetWinner(section, currentSettings, winnerValue);
          await updateState((latest) => {
            const next = {
              ...latest,
              baselines: { ...latest.baselines, [section]: remoteFingerprint },
            };
            return localWinnerApplied && !winnerNeedsPush
              ? next
              : markSettingsSectionDirty(next, section);
          });
        }
        await updateState((latest) => clearSettingsSectionError(latest, section));
      }
    } else {
      const sectionError = readResult.error;
      await updateState((latest) => setSettingsSectionError(latest, section, sectionError));
    }
    await updateState((latest) => latest);
    if (
      section === 'quickNotes' &&
      quickNotesMigrationUploadVerified &&
      legacyQuickNotes
    ) {
      const deleted = await local.deleteLegacyQuickNotesIfUnchanged(legacyQuickNotes);
      if (deleted) {
        migrationState = undefined;
        await updateState(withoutQuickNotesMigration);
      } else {
        const latestLegacy = await local.readLegacyQuickNotes();
        if (latestLegacy) {
          migrationState = {
            intent: 'prompt',
            sourceFingerprint: fingerprintQuickNotesConfig(latestLegacy),
          };
          migrationDecision = 'prompt';
          await updateState((latest) => ({
            ...latest,
            quickNotesMigration: migrationState,
          }));
        }
      }
    }
  }

  await updateState((latest) =>
    latest.dirty.length === 0 &&
    Object.keys(latest.errors).length === 0 &&
    migrationState === undefined
      ? {
          ...latest,
          lastSyncedAt: (options.now ?? (() => new Date().toISOString()))(),
        }
      : latest,
  );

  const status: SettingsReconciliationStatus =
    Object.keys(state.errors).length > 0
      ? 'error'
      : state.dirty.length > 0 || migrationState !== undefined
        ? 'pending'
        : 'synced';

  return {
    state,
    changed,
    pushed,
    conflicts,
    errors: { ...state.errors },
    migrationDecision,
    migrationApplied,
    status,
  };
}
