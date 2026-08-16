import type {
  AccountItem,
  CategoryConfigWithMeta,
  QuickNotesConfig,
} from './types';
import { db } from './db';

export const SETTINGS_SECTIONS = ['accounts', 'categories', 'quickNotes'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SheetSettingsConfig {
  accounts: AccountItem[];
  categories: CategoryConfigWithMeta;
  quickNotes: QuickNotesConfig;
}

export interface SettingsSyncState {
  targetUserId: string;
  baselines: Record<SettingsSection, string>;
  dirty: SettingsSection[];
  errors: Partial<Record<SettingsSection, string>>;
  lastSyncedAt?: string;
  quickNotesMigration?: QuickNotesMigrationState;
}

export type QuickNotesMigrationIntent = 'auto-import' | 'prompt' | 'explicit-import';
export type QuickNotesMigrationPhase = 'pending' | 'applied';

export interface QuickNotesMigrationState {
  intent: QuickNotesMigrationIntent;
  sourceFingerprint: string;
  phase?: QuickNotesMigrationPhase;
  appliedScopedFingerprint?: string;
}

export type LegacyQuickNotesMigrationDecision = 'auto-import' | 'prompt' | 'none';

export interface LegacyQuickNotesMigrationInput {
  legacyConfig: QuickNotesConfig | null | undefined;
  scopedConfig: QuickNotesConfig | null | undefined;
  verifiedWorkspaceCount: number;
  remoteQuickNoteTabExists: boolean | null;
}

export class SettingsStorageCorruptionError extends Error {
  readonly storageKey: string;

  constructor(storageKey: string, detail: string) {
    super(`Stored settings at "${storageKey}" are corrupt: ${detail}`);
    this.name = 'SettingsStorageCorruptionError';
    this.storageKey = storageKey;
  }
}

export function createDefaultSettingsSyncState(targetUserId: string): SettingsSyncState {
  return {
    targetUserId,
    baselines: { accounts: '', categories: '', quickNotes: '' },
    dirty: [],
    errors: {},
  };
}

export function getSettingsSyncStorageKey(sheetId: string, userId: string): string {
  return `settingsSync:${encodeURIComponent(sheetId)}:${encodeURIComponent(userId)}`;
}

export function getQuickNotesStorageKey(sheetId: string): string {
  return `quickNotes:${encodeURIComponent(sheetId)}`;
}

type StoredJsonResult =
  | { status: 'missing' }
  | { status: 'present'; value: unknown };

function corrupt(storageKey: string, detail: string): never {
  throw new SettingsStorageCorruptionError(storageKey, detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && SETTINGS_SECTIONS.includes(value as SettingsSection);
}

function isQuickNotesTargetKey(key: string): boolean {
  if (key.startsWith('default:')) {
    return isSettingsTransactionType(key.slice('default:'.length));
  }
  const separator = key.indexOf(':');
  return (
    separator > 0 &&
    isSettingsTransactionType(key.slice(0, separator)) &&
    key.slice(separator + 1).trim().length > 0
  );
}

function isSettingsTransactionType(value: string): boolean {
  return value === 'expense' || value === 'income' || value === 'transfer';
}

function requiredQuickNoteString(
  note: Record<string, unknown>,
  field: 'id' | 'icon' | 'label',
  storageKey: string,
): string {
  const fieldValue = note[field];
  if (typeof fieldValue !== 'string' || fieldValue.trim().length === 0) {
    return corrupt(storageKey, `Quick Note ${field} must be a non-empty string.`);
  }
  return fieldValue;
}

export function validateQuickNotesConfig(value: unknown, storageKey: string): QuickNotesConfig {
  if (!isRecord(value)) {
    return corrupt(storageKey, 'Quick Notes must be an object.');
  }
  const noteIds = new Set<string>();
  for (const [target, notes] of Object.entries(value)) {
    if (!isQuickNotesTargetKey(target)) {
      return corrupt(storageKey, `Quick Notes target "${target}" is invalid.`);
    }
    if (!Array.isArray(notes)) {
      return corrupt(storageKey, `Quick Notes target "${target}" must contain an array.`);
    }
    if (notes.length > 5) {
      return corrupt(storageKey, `Quick Notes target "${target}" contains more than five notes.`);
    }
    for (const note of notes) {
      if (!isRecord(note)) {
        return corrupt(storageKey, `Quick Notes target "${target}" contains a malformed note.`);
      }
      const id = requiredQuickNoteString(note, 'id', storageKey);
      requiredQuickNoteString(note, 'icon', storageKey);
      requiredQuickNoteString(note, 'label', storageKey);
      for (const field of ['note', 'amount', 'currency', 'account', 'forValue'] as const) {
        if (note[field] !== undefined && typeof note[field] !== 'string') {
          return corrupt(storageKey, `Quick Note ${field} must be a string when present.`);
        }
      }
      if (noteIds.has(id)) {
        return corrupt(storageKey, `Quick Note ID "${id}" is duplicated.`);
      }
      noteIds.add(id);
    }
  }
  return value as QuickNotesConfig;
}

function validateSettingsSyncState(
  value: unknown,
  verifiedUserId: string,
  storageKey: string,
): SettingsSyncState {
  if (!isRecord(value)) {
    return corrupt(storageKey, 'Sync state must be an object.');
  }
  if (value.targetUserId !== verifiedUserId) {
    return corrupt(storageKey, 'Sync state targetUserId does not match the verified user.');
  }
  if (!isRecord(value.baselines)) {
    return corrupt(storageKey, 'Sync-state baselines must be a section object.');
  }
  const baselines = value.baselines;
  if (
    Object.keys(baselines).length !== SETTINGS_SECTIONS.length ||
    SETTINGS_SECTIONS.some((section) => typeof baselines[section] !== 'string')
  ) {
    return corrupt(storageKey, 'Sync-state baselines must contain one string per section.');
  }
  if (!Array.isArray(value.dirty) || !value.dirty.every(isSettingsSection)) {
    return corrupt(storageKey, 'Sync-state dirty sections are invalid.');
  }
  const dirty = value.dirty;
  const canonicalDirty = SETTINGS_SECTIONS.filter((section) => dirty.includes(section));
  if (
    canonicalDirty.length !== dirty.length ||
    canonicalDirty.some((section, index) => section !== dirty[index])
  ) {
    return corrupt(storageKey, 'Sync-state dirty sections must be unique and canonical.');
  }
  if (
    !isRecord(value.errors) ||
    Object.entries(value.errors).some(
      ([section, error]) => !isSettingsSection(section) || typeof error !== 'string',
    )
  ) {
    return corrupt(storageKey, 'Sync-state errors must contain strings keyed by section.');
  }
  if (value.lastSyncedAt !== undefined && typeof value.lastSyncedAt !== 'string') {
    return corrupt(storageKey, 'Sync-state lastSyncedAt must be a string when present.');
  }
  if (value.quickNotesMigration !== undefined) {
    if (!isRecord(value.quickNotesMigration)) {
      return corrupt(storageKey, 'Quick Note migration state must be an object when present.');
    }
    const { intent, sourceFingerprint } = value.quickNotesMigration;
    if (
      intent !== 'auto-import' &&
      intent !== 'prompt' &&
      intent !== 'explicit-import'
    ) {
      return corrupt(storageKey, 'Quick Note migration intent is invalid.');
    }
    if (typeof sourceFingerprint !== 'string' || sourceFingerprint.length === 0) {
      return corrupt(storageKey, 'Quick Note migration source fingerprint is invalid.');
    }
    const { phase, appliedScopedFingerprint } = value.quickNotesMigration;
    if (phase !== undefined && phase !== 'pending' && phase !== 'applied') {
      return corrupt(storageKey, 'Quick Note migration phase is invalid.');
    }
    if (phase !== 'applied' && appliedScopedFingerprint !== undefined) {
      return corrupt(
        storageKey,
        'Only an applied Quick Note migration may have a scoped fingerprint.',
      );
    }
    if (
      phase === 'applied' &&
      (typeof appliedScopedFingerprint !== 'string' ||
        appliedScopedFingerprint.length === 0)
    ) {
      return corrupt(
        storageKey,
        'Applied Quick Note migration requires a scoped fingerprint.',
      );
    }
  }
  return value as unknown as SettingsSyncState;
}

function normalizeDirtySections(value: unknown, storageKey: string): SettingsSection[] {
  if (!Array.isArray(value) || !value.every(isSettingsSection)) {
    return corrupt(storageKey, 'Sync-state dirty sections are invalid.');
  }
  return SETTINGS_SECTIONS.filter((section) => value.includes(section));
}

async function readStoredJson(key: string): Promise<StoredJsonResult> {
  const record = await db.settings.get(key);
  if (!record) {
    return { status: 'missing' };
  }
  try {
    return { status: 'present', value: JSON.parse(record.value) as unknown };
  } catch {
    return corrupt(key, 'value is not valid JSON.');
  }
}

async function writeStoredJson(key: string, value: unknown): Promise<void> {
  await db.settings.put({
    key,
    value: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
  });
}

export async function readSettingsSyncState(
  sheetId: string,
  verifiedUserId: string,
): Promise<SettingsSyncState | null> {
  const storageKey = getSettingsSyncStorageKey(sheetId, verifiedUserId);
  const stored = await readStoredJson(storageKey);
  return stored.status === 'missing'
    ? null
    : validateSettingsSyncState(stored.value, verifiedUserId, storageKey);
}

export async function writeSettingsSyncState(
  sheetId: string,
  verifiedUserId: string,
  state: SettingsSyncState,
): Promise<void> {
  const storageKey = getSettingsSyncStorageKey(sheetId, verifiedUserId);
  if (!isRecord(state)) {
    return corrupt(storageKey, 'Sync state must be an object.');
  }
  const normalizedState = {
    ...state,
    dirty: normalizeDirtySections(state.dirty, storageKey),
  };
  const validatedState = validateSettingsSyncState(
    normalizedState,
    verifiedUserId,
    storageKey,
  );
  await writeStoredJson(storageKey, validatedState);
}

export async function updateSettingsSyncState(
  sheetId: string,
  verifiedUserId: string,
  update: (state: SettingsSyncState | null) => SettingsSyncState,
): Promise<SettingsSyncState> {
  const storageKey = getSettingsSyncStorageKey(sheetId, verifiedUserId);
  return db.transaction('rw', db.settings, async () => {
    const stored = await readStoredJson(storageKey);
    const current =
      stored.status === 'missing'
        ? null
        : validateSettingsSyncState(stored.value, verifiedUserId, storageKey);
    const next = update(current);
    if (!isRecord(next)) {
      return corrupt(storageKey, 'Sync state must be an object.');
    }
    const validated = validateSettingsSyncState(
      {
        ...next,
        dirty: normalizeDirtySections(next.dirty, storageKey),
      },
      verifiedUserId,
      storageKey,
    );
    await writeStoredJson(storageKey, validated);
    return validated;
  });
}

export async function readQuickNotesConfig(sheetId: string): Promise<QuickNotesConfig | null> {
  const storageKey = getQuickNotesStorageKey(sheetId);
  const stored = await readStoredJson(storageKey);
  return stored.status === 'missing' ? null : validateQuickNotesConfig(stored.value, storageKey);
}

export async function writeQuickNotesConfig(
  sheetId: string,
  config: QuickNotesConfig,
): Promise<void> {
  const storageKey = getQuickNotesStorageKey(sheetId);
  const validatedConfig = validateQuickNotesConfig(config, storageKey);
  await writeStoredJson(storageKey, validatedConfig);
}

export async function readLegacyQuickNotesConfig(): Promise<QuickNotesConfig | null> {
  const stored = await readStoredJson('quickNotes');
  return stored.status === 'missing' ? null : validateQuickNotesConfig(stored.value, 'quickNotes');
}

export async function deleteLegacyQuickNotesConfigIfUnchanged(
  expectedConfig: QuickNotesConfig,
): Promise<boolean> {
  const expected = validateQuickNotesConfig(expectedConfig, 'quickNotes');
  return db.transaction('rw', db.settings, async () => {
    const stored = await readStoredJson('quickNotes');
    if (stored.status === 'missing') return false;
    const current = validateQuickNotesConfig(stored.value, 'quickNotes');
    if (fingerprintQuickNotesConfig(current) !== fingerprintQuickNotesConfig(expected)) {
      return false;
    }
    await db.settings.delete('quickNotes');
    return true;
  });
}

export function markSettingsSectionDirty(
  state: SettingsSyncState,
  section: SettingsSection,
): SettingsSyncState {
  return {
    ...state,
    dirty: SETTINGS_SECTIONS.filter(
      (candidate) => candidate === section || state.dirty.includes(candidate),
    ),
  };
}

export function clearSettingsSectionDirty(
  state: SettingsSyncState,
  section: SettingsSection,
): SettingsSyncState {
  return {
    ...state,
    dirty: SETTINGS_SECTIONS.filter(
      (candidate) => candidate !== section && state.dirty.includes(candidate),
    ),
  };
}

export function setSettingsSectionError(
  state: SettingsSyncState,
  section: SettingsSection,
  error: string,
): SettingsSyncState {
  return {
    ...state,
    errors: {
      ...state.errors,
      [section]: error,
    },
  };
}

export function clearSettingsSectionError(
  state: SettingsSyncState,
  section: SettingsSection,
): SettingsSyncState {
  const errors = { ...state.errors };
  delete errors[section];
  return { ...state, errors };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function fingerprintSettingsSection(
  config: SheetSettingsConfig,
  section: SettingsSection,
): string {
  return JSON.stringify(canonicalize(config[section]));
}

export function fingerprintQuickNotesConfig(config: QuickNotesConfig): string {
  return JSON.stringify(canonicalize(config));
}

export function classifyLegacyQuickNotesMigration(
  input: LegacyQuickNotesMigrationInput,
): LegacyQuickNotesMigrationDecision {
  const hasLegacyConfig =
    input.legacyConfig !== null &&
    input.legacyConfig !== undefined &&
    Object.keys(input.legacyConfig).length > 0;
  const hasScopedConfig = input.scopedConfig !== null && input.scopedConfig !== undefined;
  if (!hasLegacyConfig || hasScopedConfig) {
    return 'none';
  }
  if (input.verifiedWorkspaceCount === 1 && input.remoteQuickNoteTabExists === false) {
    return 'auto-import';
  }
  return 'prompt';
}
