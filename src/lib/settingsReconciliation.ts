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
  markSettingsSectionDirty,
  setSettingsSectionError,
  type LegacyQuickNotesMigrationDecision,
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

export interface SettingsLocalRepository {
  readSettings(sheetId: string): Promise<LocalSettingsSnapshot>;
  writeSection<Section extends SettingsSection>(
    sheetId: string,
    section: Section,
    value: SheetSettingsConfig[Section],
  ): Promise<void>;
  readSyncState(sheetId: string, verifiedUserId: string): Promise<SettingsSyncState | null>;
  writeSyncState(
    sheetId: string,
    verifiedUserId: string,
    state: SettingsSyncState,
  ): Promise<void>;
  readLegacyQuickNotes(): Promise<QuickNotesConfig | null>;
  deleteLegacyQuickNotes(): Promise<void>;
}

export interface SettingsRemoteAdapter {
  readSettings(sheetId: string): Promise<SheetSettingsReadResult>;
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

export async function reconcileSettings(
  options: ReconcileSettingsOptions,
): Promise<SettingsReconciliationResult> {
  const { sheetId, verifiedUserId, local, remote } = options;
  const initialSettings = await local.readSettings(sheetId);
  const storedState = await local.readSyncState(sheetId, verifiedUserId);
  let state = storedState ?? createDefaultSettingsSyncState(verifiedUserId);

  if (!storedState) {
    if (initialSettings.accountsConfirmed) {
      state = markSettingsSectionDirty(state, 'accounts');
    }
    if (initialSettings.categoriesConfirmed) {
      state = markSettingsSectionDirty(state, 'categories');
    }
    if (initialSettings.quickNotesPresent) {
      state = markSettingsSectionDirty(state, 'quickNotes');
    }
  }
  await local.writeSyncState(sheetId, verifiedUserId, state);

  const remoteSettings = await remote.readSettings(sheetId);
  let currentSettings = initialSettings;
  const changed: SettingsSection[] = [];
  const pushed: SettingsSection[] = [];
  const conflicts: SettingsSection[] = [];
  const legacyQuickNotes = await local.readLegacyQuickNotes();
  const migrationDecision = classifyLegacyQuickNotesMigration({
    legacyConfig: legacyQuickNotes,
    scopedConfig: initialSettings.quickNotesPresent ? initialSettings.quickNotes : null,
    verifiedWorkspaceCount: options.verifiedWorkspaceCount,
    remoteQuickNoteTabExists: remoteSettings.quickNotes.present,
  });
  let migrationApplied = false;
  let quickNotesMigrationPushSucceeded = false;

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

  for (const section of ['accounts', 'categories', 'quickNotes'] as const) {
    if (
      section === 'quickNotes' &&
      migrationDecision === 'prompt' &&
      !options.importLegacyQuickNotes
    ) {
      const readResult = remoteSettings.quickNotes;
      if (readResult.status === 'invalid') {
        state = setSettingsSectionError(state, 'quickNotes', readResult.error);
      } else {
        const remoteFingerprint = readResult.present
          ? sectionFingerprint('quickNotes', readResult.value)
          : '';
        state = {
          ...clearSettingsSectionDirty(clearSettingsSectionError(state, 'quickNotes'), 'quickNotes'),
          baselines: { ...state.baselines, quickNotes: remoteFingerprint },
        };
      }
      await local.writeSyncState(sheetId, verifiedUserId, state);
      continue;
    }

    if (
      section === 'quickNotes' &&
      legacyQuickNotes &&
      (migrationDecision === 'auto-import' ||
        (migrationDecision === 'prompt' && options.importLegacyQuickNotes))
    ) {
      await local.writeSection(sheetId, 'quickNotes', legacyQuickNotes);
      currentSettings = await local.readSettings(sheetId);
      state = markSettingsSectionDirty(state, 'quickNotes');
      migrationApplied = true;
      remember(changed, 'quickNotes');

      if (migrationDecision === 'prompt' && remoteSettings.quickNotes.status === 'ok') {
        state = {
          ...state,
          baselines: {
            ...state.baselines,
            quickNotes: remoteSettings.quickNotes.present
              ? sectionFingerprint('quickNotes', remoteSettings.quickNotes.value)
              : '',
          },
        };
      }
      await local.writeSyncState(sheetId, verifiedUserId, state);
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
        await local.writeSection(sheetId, 'quickNotes', sanitized);
        state = markSettingsSectionDirty(state, 'quickNotes');
        remember(changed, 'quickNotes');
        currentSettings = await local.readSettings(sheetId);
      }
    }
    const readResult = remoteSettings[section];
    if (readResult.status === 'ok') {
      const localValue = currentSettings[section] as SheetSettingsConfig[SettingsSection];
      const localFingerprint = sectionFingerprint(section, localValue);
      const remoteFingerprint = readResult.present
        ? sectionFingerprint(section, readResult.value)
        : '';
      const baseline = state.baselines[section];

      if (state.dirty.includes(section)) {
        const initialRemoteMatch =
          baseline === '' && remoteFingerprint !== '' && localFingerprint === remoteFingerprint;
        const remoteIsEmpty =
          sectionFingerprint(section, readResult.value) ===
          sectionFingerprint(
            section,
            section === 'accounts'
              ? []
              : section === 'categories'
                ? { expense: [], income: [], transfer: [] }
                : {},
          );
        if (initialRemoteMatch) {
          state = {
            ...clearSettingsSectionDirty(clearSettingsSectionError(state, section), section),
            baselines: { ...state.baselines, [section]: remoteFingerprint },
          };
        } else if (baseline === remoteFingerprint || (baseline === '' && remoteIsEmpty)) {
          const attemptedValue = localValue;
          let writeResult: SheetSettingsSectionReadResult<
            SheetSettingsConfig[SettingsSection]
          >;
          try {
            writeResult = await remote.replaceSection(sheetId, section, attemptedValue);
          } catch (error) {
            state = setSettingsSectionError(state, section, errorMessage(error));
            await local.writeSyncState(sheetId, verifiedUserId, state);
            throw error;
          }
          if (writeResult.status === 'ok') {
            pushed.push(section);
            state = {
              ...state,
              baselines: {
                ...state.baselines,
                [section]: sectionFingerprint(section, writeResult.value),
              },
            };
            const latestSettings = await local.readSettings(sheetId);
            const latestValue = latestSettings[section] as SheetSettingsConfig[SettingsSection];
            if (sectionFingerprint(section, latestValue) === localFingerprint) {
              if (sectionFingerprint(section, writeResult.value) !== localFingerprint) {
                await local.writeSection(sheetId, section, writeResult.value);
                remember(changed, section);
              }
              state = clearSettingsSectionDirty(state, section);
            }
            state = clearSettingsSectionError(state, section);
            currentSettings = await local.readSettings(sheetId);
            if (section === 'quickNotes' && migrationApplied) {
              quickNotesMigrationPushSucceeded = true;
            }
          } else {
            state = setSettingsSectionError(state, section, writeResult.error);
          }
        } else {
          if (remoteFingerprint !== localFingerprint) {
            await local.writeSection(sheetId, section, readResult.value);
            remember(changed, section);
            currentSettings = await local.readSettings(sheetId);
          }
          state = {
            ...clearSettingsSectionDirty(clearSettingsSectionError(state, section), section),
            baselines: { ...state.baselines, [section]: remoteFingerprint },
          };
          conflicts.push(section);
        }
      } else {
        if (baseline !== remoteFingerprint) {
          if (localFingerprint !== remoteFingerprint) {
            await local.writeSection(sheetId, section, readResult.value);
            remember(changed, section);
            currentSettings = await local.readSettings(sheetId);
          }
          state = {
            ...state,
            baselines: { ...state.baselines, [section]: remoteFingerprint },
          };
        }
        state = clearSettingsSectionError(state, section);
      }
    } else {
      state = setSettingsSectionError(state, section, readResult.error);
    }
    await local.writeSyncState(sheetId, verifiedUserId, state);
    if (section === 'quickNotes' && quickNotesMigrationPushSucceeded) {
      await local.deleteLegacyQuickNotes();
    }
  }

  if (
    state.dirty.length === 0 &&
    Object.keys(state.errors).length === 0 &&
    (migrationDecision !== 'prompt' || migrationApplied)
  ) {
    state = {
      ...state,
      lastSyncedAt: (options.now ?? (() => new Date().toISOString()))(),
    };
    await local.writeSyncState(sheetId, verifiedUserId, state);
  }

  const status: SettingsReconciliationStatus =
    Object.keys(state.errors).length > 0
      ? 'error'
      : state.dirty.length > 0 || (migrationDecision === 'prompt' && !migrationApplied)
        ? 'pending'
        : 'synced';

  return {
    state,
    changed,
    pushed,
    conflicts,
    errors: state.errors,
    migrationDecision,
    migrationApplied,
    status,
  };
}
