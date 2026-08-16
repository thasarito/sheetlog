import type {
  LocalSettingsAtomicCommitResult,
  LocalSettingsSectionSnapshot,
  LocalSettingsSnapshot,
  SettingsLocalRepository,
} from './settingsReconciliation';
import { sanitizeQuickNotes } from './quickNoteSheet';
import { getDefaultOnboardingState, getOnboardingStateKey } from './settings';
import {
  createDefaultSettingsSyncState,
  deleteLegacyQuickNotesConfigIfUnchanged,
  fingerprintQuickNotesConfig,
  fingerprintSettingsSection,
  markSettingsSectionDirty,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
  SettingsStorageCorruptionError,
  updateSettingsSyncState,
  writeQuickNotesConfig,
  writeSettingsSyncState,
  type SettingsSection,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import { db } from './db';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  CategoryItem,
  OnboardingState,
} from './types';

export type SettingsLocalMutationResult = Omit<
  LocalSettingsAtomicCommitResult,
  'applied'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function corrupt(storageKey: string, detail: string): never {
  throw new SettingsStorageCorruptionError(storageKey, detail);
}

function validateNamedItem<Item extends AccountItem | CategoryItem>(
  value: unknown,
  storageKey: string,
  label: string,
): Item {
  if (!isRecord(value)) {
    return corrupt(storageKey, `${label} must be an object.`);
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    return corrupt(storageKey, `${label} name must be a non-empty string.`);
  }
  for (const field of ['icon', 'color'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      return corrupt(storageKey, `${label} ${field} must be a string when present.`);
    }
  }
  return value as Item;
}

function validateAccounts(value: unknown, storageKey: string): AccountItem[] {
  if (!Array.isArray(value)) {
    return corrupt(storageKey, 'Accounts must be an array.');
  }
  return value.map((item, index) =>
    validateNamedItem<AccountItem>(item, storageKey, `Account ${index + 1}`),
  );
}

function validateCategories(
  value: unknown,
  storageKey: string,
): CategoryConfigWithMeta {
  if (!isRecord(value)) {
    return corrupt(storageKey, 'Categories must be a section object.');
  }
  const categories = {} as CategoryConfigWithMeta;
  for (const type of ['expense', 'income', 'transfer'] as const) {
    const items = value[type];
    if (!Array.isArray(items)) {
      return corrupt(storageKey, `Categories ${type} must be an array.`);
    }
    categories[type] = items.map((item, index) =>
      validateNamedItem<CategoryItem>(
        item,
        storageKey,
        `${type} category ${index + 1}`,
      ),
    );
  }
  return categories;
}

function validateOnboardingState(value: unknown, storageKey: string): OnboardingState {
  if (!isRecord(value)) {
    return corrupt(storageKey, 'Onboarding state must be an object.');
  }
  if (value.sheetFolderId !== null && typeof value.sheetFolderId !== 'string') {
    return corrupt(storageKey, 'sheetFolderId must be a string or null.');
  }
  if (typeof value.accountsConfirmed !== 'boolean') {
    return corrupt(storageKey, 'accountsConfirmed must be a boolean.');
  }
  if (typeof value.categoriesConfirmed !== 'boolean') {
    return corrupt(storageKey, 'categoriesConfirmed must be a boolean.');
  }
  return {
    sheetFolderId: value.sheetFolderId,
    accounts: validateAccounts(value.accounts, storageKey),
    accountsConfirmed: value.accountsConfirmed,
    categories: validateCategories(value.categories, storageKey),
    categoriesConfirmed: value.categoriesConfirmed,
  };
}

async function readOnboardingState(sheetId: string): Promise<OnboardingState> {
  const storageKey = getOnboardingStateKey(sheetId);
  const record = await db.settings.get(storageKey);
  if (!record) return getDefaultOnboardingState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.value) as unknown;
  } catch {
    return corrupt(storageKey, 'value is not valid JSON.');
  }
  return validateOnboardingState(parsed, storageKey);
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
  return db.transaction('r', db.settings, async () => readSettingsRecords(sheetId));
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

export const dexieSettingsLocalRepository: SettingsLocalRepository = {
  readSettings,
  updateSyncState: updateSettingsSyncState,
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
  if (accountsChanged || forceDirty.includes('accounts')) {
    state = markSettingsSectionDirty(state, 'accounts');
  }
  if (categoriesChanged || forceDirty.includes('categories')) {
    state = markSettingsSectionDirty(state, 'categories');
  }

  await writeOnboardingState(sheetId, nextOnboarding);
  if (currentQuickNotes !== null && (accountsChanged || categoriesChanged)) {
    const sanitized = sanitizeQuickNotes(
      currentQuickNotes,
      nextOnboarding.accounts,
      nextOnboarding.categories,
    );
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
  return db.transaction('rw', db.settings, async () =>
    mutateLocalOnboardingInTransaction(sheetId, verifiedUserId, update, []),
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
  return db.transaction('rw', db.settings, async () => {
    const [, currentState] = await Promise.all([
      readSettingsRecords(sheetId),
      readSettingsSyncState(sheetId, verifiedUserId),
    ]);
    await writeQuickNotesConfig(
      sheetId,
      value as SheetSettingsConfig['quickNotes'],
    );
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
  });
}
