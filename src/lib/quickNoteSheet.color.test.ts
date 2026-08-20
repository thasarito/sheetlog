import { describe, expect, it } from 'vitest';
import {
  parseQuickNoteRows,
  QUICK_NOTE_HEADERS,
  QuickNoteSheetValidationError,
  serializeQuickNoteRows,
} from './quickNoteSheet';
import type { QuickNotesConfig } from './types';

describe('Quick Note Sheet colors', () => {
  it('appends Color without shifting the existing thirteen columns', () => {
    expect(QUICK_NOTE_HEADERS.slice(0, 13)).toEqual([
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
    expect(QUICK_NOTE_HEADERS[13]).toBe('Color');
  });

  it('round-trips an explicit color while accepting legacy rows without it', () => {
    const config: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'coffee',
          icon: 'Coffee',
          label: 'Coffee',
          color: '#3b82f6',
        },
      ],
    };

    const [row] = serializeQuickNoteRows(config);
    expect(row).toHaveLength(14);
    expect(row[13]).toBe('#3b82f6');
    expect(parseQuickNoteRows([row])).toEqual(config);

    expect(parseQuickNoteRows([row.slice(0, 13)])).toEqual({
      'default:expense': [
        { id: 'coffee', icon: 'Coffee', label: 'Coffee' },
      ],
    });
  });

  it('rejects a non-hex stored color at the exact row', () => {
    const row = [
      'default',
      'expense',
      '',
      'note',
      '1',
      'coffee',
      'Coffee',
      'Coffee',
      '',
      '',
      '',
      '',
      '',
      'tomato',
    ];

    expect(() => parseQuickNoteRows([row])).toThrow(QuickNoteSheetValidationError);
    expect(() => parseQuickNoteRows([row])).toThrow(/row 2.*six-digit hex color/i);
  });
});
