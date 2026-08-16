import type {
  AccountItem,
  CategoryConfigWithMeta,
  QuickNote,
  QuickNotesConfig,
  TransactionType,
} from './types';

export const QUICK_NOTE_HEADERS = [
  'Scope',
  'Type',
  'Category',
  'Entry',
  'Position',
  'Id',
  'Icon',
  'Label',
  'Note',
  'Amount',
  'Currency',
  'Account',
  'For',
] as const;

const TRANSACTION_TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer'];

type QuickNoteScope = 'default' | 'category';

interface QuickNoteTarget {
  scope: QuickNoteScope;
  type: TransactionType;
  category: string;
  configKey: string;
}

interface ParsedNote {
  position: number;
  note: QuickNote;
}

interface ParsedTarget extends QuickNoteTarget {
  emptyRowNumber?: number;
  notes: ParsedNote[];
  positions: Set<number>;
}

export class QuickNoteSheetValidationError extends Error {
  readonly rowNumber: number;

  constructor(rowNumber: number, message: string) {
    super(`Quick Note row ${rowNumber}: ${message}`);
    this.name = 'QuickNoteSheetValidationError';
    this.rowNumber = rowNumber;
  }
}

function rowError(rowNumber: number, message: string): never {
  throw new QuickNoteSheetValidationError(rowNumber, message);
}

function cellString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function isTransactionType(value: string): value is TransactionType {
  return TRANSACTION_TYPES.includes(value as TransactionType);
}

function targetFromCells(
  scopeValue: unknown,
  typeValue: unknown,
  categoryValue: unknown,
  rowNumber: number,
): QuickNoteTarget {
  const scope = cellString(scopeValue);
  if (scope !== 'default' && scope !== 'category') {
    return rowError(rowNumber, 'Scope must be "default" or "category".');
  }

  const type = cellString(typeValue);
  if (!isTransactionType(type)) {
    return rowError(rowNumber, 'Type must be "expense", "income", or "transfer".');
  }

  const category = cellString(categoryValue);
  if (scope === 'default') {
    if (category.length > 0) {
      return rowError(rowNumber, 'A default target must not include a Category.');
    }
    return {
      scope,
      type,
      category: '',
      configKey: `default:${type}`,
    };
  }
  if (category.trim().length === 0) {
    return rowError(rowNumber, 'A category target is required.');
  }
  return {
    scope,
    type,
    category,
    configKey: `${type}:${category}`,
  };
}

function targetFromConfigKey(configKey: string, rowNumber: number): QuickNoteTarget {
  if (configKey.startsWith('default:')) {
    const type = configKey.slice('default:'.length);
    if (!isTransactionType(type)) {
      return rowError(rowNumber, `Invalid default target "${configKey}".`);
    }
    return { scope: 'default', type, category: '', configKey };
  }

  const separator = configKey.indexOf(':');
  const type = separator === -1 ? '' : configKey.slice(0, separator);
  const category = separator === -1 ? '' : configKey.slice(separator + 1);
  if (!isTransactionType(type) || category.trim().length === 0) {
    return rowError(rowNumber, `Invalid category target "${configKey}".`);
  }
  return { scope: 'category', type, category, configKey };
}

function parsePosition(value: unknown, rowNumber: number): number {
  const candidate =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 5) {
    return rowError(rowNumber, 'Position must be an integer from 1 to 5.');
  }
  return candidate;
}

function requiredCell(value: unknown, name: 'Id' | 'Icon' | 'Label', rowNumber: number): string {
  const parsed = cellString(value);
  if (parsed.trim().length === 0) {
    return rowError(rowNumber, `${name} is required for a note entry.`);
  }
  return parsed;
}

function addOptionalField<Key extends keyof Pick<
  QuickNote,
  'note' | 'amount' | 'currency' | 'account' | 'forValue'
>>(note: QuickNote, key: Key, value: unknown): void {
  const parsed = cellString(value);
  if (parsed.length > 0) {
    note[key] = parsed;
  }
}

export function serializeQuickNoteRows(config: QuickNotesConfig): string[][] {
  const rows: string[][] = [];
  const targets = Object.entries(config).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [configKey, notes] of targets) {
    const target = targetFromConfigKey(configKey, rows.length + 2);
    if (notes.length === 0) {
      rows.push([
        target.scope,
        target.type,
        target.category,
        'empty',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
      continue;
    }
    notes.forEach((note, index) => {
      rows.push([
        target.scope,
        target.type,
        target.category,
        'note',
        String(index + 1),
        note.id,
        note.icon,
        note.label,
        note.note ?? '',
        note.amount ?? '',
        note.currency ?? '',
        note.account ?? '',
        note.forValue ?? '',
      ]);
    });
  }
  parseQuickNoteRows(rows);
  return rows;
}

export function parseQuickNoteRows(rows: readonly (readonly unknown[])[]): QuickNotesConfig {
  const targets = new Map<string, ParsedTarget>();
  const noteIds = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const target = targetFromCells(row[0], row[1], row[2], rowNumber);
    const entry = cellString(row[3]);
    if (entry !== 'note' && entry !== 'empty') {
      rowError(rowNumber, 'Entry must be "note" or "empty".');
    }

    const existing = targets.get(target.configKey);
    const parsedTarget: ParsedTarget = existing ?? {
      ...target,
      notes: [],
      positions: new Set<number>(),
    };

    if (entry === 'empty') {
      if (row.slice(4, QUICK_NOTE_HEADERS.length).some((value) => cellString(value).length > 0)) {
        rowError(rowNumber, 'An empty entry requires columns E through M to be blank.');
      }
      if (parsedTarget.notes.length > 0) {
        rowError(rowNumber, 'A target cannot mix empty and note entries.');
      }
      if (parsedTarget.emptyRowNumber !== undefined) {
        rowError(rowNumber, 'Duplicate empty marker for this target.');
      }
      parsedTarget.emptyRowNumber = rowNumber;
      targets.set(target.configKey, parsedTarget);
      continue;
    }

    if (parsedTarget.emptyRowNumber !== undefined) {
      rowError(rowNumber, 'A target cannot mix empty and note entries.');
    }
    if (parsedTarget.notes.length >= 5) {
      rowError(rowNumber, 'A target cannot contain more than five notes.');
    }

    const position = parsePosition(row[4], rowNumber);
    if (parsedTarget.positions.has(position)) {
      rowError(rowNumber, `Duplicate position ${position} for this target.`);
    }

    const id = requiredCell(row[5], 'Id', rowNumber);
    const icon = requiredCell(row[6], 'Icon', rowNumber);
    const label = requiredCell(row[7], 'Label', rowNumber);
    if (noteIds.has(id)) {
      rowError(rowNumber, `Duplicate note ID "${id}".`);
    }

    const note: QuickNote = { id, icon, label };
    addOptionalField(note, 'note', row[8]);
    addOptionalField(note, 'amount', row[9]);
    addOptionalField(note, 'currency', row[10]);
    addOptionalField(note, 'account', row[11]);
    addOptionalField(note, 'forValue', row[12]);

    noteIds.add(id);
    parsedTarget.positions.add(position);
    parsedTarget.notes.push({ position, note });
    targets.set(target.configKey, parsedTarget);
  }

  const config: QuickNotesConfig = {};
  for (const [configKey, target] of targets) {
    config[configKey] = target.emptyRowNumber
      ? []
      : [...target.notes]
          .sort((left, right) => left.position - right.position)
          .map(({ note }) => note);
  }
  return config;
}

function categoryTarget(configKey: string): { type: TransactionType; category: string } | null {
  const separator = configKey.indexOf(':');
  if (separator === -1 || configKey.startsWith('default:')) {
    return null;
  }
  const type = configKey.slice(0, separator);
  const category = configKey.slice(separator + 1);
  return isTransactionType(type) && category.length > 0 ? { type, category } : null;
}

function defaultTargetType(configKey: string): TransactionType | null {
  if (!configKey.startsWith('default:')) {
    return null;
  }
  const type = configKey.slice('default:'.length);
  return isTransactionType(type) ? type : null;
}

function sanitizeNote(
  note: QuickNote,
  accountNames: ReadonlySet<string>,
  targetType: TransactionType,
): QuickNote {
  const sanitized = { ...note };
  if (sanitized.account !== undefined && !accountNames.has(sanitized.account)) {
    delete sanitized.account;
  }
  if (
    targetType === 'transfer' &&
    sanitized.forValue !== undefined &&
    !accountNames.has(sanitized.forValue)
  ) {
    delete sanitized.forValue;
  }
  return sanitized;
}

export function sanitizeQuickNotes(
  config: QuickNotesConfig,
  accounts: readonly AccountItem[],
  categories: CategoryConfigWithMeta,
): QuickNotesConfig {
  const accountNames = new Set(accounts.map(({ name }) => name));
  const sanitized: QuickNotesConfig = {};

  for (const [configKey, notes] of Object.entries(config)) {
    const category = categoryTarget(configKey);
    const defaultType = defaultTargetType(configKey);
    const targetType = defaultType ?? category?.type;
    const targetExists =
      defaultType !== null ||
      (category !== null &&
        categories[category.type].some(({ name }) => name === category.category));
    if (!targetExists || targetType === undefined) {
      continue;
    }
    sanitized[configKey] = notes.map((note) => sanitizeNote(note, accountNames, targetType));
  }
  return sanitized;
}

export interface QuickNoteSanitationSettings {
  accounts: readonly AccountItem[];
  accountsConfirmed: boolean;
  categories: CategoryConfigWithMeta;
  categoriesConfirmed: boolean;
}

/**
 * Sanitize only against settings that are ready to sync. Unconfirmed
 * onboarding values are still drafts, so they cannot authoritatively remove
 * Quick Note references yet.
 */
export function sanitizeQuickNotesAgainstReadySettings(
  config: QuickNotesConfig,
  settings: QuickNoteSanitationSettings,
): QuickNotesConfig {
  const accounts = settings.accountsConfirmed
    ? settings.accounts
    : Array.from(
        new Set(
          Object.entries(config).flatMap(([target, notes]) => {
            const targetType =
              defaultTargetType(target) ?? categoryTarget(target)?.type;
            return notes.flatMap(({ account, forValue }) => [
              ...(account ? [account] : []),
              ...(targetType === 'transfer' && forValue ? [forValue] : []),
            ]);
          }),
        ),
        (name) => ({ name }),
      );
  const categories = settings.categoriesConfirmed
    ? settings.categories
    : {
        expense: settings.categories.expense.map((category) => ({ ...category })),
        income: settings.categories.income.map((category) => ({ ...category })),
        transfer: settings.categories.transfer.map((category) => ({ ...category })),
      };

  if (!settings.categoriesConfirmed) {
    for (const target of Object.keys(config)) {
      if (target.startsWith('default:')) continue;
      const separator = target.indexOf(':');
      const type = target.slice(0, separator) as TransactionType;
      const name = target.slice(separator + 1);
      if (!categories[type].some((category) => category.name === name)) {
        categories[type].push({ name });
      }
    }
  }

  return sanitizeQuickNotes(config, accounts, categories);
}
