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
}

export type LegacyQuickNotesMigrationDecision = 'auto-import' | 'prompt' | 'none';

export interface LegacyQuickNotesMigrationInput {
  legacyConfig: QuickNotesConfig | null | undefined;
  scopedConfig: QuickNotesConfig | null | undefined;
  verifiedWorkspaceCount: number;
  remoteQuickNoteTabExists: boolean | null;
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

async function readStoredJson<Value>(key: string): Promise<Value | null> {
  const record = await db.settings.get(key);
  if (!record?.value) {
    return null;
  }
  try {
    return JSON.parse(record.value) as Value;
  } catch {
    return null;
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
  const state = await readStoredJson<SettingsSyncState>(
    getSettingsSyncStorageKey(sheetId, verifiedUserId),
  );
  return state?.targetUserId === verifiedUserId ? state : null;
}

export async function writeSettingsSyncState(
  sheetId: string,
  verifiedUserId: string,
  state: SettingsSyncState,
): Promise<void> {
  if (state.targetUserId !== verifiedUserId) {
    throw new Error('Settings sync state targetUserId must match the verified user.');
  }
  await writeStoredJson(getSettingsSyncStorageKey(sheetId, verifiedUserId), state);
}

export async function readQuickNotesConfig(sheetId: string): Promise<QuickNotesConfig | null> {
  return readStoredJson<QuickNotesConfig>(getQuickNotesStorageKey(sheetId));
}

export async function writeQuickNotesConfig(
  sheetId: string,
  config: QuickNotesConfig,
): Promise<void> {
  await writeStoredJson(getQuickNotesStorageKey(sheetId), config);
}

export async function readLegacyQuickNotesConfig(): Promise<QuickNotesConfig | null> {
  return readStoredJson<QuickNotesConfig>('quickNotes');
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
