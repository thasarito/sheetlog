import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickNote } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  quickNotesConfig: {
    'expense:Food': [
      {
        id: 'legacy-note',
        icon: 'NotebookPen',
        label: 'Legacy note',
      },
    ],
  },
}));

vi.mock('framer-motion', () => ({
  Reorder: {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('../../hooks/useQuickNotes', () => ({
  buildQuickNotesKey: (type: string, categoryName: string) =>
    `${type}:${categoryName}`,
  getDefaultQuickNotes: () => [],
  getQuickNotesForCategory: (
    config: Record<string, unknown[]> | undefined,
    type: string,
    categoryName: string,
  ) => config?.[`${type}:${categoryName}`] ?? [],
  useQuickNotesQuery: () => ({
    data: mocks.quickNotesConfig,
  }),
  useUpdateQuickNotes: () => ({
    isPending: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock('../DynamicIcon', () => ({
  DynamicIcon: () => null,
}));

vi.mock('../SwipeableListItem', () => ({
  SwipeableListItem: ({
    children,
    onDelete,
  }: {
    children: React.ReactNode;
    onDelete: () => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={onDelete}>
        Delete note
      </button>
    </div>
  ),
}));

vi.mock('../ui/drawer', () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./QuickNoteFlow', () => ({
  QuickNoteFlow: ({
    onSave,
  }: {
    onSave: (note: Omit<QuickNote, 'id'> & { id?: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSave({
          id: 'legacy-note',
          icon: 'Star',
          color: '#abcdef',
          label: 'Updated note',
        })
      }
    >
      Save edited Quick Note
    </button>
  ),
}));

import { QuickNotesSettings } from './QuickNotesSettings';

describe('QuickNotesSettings persistence', () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockImplementation((_variables, options) => {
      const error = new Error('Import legacy Quick Notes before editing this Sheet.');
      error.name = 'LegacyQuickNotesMigrationRequiredError';
      options?.onError?.(error);
    });
  });

  it('rolls a rejected optimistic delete back to query notes and shows the migration message', () => {
    const onToast = vi.fn();
    render(
      <QuickNotesSettings
        open
        onOpenChange={vi.fn()}
        transactionType="expense"
        categoryName="Food"
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

    expect(screen.getByText('Legacy note')).toBeInTheDocument();
    expect(onToast).toHaveBeenCalledWith(
      'Import legacy Quick Notes before editing this Sheet.',
    );
  });

  it('persists edited Quick Note icon and color fields', () => {
    mocks.mutate.mockImplementation((_variables, options) => options?.onSuccess?.());

    render(
      <QuickNotesSettings
        open
        onOpenChange={vi.fn()}
        transactionType="expense"
        categoryName="Food"
      />,
    );

    fireEvent.click(screen.getByText('Legacy note'));
    fireEvent.click(screen.getByRole('button', { name: 'Save edited Quick Note' }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        categoryName: 'Food',
        notes: [
          expect.objectContaining({
            id: 'legacy-note',
            icon: 'Star',
            color: '#abcdef',
            label: 'Updated note',
          }),
        ],
      }),
      expect.any(Object),
    );
  });
});
