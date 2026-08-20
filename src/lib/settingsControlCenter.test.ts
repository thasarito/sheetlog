import { describe, expect, it } from 'vitest';
import type { CategoryConfigWithMeta, QuickNote, QuickNotesConfig } from './types';
import {
  buildQuickNotesGroups,
  renameQuickNotesAccountReferences,
  renameQuickNotesCategoryGroup,
  validateSettingsName,
} from './settingsControlCenter';

const note = (id: string, overrides: Partial<QuickNote> = {}): QuickNote => ({
  id,
  icon: 'StickyNote',
  label: id,
  ...overrides,
});

describe('Settings Control Center helpers', () => {
  it('validates required and duplicate names case-insensitively while allowing the saved name', () => {
    expect(validateSettingsName(' ', ['Cash'], undefined, 'account')).toBe(
      'Enter an account name.',
    );
    expect(validateSettingsName('cash', ['Cash'], undefined, 'account')).toBe(
      'An account named Cash already exists.',
    );
    expect(validateSettingsName(' cash ', ['Cash'], 'Cash', 'account')).toBeNull();
    expect(validateSettingsName('Wallet', ['Cash'], 'Cash', 'account')).toBeNull();
  });

  it('enforces the existing Quick Note label length', () => {
    expect(validateSettingsName('', [], undefined, 'Quick Note')).toBe(
      'Enter a Quick Note label.',
    );
    expect(validateSettingsName('1234567890123', [], undefined, 'Quick Note', 12)).toBe(
      'Keep the Quick Note label to 12 characters or fewer.',
    );
  });

  it('renames account references without mutating unrelated Quick Notes', () => {
    const config: QuickNotesConfig = {
      'expense:Food': [
        note('lunch', { account: 'Cash', forValue: 'Me' }),
        note('coffee', { account: 'Card' }),
      ],
      'transfer:Move': [note('move', { account: 'Bank', forValue: 'Cash' })],
    };

    const renamed = renameQuickNotesAccountReferences(config, 'Cash', 'Wallet');

    expect(renamed['expense:Food']?.[0]).toMatchObject({
      account: 'Wallet',
      forValue: 'Me',
    });
    expect(renamed['expense:Food']?.[1]).toEqual(config['expense:Food']?.[1]);
    expect(renamed['transfer:Move']?.[0]).toMatchObject({
      account: 'Bank',
      forValue: 'Wallet',
    });
    expect(config['expense:Food']?.[0]?.account).toBe('Cash');
  });

  it('moves a category Quick Notes key without changing defaults or other types', () => {
    const foodNotes = [note('lunch')];
    const config: QuickNotesConfig = {
      'default:expense': [note('default-expense')],
      'expense:Food': foodNotes,
      'income:Food': [note('income-food')],
    };

    expect(renameQuickNotesCategoryGroup(config, 'expense', 'Food', 'Dining')).toEqual({
      'default:expense': config['default:expense'],
      'expense:Dining': foodNotes,
      'income:Food': config['income:Food'],
    });
    expect(config).toHaveProperty('expense:Food');
  });

  it('builds default and category targets without counting inherited defaults as custom notes', () => {
    const categories: CategoryConfigWithMeta = {
      expense: [
        { name: 'Food', icon: 'Utensils', color: '#FF9500' },
        { name: 'Travel', icon: 'Plane', color: '#007AFF' },
      ],
      income: [{ name: 'Salary', icon: 'Banknote', color: '#34C759' }],
      transfer: [],
    };
    const config: QuickNotesConfig = {
      'default:expense': [note('expense-default')],
      'expense:Travel': [],
      'income:Salary': [note('payday')],
    };

    const groups = buildQuickNotesGroups(config, categories);

    expect(groups.map((group) => group.key)).toEqual([
      'default:expense',
      'expense:Food',
      'expense:Travel',
      'default:income',
      'income:Salary',
      'default:transfer',
    ]);
    expect(groups.find((group) => group.key === 'expense:Food')).toMatchObject({
      configuredCount: 0,
      inheritsDefaults: true,
      inheritedCount: 1,
      notes: [],
    });
    expect(groups.find((group) => group.key === 'expense:Travel')).toMatchObject({
      configuredCount: 0,
      inheritsDefaults: false,
      inheritedCount: 0,
      notes: [],
    });
    expect(groups.find((group) => group.key === 'income:Salary')).toMatchObject({
      configuredCount: 1,
      inheritsDefaults: false,
      inheritedCount: 0,
    });
  });
});
