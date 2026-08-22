import { resolveQuickNoteIconName } from './quickNoteBrands';
import type {
  CategoryConfigWithMeta,
  QuickNote,
  QuickNotesConfig,
  TransactionType,
} from './types';

const TRANSACTION_TYPES: TransactionType[] = ['expense', 'income', 'transfer'];

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

export type QuickNotesControlGroup = {
  key: string;
  kind: 'default' | 'category';
  type: TransactionType;
  categoryName?: string;
  label: string;
  notes: QuickNote[];
  configuredCount: number;
  inheritsDefaults: boolean;
  inheritedCount: number;
};

function indefiniteArticle(noun: string): 'a' | 'an' {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function resolveQuickNotesForPresentation(notes: QuickNote[]): QuickNote[] {
  return notes.map((note) => {
    const icon = resolveQuickNoteIconName(note.icon, note.label);
    return icon === note.icon ? note : { ...note, icon };
  });
}

export function validateSettingsName(
  value: string,
  existingNames: string[],
  currentName?: string,
  noun = 'item',
  maxLength?: number,
): string | null {
  const trimmed = value.trim();
  const isQuickNote = noun === 'Quick Note';
  const nounLabel = isQuickNote ? noun : noun.toLowerCase();

  if (!trimmed) {
    if (isQuickNote) return 'Enter a Quick Note label.';
    return `Enter ${indefiniteArticle(nounLabel)} ${nounLabel} name.`;
  }

  if (maxLength !== undefined && trimmed.length > maxLength) {
    return `Keep the ${nounLabel} label to ${maxLength} characters or fewer.`;
  }

  const normalized = trimmed.toLocaleLowerCase();
  const normalizedCurrent = currentName?.trim().toLocaleLowerCase();
  const duplicate = existingNames.find((existingName) => {
    const normalizedExisting = existingName.trim().toLocaleLowerCase();
    return normalizedExisting === normalized && normalizedExisting !== normalizedCurrent;
  });

  if (duplicate) {
    const article = capitalize(indefiniteArticle(nounLabel));
    return `${article} ${nounLabel} named ${duplicate} already exists.`;
  }

  return null;
}

export function renameQuickNotesAccountReferences(
  config: QuickNotesConfig,
  previousName: string,
  nextName: string,
): QuickNotesConfig {
  if (previousName === nextName) return { ...config };

  return Object.fromEntries(
    Object.entries(config).map(([key, notes]) => [
      key,
      notes.map((note) => {
        const account = note.account === previousName ? nextName || undefined : note.account;
        const forValue = note.forValue === previousName ? nextName || undefined : note.forValue;
        if (account === note.account && forValue === note.forValue) return note;
        return { ...note, account, forValue };
      }),
    ]),
  );
}

export function renameQuickNotesCategoryGroup(
  config: QuickNotesConfig,
  type: TransactionType,
  previousName: string,
  nextName: string,
): QuickNotesConfig {
  const previousKey = `${type}:${previousName}`;
  const nextKey = `${type}:${nextName}`;
  if (previousKey === nextKey || !Object.hasOwn(config, previousKey)) {
    return { ...config };
  }

  return Object.fromEntries(
    Object.entries(config).map(([key, notes]) => [key === previousKey ? nextKey : key, notes]),
  );
}

export function buildQuickNotesGroups(
  config: QuickNotesConfig | undefined,
  categories: CategoryConfigWithMeta,
): QuickNotesControlGroup[] {
  const resolvedConfig = config ?? {};
  const groups: QuickNotesControlGroup[] = [];

  for (const type of TRANSACTION_TYPES) {
    const defaultKey = `default:${type}`;
    const defaultNotes = resolvedConfig[defaultKey] ?? [];
    groups.push({
      key: defaultKey,
      kind: 'default',
      type,
      label: `${TRANSACTION_TYPE_LABELS[type]} defaults`,
      notes: resolveQuickNotesForPresentation(defaultNotes),
      configuredCount: defaultNotes.length,
      inheritsDefaults: false,
      inheritedCount: 0,
    });

    for (const category of categories[type] ?? []) {
      const key = `${type}:${category.name}`;
      const hasCustomConfig = Object.hasOwn(resolvedConfig, key);
      const notes = hasCustomConfig ? (resolvedConfig[key] ?? []) : [];
      groups.push({
        key,
        kind: 'category',
        type,
        categoryName: category.name,
        label: category.name,
        notes: resolveQuickNotesForPresentation(notes),
        configuredCount: notes.length,
        inheritsDefaults: !hasCustomConfig && defaultNotes.length > 0,
        inheritedCount: !hasCustomConfig ? defaultNotes.length : 0,
      });
    }
  }

  return groups;
}
