import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { QuickNote } from '../lib/types';
import { SettingsQuickNoteEditorDrawer } from './SettingsQuickNoteEditorDrawer';

vi.mock('./ui/drawer', () => ({
  DrawerNestedRoot: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="quick-note-nested-root">
        {children}
        <button type="button" onClick={() => onOpenChange(false)}>
          Simulate swipe dismiss
        </button>
      </div>
    ) : null,
  DrawerContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div role="dialog" {...props}>
      {children}
    </div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const savedNote: QuickNote = {
  id: 'coffee',
  icon: 'Coffee',
  label: 'Coffee',
  note: 'Morning coffee',
  currency: 'THB',
  account: 'Wallet',
};

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof SettingsQuickNoteEditorDrawer>> = {},
) {
  const props: React.ComponentProps<typeof SettingsQuickNoteEditorDrawer> = {
    open: true,
    mode: 'edit',
    target: { type: 'expense', categoryName: 'Food' },
    note: savedNote,
    accounts: ['Wallet', 'Cash'],
    isSaving: false,
    onCommit: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<SettingsQuickNoteEditorDrawer {...props} />);
  return props;
}

describe('SettingsQuickNoteEditorDrawer', () => {
  it('uses the nested editor and commits text fields on blur', async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    expect(screen.getByTestId('quick-note-nested-root')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveStyle({ touchAction: 'pan-y' });
    expect(screen.getByRole('heading', { name: 'Edit Quick Note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save|Done/ })).not.toBeInTheDocument();

    const noteText = screen.getByRole('textbox', { name: 'Quick Note text' });
    await user.clear(noteText);
    await user.type(noteText, 'Coffee with client');
    await user.tab();
    await waitFor(() =>
      expect(props.onCommit).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'Coffee with client' }),
      ),
    );
  });

  it('saves select changes immediately', async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'Cash');
    expect(props.onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'Cash' }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'USD');
    expect(props.onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ account: 'Cash', currency: 'USD' }),
    );
  });

  it('blocks dismissal for an empty or overlong label and reverts to the saved label', async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    const label = screen.getByRole('textbox', { name: 'Quick Note label' });

    await user.clear(label);
    await user.tab();
    expect(await screen.findByText('Enter a Quick Note label.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(label).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(label).toHaveValue('Coffee');

    await user.clear(label);
    await user.type(label, 'Thirteen chars');
    await user.tab();
    expect(
      await screen.findByText('Keep the Quick Note label to 12 characters or fewer.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Simulate swipe dismiss' }));
    expect(props.onDismiss).not.toHaveBeenCalled();
  });
});
