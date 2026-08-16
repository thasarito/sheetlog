import { describe, expect, it } from 'vitest';
import {
  parseQuickNoteRows,
  QUICK_NOTE_HEADERS,
  QuickNoteSheetValidationError,
  sanitizeQuickNotes,
  serializeQuickNoteRows,
} from './quickNoteSheet';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  QuickNotesConfig,
} from './types';

const NOTE_COLUMNS = 13;

function noteRow({
  scope = 'default',
  type = 'expense',
  category = '',
  position = '1',
  id = 'note-1',
  icon = 'Coffee',
  label = 'Coffee',
}: {
  scope?: unknown;
  type?: unknown;
  category?: unknown;
  position?: unknown;
  id?: unknown;
  icon?: unknown;
  label?: unknown;
} = {}): unknown[] {
  return [
    scope,
    type,
    category,
    'note',
    position,
    id,
    icon,
    label,
    '',
    '',
    '',
    '',
    '',
  ];
}

function emptyRow({
  scope = 'default',
  type = 'expense',
  category = '',
}: {
  scope?: unknown;
  type?: unknown;
  category?: unknown;
} = {}): unknown[] {
  return [scope, type, category, 'empty', '', '', '', '', '', '', '', '', ''];
}

function expectValidationError(
  rows: unknown[][],
  rowNumber: number,
  reason: RegExp,
): void {
  let thrown: unknown;
  try {
    parseQuickNoteRows(rows);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(QuickNoteSheetValidationError);
  const validationError = thrown as QuickNoteSheetValidationError;
  expect(validationError.rowNumber).toBe(rowNumber);
  expect(validationError.message).toMatch(new RegExp(`Quick Note row ${rowNumber}`));
  expect(validationError.message).toMatch(reason);
}

describe('Quick Note Sheet codec', () => {
  it('exports the exact thirteen-column contract', () => {
    expect(QUICK_NOTE_HEADERS).toEqual([
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
    ]);
  });

  it('round-trips every QuickNote field and preserves note order', () => {
    const config: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'second-by-name',
          icon: 'Sandwich',
          label: 'Lunch',
          note: 'Team lunch',
          amount: '123.45',
          currency: 'THB',
          account: 'Wallet',
          forValue: 'Partner',
        },
        {
          id: 'first-by-name',
          icon: 'Coffee',
          label: 'Coffee',
        },
      ],
      'expense:Dining:Late': [
        {
          id: 'late-dinner',
          icon: 'Utensils',
          label: 'Dinner',
          note: 'After midnight',
          amount: '750',
          currency: 'JPY',
          account: 'Bank',
          forValue: 'Me',
        },
      ],
      'default:income': [],
      'transfer:Savings': [],
    };

    const rows = serializeQuickNoteRows(config);
    const parsed = parseQuickNoteRows(rows);

    expect(rows.every((row) => row.length === NOTE_COLUMNS)).toBe(true);
    expect(parsed).toEqual(config);
    expect(parsed['default:expense'].map(({ id }) => id)).toEqual([
      'second-by-name',
      'first-by-name',
    ]);
  });

  it('uses explicit empty markers for default and category overrides', () => {
    const config: QuickNotesConfig = {
      'default:income': [],
      'expense:Food': [],
    };

    expect(serializeQuickNoteRows(config)).toEqual([
      ['default', 'income', '', 'empty', '', '', '', '', '', '', '', '', ''],
      ['category', 'expense', 'Food', 'empty', '', '', '', '', '', '', '', '', ''],
    ]);
    expect(parseQuickNoteRows(serializeQuickNoteRows(config))).toEqual(config);
  });

  it('sorts notes by position when Sheet rows arrive out of order', () => {
    const second = noteRow({ id: 'second', position: '2' });
    const first = noteRow({ id: 'first', position: 1 });

    expect(parseQuickNoteRows([second, first])['default:expense'].map(({ id }) => id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps formula-looking text as an ordinary literal string in codec output', () => {
    const config: QuickNotesConfig = {
      'default:expense': [
        {
          id: '=note-id',
          icon: '=ICON()',
          label: '=Label',
          note: '=SUM(A1:A2)',
          amount: '+100',
          currency: '-THB',
          account: '@Wallet',
          forValue: '=Me',
        },
      ],
    };

    const [row] = serializeQuickNoteRows(config);

    expect(row.slice(5)).toEqual([
      '=note-id',
      '=ICON()',
      '=Label',
      '=SUM(A1:A2)',
      '+100',
      '-THB',
      '@Wallet',
      '=Me',
    ]);
    expect(parseQuickNoteRows([row])).toEqual(config);
  });
});

describe('Quick Note Sheet validation', () => {
  it.each([
    ['scope', ['other', 'expense', '', 'note', '1', 'id', 'Coffee', 'Coffee'], /scope/i],
    ['type', ['default', 'refund', '', 'note', '1', 'id', 'Coffee', 'Coffee'], /type/i],
    ['entry', ['default', 'expense', '', 'other', '1', 'id', 'Coffee', 'Coffee'], /entry/i],
  ] as const)('rejects an invalid %s at the exact Sheet row', (_name, row, reason) => {
    expectValidationError([noteRow(), [...row]], 3, reason);
  });

  it.each([
    ['category target', noteRow({ scope: 'category', category: '' }), /category target/i],
    ['Id', noteRow({ id: '' }), /Id is required/i],
    ['Icon', noteRow({ icon: '   ' }), /Icon is required/i],
    ['Label', noteRow({ label: null }), /Label is required/i],
  ] as const)('rejects a missing required %s', (_name, row, reason) => {
    expectValidationError([row], 2, reason);
  });

  it('rejects duplicate positions within one target', () => {
    expectValidationError(
      [noteRow({ id: 'first' }), noteRow({ id: 'second' })],
      3,
      /duplicate position 1/i,
    );
  });

  it('rejects duplicate note IDs across targets', () => {
    expectValidationError(
      [
        noteRow({ id: 'duplicate' }),
        noteRow({
          scope: 'category',
          type: 'income',
          category: 'Salary',
          id: 'duplicate',
        }),
      ],
      3,
      /duplicate note ID/i,
    );
  });

  it('rejects mixed empty and note entries for one target', () => {
    expectValidationError([emptyRow(), noteRow()], 3, /mix empty and note/i);
  });

  it('rejects duplicate empty markers for one target', () => {
    expectValidationError([emptyRow(), emptyRow()], 3, /duplicate empty marker/i);
  });

  it.each([
    ['zero', 0],
    ['six', 6],
    ['a fraction', 1.5],
    ['text', 'first'],
  ] as const)('rejects %s as a position outside integer 1-5', (_name, position) => {
    expectValidationError([noteRow({ position })], 2, /position must be an integer from 1 to 5/i);
  });

  it('rejects a sixth note for one target', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      noteRow({ id: `note-${index + 1}`, position: String(index + 1) }),
    );

    expectValidationError(rows, 7, /more than five notes/i);
  });
});

describe('sanitizeQuickNotes', () => {
  it('removes stale category targets and account references without mutating input', () => {
    const accounts: AccountItem[] = [{ name: 'Wallet' }, { name: 'Bank' }];
    const categories: CategoryConfigWithMeta = {
      expense: [{ name: 'Food' }, { name: 'Food:Late' }],
      income: [{ name: 'Salary' }],
      transfer: [{ name: 'Savings' }],
    };
    const config: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'valid-account',
          icon: 'Coffee',
          label: 'Coffee',
          account: 'Wallet',
          note: 'Keep every field',
          amount: '10',
          currency: 'THB',
          forValue: 'Me',
        },
        {
          id: 'stale-account',
          icon: 'Sandwich',
          label: 'Lunch',
          account: 'Closed account',
          note: '=SUM(A1:A2)',
          amount: '20',
          currency: 'USD',
          forValue: 'Partner',
        },
      ],
      'default:income': [],
      'expense:Food': [],
      'expense:Food:Late': [
        { id: 'late', icon: 'Moon', label: 'Late', account: 'Bank' },
      ],
      'expense:Deleted': [
        { id: 'remove-target', icon: 'Trash', label: 'Old', account: 'Wallet' },
      ],
      'income:Salary': [
        { id: 'salary', icon: 'Landmark', label: 'Salary', account: 'Bank' },
      ],
    };
    const original = JSON.parse(JSON.stringify(config)) as QuickNotesConfig;

    const sanitized = sanitizeQuickNotes(config, accounts, categories);

    expect(config).toEqual(original);
    expect(Object.keys(sanitized)).toEqual([
      'default:expense',
      'default:income',
      'expense:Food',
      'expense:Food:Late',
      'income:Salary',
    ]);
    expect(sanitized['default:expense'].map(({ id }) => id)).toEqual([
      'valid-account',
      'stale-account',
    ]);
    expect(sanitized['default:expense'][0]).toEqual(config['default:expense'][0]);
    expect(sanitized['default:expense'][1]).toEqual({
      id: 'stale-account',
      icon: 'Sandwich',
      label: 'Lunch',
      note: '=SUM(A1:A2)',
      amount: '20',
      currency: 'USD',
      forValue: 'Partner',
    });
    expect(sanitized['default:expense'][1]).not.toHaveProperty('account');
    expect(sanitized['default:income']).toEqual([]);
    expect(sanitized['expense:Food']).toEqual([]);
    expect(sanitized['expense:Food:Late']).toEqual(config['expense:Food:Late']);
    expect(sanitized['income:Salary']).toEqual(config['income:Salary']);
    expect(sanitized['default:expense']).not.toBe(config['default:expense']);
  });
});
