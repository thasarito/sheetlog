import type {
  LocalSettingsAtomicCommitResult,
  LocalSettingsSectionSnapshot,
  LocalSettingsSnapshot,
  SettingsLocalRepository,
} from './settingsReconciliation';
import { sanitizeQuickNotesAgainstReadySettings } from './quickNoteSheet';
import {
  getDefaultOnboardingState,
  getOnboardingStateKey,
  LEGACY_ONBOARDING_STATE_KEY,
  migrateStoredOnboardingState,
  OnboardingStateValidationError,
} from './settings';
import {
  clearSettingsSectionDirty,
  createDefaultSettingsSyncState,
  deleteLegacyQuickNotesConfigIfUnchanged,
  fingerprintQuickNotesConfig,
  fingerprintSettingsSection,
  getQuickNotesStorageKey,
  markSettingsSectionDirty,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
  SettingsStorageCorruptionError,
  updateSettingsSyncState,
  validateQuickNotesConfig,
  writeQuickNotesConfig,
  writeSettingsSyncState,
  type SettingsSection,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import { db } from './db';
import type { OnboardingState, QuickNotesConfig } from './types';

export type SettingsLocalMutationResult = Omit<
  LocalSettingsAtomicCommitResult,
  'applied'
>;

export class SettingsRepositoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsRepositoryScopeError';
  }
}

function requireIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new SettingsRepositoryScopeError(`${label} is required.`);
  }
}

function requireSettingsScope(sheetId: string, verifiedUserId: string): void {
  requireIdentifier(sheetId, 'Sheet ID');
  requireIdentifier(verifiedUserId, 'Verified user ID');
}

function corrupt(storageKey: string, detail: string): never {
  throw new SettingsStorageCorruptionError(storageKey, detail);
}

function validateOnboardingState(
  value: unknown,
  storageKey: string,
): OnboardingState {
  try {
    return migrateStoredOnboardingState(value).state;
  } catch (error) {
    if (error instanceof OnboardingStateValidationError) {
      return corrupt(storageKey, error.message);
    }
    throw error;
  }
}

async function readOnboardingState(sheetId: string): Promise<OnboardingState> {
  const storageKey = getOnboardingStateKey(sheetId);
  const record = await db.settings.get(storageKey);
  if (!record) {
    const legacyRecord = await db.settings.get(LEGACY_ONBOARDING_STATE_KEY);
    if (!legacyRecord) return getDefaultOnboardingState();
    let legacyValue: unknown;
    try {
      legacyValue = JSON.parse(legacyRecord.value) as unknown;
    } catch {
      return corrupt(LEGACY_ONBOARDING_STATE_KEY, 'value is not valid JSON.');
    }
    try {
      const migrated = migrateStoredOnboardingState(legacyValue, {
        legacySource: true,
      }).state;
      await writeOnboardingState(sheetId, migrated);
      return migrated;
    } catch (error) {
      if (error instanceof OnboardingStateValidationError) {
        return corrupt(LEGACY_ONBOARDING_STATE_KEY, error.message);
      }
      throw error;
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.value) as unknown;
  } catch {
    return corrupt(storageKey, 'value is not valid JSON.');
  }
  try {
    const result = migrateStoredOnboardingState(parsed);
    if (result.migrated) {
      await writeOnboardingState(sheetId, result.state);
    }
    return result.state;
  } catch (error) {
    if (error instanceof OnboardingStateValidationError) {
      return corrupt(storageKey, error.message);
    }
    throw error;
  }
}

async function writeOnboardingState(
  sheetId: string,
  value: OnboardingState,
): Promise<void> {
  const storageKey = getOnboardingStateKey(sheetId);
  const validated = validateOnboardingState(value, storageKey);
  await db.settings.put({
    key: storageKey,
    value: JSON.stringify(validated),
    updatedAt: new Date().toISOString(),
  });
}

async function readSettingsRecords(sheetId: string): Promise<LocalSettingsSnapshot> {
  const [onboardingState, storedQuickNotes] = await Promise.all([
    readOnboardingState(sheetId),
    readQuickNotesConfig(sheetId),
  ]);
  return {
    accounts: onboardingState.accounts,
    accountsConfirmed: onboardingState.accountsConfirmed,
    categories: onboardingState.categories,
    categoriesConfirmed: onboardingState.categoriesConfirmed,
    quickNotes: storedQuickNotes ?? {},
    quickNotesPresent: storedQuickNotes !== null,
  };
}

async function readSettings(sheetId: string): Promise<LocalSettingsSnapshot> {
  requireIdentifier(sheetId, 'Sheet ID');
  return db.transaction('rw', db.settings, async () => readSettingsRecords(sheetId));
}

function sectionReady(
  settings: LocalSettingsSnapshot,
  section: SettingsSection,
): boolean {
  if (section === 'accounts') return settings.accountsConfirmed;
  if (section === 'categories') return settings.categoriesConfirmed;
  return settings.quickNotesPresent;
}

function sectionMatches<Section extends SettingsSection>(
  current: LocalSettingsSnapshot,
  section: Section,
  expected: LocalSettingsSectionSnapshot<Section>,
): boolean {
  if (sectionReady(current, section) !== expected.ready) return false;
  const expectedSettings = {
    ...current,
    [section]: expected.value,
  } as SheetSettingsConfig;
  return (
    fingerprintSettingsSection(current, section) ===
    fingerprintSettingsSection(expectedSettings, section)
  );
}

async function writeSection<Section extends SettingsSection>(
  sheetId: string,
  section: Section,
  value: SheetSettingsConfig[Section],
): Promise<void> {
  if (section === 'quickNotes') {
    await writeQuickNotesConfig(
      sheetId,
      value as SheetSettingsConfig['quickNotes'],
    );
    return;
  }
  const onboardingState = await readOnboardingState(sheetId);
  if (section === 'accounts') {
    await writeOnboardingState(sheetId, {
      ...onboardingState,
      accounts: value as SheetSettingsConfig['accounts'],
      accountsConfirmed: true,
    });
    return;
  }
  await writeOnboardingState(sheetId, {
    ...onboardingState,
    categories: value as SheetSettingsConfig['categories'],
    categoriesConfirmed: true,
  });
}

async function persistState(
  sheetId: string,
  verifiedUserId: string,
  state: SettingsSyncState,
): Promise<SettingsSyncState> {
  await writeSettingsSyncState(sheetId, verifiedUserId, state);
  const persisted = await readSettingsSyncState(sheetId, verifiedUserId);
  if (!persisted) {
    throw new Error('Settings sync state disappeared during its transaction.');
  }
  return persisted;
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

async function commitSection<Section extends SettingsSection>(
  sheetId: string,
  verifiedUserId: string,
  section: Section,
  expected: LocalSettingsSectionSnapshot<Section>,
  value: SheetSettingsConfig[Section],
  updateState: (
    state: SettingsSyncState | null,
    applied: boolean,
  ) => SettingsSyncState,
): Promise<LocalSettingsAtomicCommitResult> {
  requireSettingsScope(sheetId, verifiedUserId);
  return db.transaction('rw', db.settings, async () => {
    const [currentSettings, currentState] = await Promise.all([
      readSettingsRecords(sheetId),
      readSettingsSyncState(sheetId, verifiedUserId),
    ]);
    const applied = sectionMatches(currentSettings, section, expected);
    if (applied) {
      await writeSection(sheetId, section, value);
    }
    const state = await persistState(
      sheetId,
      verifiedUserId,
      updateState(currentState, applied),
    );
    return {
      applied,
      settings: await readSettingsRecords(sheetId),
      state,
    };
  });
}

async function updateSyncState(
  sheetId: string,
  verifiedUserId: string,
  update: (state: SettingsSyncState | null) => SettingsSyncState,
): Promise<SettingsSyncState> {
  requireSettingsScope(sheetId, verifiedUserId);
  return updateSettingsSyncState(sheetId, verifiedUserId, update);
}

export const dexieSettingsLocalRepository: SettingsLocalRepository = {
  readSettings,
  updateSyncState,
  commitSection,
  readLegacyQuickNotes: readLegacyQuickNotesConfig,
  deleteLegacyQuickNotesIfUnchanged: deleteLegacyQuickNotesConfigIfUnchanged,
};

async function mutateLocalOnboardingInTransaction(
  sheetId: string,
  verifiedUserId: string,
  update: (current: OnboardingState) => OnboardingState,
  forceDirty: readonly SettingsSection[],
): Promise<SettingsLocalMutationResult> {
  const [currentOnboarding, currentQuickNotes, currentState] = await Promise.all([
    readOnboardingState(sheetId),
    readQuickNotesConfig(sheetId),
    readSettingsSyncState(sheetId, verifiedUserId),
  ]);
  const currentSettings: SheetSettingsConfig = {
    accounts: currentOnboarding.accounts,
    categories: currentOnboarding.categories,
    quickNotes: currentQuickNotes ?? {},
  };
  const nextOnboarding = validateOnboardingState(
    update(cloneJson(currentOnboarding)),
    getOnboardingStateKey(sheetId),
  );
  const nextSettings: SheetSettingsConfig = {
    accounts: nextOnboarding.accounts,
    categories: nextOnboarding.categories,
    quickNotes: currentQuickNotes ?? {},
  };
  const accountsChanged =
    currentOnboarding.accountsConfirmed !== nextOnboarding.accountsConfirmed ||
    fingerprintSettingsSection(currentSettings, 'accounts') !==
      fingerprintSettingsSection(nextSettings, 'accounts');
  const categoriesChanged =
    currentOnboarding.categoriesConfirmed !== nextOnboarding.categoriesConfirmed ||
    fingerprintSettingsSection(currentSettings, 'categories') !==
      fingerprintSettingsSection(nextSettings, 'categories');

  let state = currentState ?? createDefaultSettingsSyncState(verifiedUserId);
  if (nextOnboarding.accountsConfirmed) {
    if (accountsChanged || forceDirty.includes('accounts')) {
      state = markSettingsSectionDirty(state, 'accounts');
    }
  } else {
    state = clearSettingsSectionDirty(state, 'accounts');
  }
  if (nextOnboarding.categoriesConfirmed) {
    if (categoriesChanged || forceDirty.includes('categories')) {
      state = markSettingsSectionDirty(state, 'categories');
    }
  } else {
    state = clearSettingsSectionDirty(state, 'categories');
  }

  await writeOnboardingState(sheetId, nextOnboarding);
  const confirmedSettingsChanged =
    (accountsChanged && nextOnboarding.accountsConfirmed) ||
    (categoriesChanged && nextOnboarding.categoriesConfirmed);
  if (currentQuickNotes !== null && confirmedSettingsChanged) {
    const sanitized = sanitizeQuickNotesAgainstReadySettings(currentQuickNotes, {
      accounts: nextOnboarding.accounts,
      accountsConfirmed: nextOnboarding.accountsConfirmed,
      categories: nextOnboarding.categories,
      categoriesConfirmed: nextOnboarding.categoriesConfirmed,
    });
    if (
      fingerprintQuickNotesConfig(sanitized) !==
      fingerprintQuickNotesConfig(currentQuickNotes)
    ) {
      await writeQuickNotesConfig(sheetId, sanitized);
      state = markSettingsSectionDirty(state, 'quickNotes');
    }
  }
  state = await persistState(sheetId, verifiedUserId, state);
  return { settings: await readSettingsRecords(sheetId), state };
}

export async function mutateLocalOnboarding(
  sheetId: string,
  verifiedUserId: string,
  update: (current: OnboardingState) => OnboardingState,
): Promise<SettingsLocalMutationResult> {
  requireSettingsScope(sheetId, verifiedUserId);
  return db.transaction('rw', db.settings, async () =>
    mutateLocalOnboardingInTransaction(sheetId, verifiedUserId, update, []),
  );
}

async function mutateLocalQuickNotesInTransaction(
  sheetId: string,
  verifiedUserId: string,
  update: (current: QuickNotesConfig) => QuickNotesConfig,
): Promise<SettingsLocalMutationResult> {
  const [currentSettings, currentState] = await Promise.all([
    readSettingsRecords(sheetId),
    readSettingsSyncState(sheetId, verifiedUserId),
  ]);
  const validated = validateQuickNotesConfig(
    update(cloneJson(currentSettings.quickNotes)),
    getQuickNotesStorageKey(sheetId),
  );
  const sanitized = sanitizeQuickNotesAgainstReadySettings(
    validated,
    currentSettings,
  );
  await writeQuickNotesConfig(sheetId, sanitized);
  const state = await persistState(
    sheetId,
    verifiedUserId,
    markSettingsSectionDirty(
      currentState ?? createDefaultSettingsSyncState(verifiedUserId),
      'quickNotes',
    ),
  );
  return {
    settings: await readSettingsRecords(sheetId),
    state,
  };
}

export async function mutateLocalQuickNotes(
  sheetId: string,
  verifiedUserId: string,
  update: (current: QuickNotesConfig) => QuickNotesConfig,
): Promise<SettingsLocalMutationResult> {
  requireSettingsScope(sheetId, verifiedUserId);
  return db.transaction('rw', db.settings, async () =>
    mutateLocalQuickNotesInTransaction(sheetId, verifiedUserId, update),
  );
}

function mutateLocalOnboardingSection<Section extends 'accounts' | 'categories'>(
  sheetId: string,
  verifiedUserId: string,
  section: Section,
  value: SheetSettingsConfig[Section],
): Promise<SettingsLocalMutationResult> {
  return db.transaction('rw', db.settings, async () => {
    if (section === 'accounts') {
      return mutateLocalOnboardingInTransaction(
        sheetId,
        verifiedUserId,
        (current) => ({
          ...current,
          accounts: value as SheetSettingsConfig['accounts'],
          accountsConfirmed: true,
        }),
        ['accounts'],
      );
    }
    return mutateLocalOnboardingInTransaction(
      sheetId,
      verifiedUserId,
      (current) => ({
        ...current,
        categories: value as SheetSettingsConfig['categories'],
        categoriesConfirmed: true,
      }),
      ['categories'],
    );
  });
}

export async function mutateLocalSettingsSection<Section extends SettingsSection>(
  sheetId: string,
  verifiedUserId: string,
  section: Section,
  value: SheetSettingsConfig[Section],
): Promise<SettingsLocalMutationResult> {
  requireSettingsScope(sheetId, verifiedUserId);
  if (section === 'accounts') {
    return mutateLocalOnboardingSection(
      sheetId,
      verifiedUserId,
      'accounts',
      value as SheetSettingsConfig['accounts'],
    );
  }
  if (section === 'categories') {
    return mutateLocalOnboardingSection(
      sheetId,
      verifiedUserId,
      'categories',
      value as SheetSettingsConfig['categories'],
    );
  }
  return mutateLocalQuickNotes(
    sheetId,
    verifiedUserId,
    () => value as SheetSettingsConfig['quickNotes'],
  );
}
