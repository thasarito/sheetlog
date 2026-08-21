import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryItem, QuickNote, TransactionType } from '../../lib/types';
import { StepCategory } from './StepCategory';
import { useTransactionForm } from './useTransactionForm';

const mocks = vi.hoisted(() => ({
  categoryOnSelect: undefined as ((category: string) => void) | undefined,
  menuOptions: undefined as
    | {
        onSelectNote?: (note: QuickNote, category: string) => void;
      }
    | undefined,
  tabOnChange: undefined as ((value: TransactionType) => void) | undefined,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('../../hooks/useQuickNotes', () => ({
  useQuickNotesQuery: () => ({ data: {} }),
}));

vi.mock('../CategoryGrid', () => ({
  CategoryGrid: ({ onSelect }: { onSelect: (category: string) => void }) => {
    mocks.categoryOnSelect = onSelect;
    return null;
  },
}));

vi.mock('../CategoryQuickNoteMenu', () => ({
  CategoryQuickNoteMenu: () => null,
  useCategoryQuickNoteMenu: (options: typeof mocks.menuOptions) => {
    mocks.menuOptions = options;
    return {
      state: null,
      handlers: {
        onLongPressStart: vi.fn(),
        onDrag: vi.fn(),
        onRelease: vi.fn(),
        onCancel: vi.fn(),
        onDismiss: vi.fn(),
        onSelectNote: vi.fn(),
        onUseCategory: vi.fn(),
      },
    };
  },
}));

vi.mock('../DateTimeDrawer', () => ({ DateTimeDrawer: () => null }));
vi.mock('../ui/AnimatedTabs', () => ({
  AnimatedTabs: ({
    onChange,
  }: {
    onChange: (value: TransactionType) => void;
  }) => {
    mocks.tabOnChange = onChange;
    return null;
  },
}));

const categoryGroups: Record<TransactionType, CategoryItem[]> = {
  expense: [{ name: 'Food' }, { name: 'Travel' }],
  income: [{ name: 'Salary' }],
  transfer: [{ name: 'Accounts' }],
};

function renderCategoryStep() {
  const hook = renderHook(() =>
    useTransactionForm({
      initialValues: {
        type: 'expense',
        category: 'Food',
        note: 'Central Cafe',
        place: { provider: 'google', placeId: 'central-cafe' },
      },
    }),
  );
  const rendered = render(
    <StepCategory
      form={hook.result.current}
      categoryGroups={categoryGroups}
      onConfirm={vi.fn()}
    />,
  );
  const viewport = rendered.getByTestId('transaction-type-carousel');
  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: ({ left }: ScrollToOptions) => {
      viewport.scrollLeft = Number(left ?? 0);
      fireEvent.scroll(viewport);
    },
  });
  return { ...hook, rendered };
}

describe('StepCategory place boundaries', () => {
  beforeEach(() => {
    mocks.categoryOnSelect = undefined;
    mocks.menuOptions = undefined;
    mocks.tabOnChange = undefined;
  });

  it('clears place when a Quick Note replaces the note', () => {
    const { result } = renderCategoryStep();

    act(() => {
      mocks.menuOptions?.onSelectNote?.(
        { id: 'lunch', icon: 'Utensils', label: 'Lunch', note: 'Quick lunch' },
        'Food',
      );
    });

    expect(result.current.state.values.note).toBe('Quick lunch');
    expect(result.current.state.values.place).toBeUndefined();
  });

  it.each(['income', 'transfer'] as const)(
    'clears only place when switching an expense to %s',
    async (type) => {
      const { result } = renderCategoryStep();

      act(() => mocks.tabOnChange?.(type));

      await waitFor(() =>
        expect(result.current.state.values).toMatchObject({
          type,
          category: '',
          note: 'Central Cafe',
        }),
      );
      expect(result.current.state.values.place).toBeUndefined();
    },
  );

  it('preserves note and place for another expense category', () => {
    const { result } = renderCategoryStep();

    act(() => mocks.categoryOnSelect?.('Travel'));

    expect(result.current.state.values).toMatchObject({
      type: 'expense',
      category: 'Travel',
      note: 'Central Cafe',
      place: { provider: 'google', placeId: 'central-cafe' },
    });
  });
});
