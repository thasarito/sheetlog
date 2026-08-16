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

export interface LocalSettingsAtomicCommitResult {
  applied: boolean;
  settings: LocalSettingsSnapshot;
  state: SettingsSyncState;
}

export interface SettingsLocalRepository {
  readSettings(sheetId: string): Promise<LocalSettingsSnapshot>;
  updateSyncState(
    sheetId: string,
    verifiedUserId: string,
    update: (state: SettingsSyncState | null) => SettingsSyncState,
  ): Promise<SettingsSyncState>;
  /**
   * Must compare the local section, apply the winner when it still matches,
   * and persist the returned sync state in one transaction.
   */
  commitSection<Section extends SettingsSection>(
    sheetId: string,
    verifiedUserId: string,
    section: Section,
    expected: LocalSettingsSectionSnapshot<Section>,
    value: SheetSettingsConfig[Section],
    updateState: (
      state: SettingsSyncState | null,
      applied: boolean,
    ) => SettingsSyncState,
  ): Promise<LocalSettingsAtomicCommitResult>;
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
  const legacySourceFingerprint =
    legacyQuickNotes && Object.keys(legacyQuickNotes).length > 0
      ? fingerprintQuickNotesConfig(legacyQuickNotes)
      : null;
  let migrationState: QuickNotesMigrationState | undefined = state.quickNotesMigration;
  if (!legacyQuickNotes || !legacySourceFingerprint) {
    migrationState = undefined;
  } else if (
    migrationState &&
    migrationState.sourceFingerprint !== legacySourceFingerprint
  ) {
    migrationState = {
      intent: 'prompt',
      sourceFingerprint: legacySourceFingerprint,
      phase: 'pending',
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
        : {
            intent: classified,
            sourceFingerprint: legacySourceFingerprint,
            phase: 'pending',
          };
  }
  if (migrationState && migrationState.phase === undefined) {
    const scopedFingerprint = initialSettings.quickNotesPresent
      ? fingerprintQuickNotesConfig(initialSettings.quickNotes)
      : null;
    migrationState =
      scopedFingerprint === migrationState.sourceFingerprint
        ? {
            ...migrationState,
            phase: 'applied',
            appliedScopedFingerprint: scopedFingerprint,
          }
        : initialSettings.quickNotesPresent
          ? { ...migrationState, intent: 'prompt', phase: 'pending' }
          : { ...migrationState, phase: 'pending' };
  }
  if (migrationState?.phase === 'applied') {
    const scopedFingerprint = initialSettings.quickNotesPresent
      ? fingerprintQuickNotesConfig(initialSettings.quickNotes)
      : null;
    if (scopedFingerprint !== migrationState.appliedScopedFingerprint) {
      migrationState = { ...migrationState, intent: 'prompt' };
    }
  }
  if (
    options.importLegacyQuickNotes &&
    migrationState?.intent === 'prompt' &&
    legacySourceFingerprint
  ) {
    migrationState = {
      intent: 'explicit-import',
      sourceFingerprint: legacySourceFingerprint,
      phase: 'pending',
    };
  }
  if (
    migrationState?.phase === 'pending' &&
    migrationState.intent !== 'explicit-import' &&
    initialSettings.quickNotesPresent
  ) {
    migrationState = { ...migrationState, intent: 'prompt' };
  }
  await updateState((latest) => {
    let next = migrationState
      ? { ...latest, quickNotesMigration: migrationState }
      : withoutQuickNotesMigration(latest);
    if (
      migrationState?.intent === 'auto-import' &&
      migrationState.phase === 'pending'
    ) {
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
  const commitWinner = async <Section extends SettingsSection>(
    section: Section,
    observed: LocalSettingsSnapshot,
    value: SheetSettingsConfig[Section],
    update: (latest: SettingsSyncState, applied: boolean) => SettingsSyncState,
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
    const result = await local.commitSection(
      sheetId,
      verifiedUserId,
      section,
      expected,
      value,
      (latest, applied) =>
        update(
          latest ?? createDefaultSettingsSyncState(verifiedUserId),
          applied,
        ),
    );
    currentSettings = result.settings;
    state = result.state;
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
        await updateState((latest) => {
          const next = clearSettingsSectionError(latest, 'quickNotes');
          return {
            ...next,
            baselines: { ...latest.baselines, quickNotes: remoteFingerprint },
          };
        });
      }
      continue;
    }

    if (
      section === 'quickNotes' &&
      legacyQuickNotes &&
      migrationState?.phase !== 'applied' &&
      (migrationState?.intent === 'auto-import' ||
        migrationState?.intent === 'explicit-import')
    ) {
      const activeMigration = migrationState;
      const importedFingerprint = fingerprintQuickNotesConfig(legacyQuickNotes);
      const explicitRemoteFingerprint =
        activeMigration.intent === 'explicit-import' &&
        remoteSettings.quickNotes.status === 'ok'
          ? remoteSettings.quickNotes.present
            ? sectionFingerprint('quickNotes', remoteSettings.quickNotes.value)
            : ''
          : undefined;
      let committedMigration = activeMigration;
      const imported = await commitWinner(
        'quickNotes',
        currentSettings,
        legacyQuickNotes,
        (latest, applied) => {
          committedMigration = applied
            ? {
                ...activeMigration,
                phase: 'applied',
                appliedScopedFingerprint: importedFingerprint,
              }
            : { ...activeMigration, intent: 'prompt', phase: 'pending' };
          if (!applied) migrationDecision = 'prompt';
          let next =
            explicitRemoteFingerprint === undefined
              ? latest
              : {
                  ...latest,
                  baselines: {
                    ...latest.baselines,
                    quickNotes: explicitRemoteFingerprint,
                  },
                };
          next =
            applied && importedFingerprint === next.baselines.quickNotes
              ? clearSettingsSectionDirty(next, 'quickNotes')
              : markSettingsSectionDirty(next, 'quickNotes');
          return { ...next, quickNotesMigration: committedMigration };
        },
      );
      migrationState = committedMigration;
      migrationApplied = imported;
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
        await commitWinner(
          'quickNotes',
          currentSettings,
          sanitized,
          (latest) => markSettingsSectionDirty(latest, 'quickNotes'),
        );
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
        let localRemoteMatch =
          readResult.present && localFingerprint === remoteFingerprint;
        if (!localRemoteMatch && baseline === remoteFingerprint) {
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
          localRemoteMatch =
            readResult.present && localFingerprint === remoteFingerprint;
        }
        if (localRemoteMatch) {
          await commitWinner(
            section,
            currentSettings,
            localValue,
            (latest, applied) => {
              let next = {
                ...latest,
                baselines: { ...latest.baselines, [section]: remoteFingerprint },
              };
              next = applied
                ? clearSettingsSectionDirty(next, section)
                : markSettingsSectionDirty(next, section);
              return clearSettingsSectionError(next, section);
            },
          );
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
            const remoteReadbackFingerprint = sectionFingerprint(
              section,
              writeResult.value,
            );
            const readbackValue =
              section === 'quickNotes'
                ? sanitizeQuickNotes(
                    writeResult.value as SheetSettingsConfig['quickNotes'],
                    currentSettings.accounts,
                    currentSettings.categories,
                  )
                : writeResult.value;
            const winnerFingerprint = sectionFingerprint(section, readbackValue);
            const winnerNeedsPush =
              winnerFingerprint !== remoteReadbackFingerprint;
            const readbackDiverged =
              remoteReadbackFingerprint !== localFingerprint;
            if (readbackDiverged) {
              remember(conflicts, section);
            }
            if (
              section === 'quickNotes' &&
              migrationState &&
              (readbackDiverged ||
                remoteReadbackFingerprint !== migrationState.sourceFingerprint ||
                winnerNeedsPush)
            ) {
              migrationState = { ...migrationState, intent: 'prompt' };
              migrationDecision = 'prompt';
            }
            let committedWriteMigration =
              section === 'quickNotes' ? migrationState : undefined;
            const localRevisionUnchanged = await commitWinner(
              section,
              currentSettings,
              readbackValue,
              (latest, localRevisionUnchanged) => {
                if (
                  committedWriteMigration &&
                  !localRevisionUnchanged
                ) {
                  committedWriteMigration = {
                    ...committedWriteMigration,
                    intent: 'prompt',
                  };
                  migrationDecision = 'prompt';
                }
                let next = {
                  ...latest,
                  baselines: {
                    ...latest.baselines,
                    [section]: remoteReadbackFingerprint,
                  },
                };
                if (localRevisionUnchanged && !winnerNeedsPush) {
                  next = clearSettingsSectionDirty(next, section);
                } else {
                  next = markSettingsSectionDirty(next, section);
                }
                if (committedWriteMigration) {
                  next = {
                    ...next,
                    quickNotesMigration: committedWriteMigration,
                  };
                }
                return clearSettingsSectionError(next, section);
              },
            );
            if (section === 'quickNotes') {
              migrationState = committedWriteMigration;
            }
            currentSettings = await local.readSettings(sheetId);
            const migrationScopedStillApplied =
              section === 'quickNotes' &&
              migrationState?.phase === 'applied' &&
              currentSettings.quickNotesPresent &&
              fingerprintQuickNotesConfig(currentSettings.quickNotes) ===
                migrationState.appliedScopedFingerprint;
            if (
              section === 'quickNotes' &&
              migrationState &&
              !migrationScopedStillApplied
            ) {
              migrationState = { ...migrationState, intent: 'prompt' };
              migrationDecision = 'prompt';
              const promptedMigration = migrationState;
              await updateState((latest) => ({
                ...markSettingsSectionDirty(latest, 'quickNotes'),
                quickNotesMigration: promptedMigration,
              }));
            }
            if (
              section === 'quickNotes' &&
              migrationState &&
              localRevisionUnchanged &&
              migrationScopedStillApplied &&
              remoteReadbackFingerprint === migrationState.sourceFingerprint &&
              winnerFingerprint === migrationState.sourceFingerprint
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
          if (section === 'quickNotes' && migrationState) {
            migrationState = { ...migrationState, intent: 'prompt' };
            migrationDecision = 'prompt';
          }
          const conflictMigration =
            section === 'quickNotes' ? migrationState : undefined;
          await commitWinner(
            section,
            currentSettings,
            winnerValue,
            (latest, localWinnerApplied) => {
              let next = {
                ...latest,
                baselines: { ...latest.baselines, [section]: remoteFingerprint },
              };
              next = localWinnerApplied && !winnerNeedsPush
                ? clearSettingsSectionDirty(next, section)
                : markSettingsSectionDirty(next, section);
              if (conflictMigration) {
                next = { ...next, quickNotesMigration: conflictMigration };
              }
              return clearSettingsSectionError(next, section);
            },
          );
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
          await commitWinner(
            section,
            currentSettings,
            winnerValue,
            (latest, localWinnerApplied) => {
              const next = {
                ...latest,
                baselines: { ...latest.baselines, [section]: remoteFingerprint },
              };
              return clearSettingsSectionError(
                localWinnerApplied && !winnerNeedsPush
                  ? next
                  : markSettingsSectionDirty(next, section),
                section,
              );
            },
          );
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
        if (latestLegacy && Object.keys(latestLegacy).length > 0) {
          migrationState = {
            intent: 'prompt',
            sourceFingerprint: fingerprintQuickNotesConfig(latestLegacy),
            phase: 'pending',
          };
          migrationDecision = 'prompt';
          await updateState((latest) => ({
            ...latest,
            quickNotesMigration: migrationState,
          }));
        } else {
          migrationState = undefined;
          await updateState(withoutQuickNotesMigration);
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
