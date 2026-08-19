import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsItemEditorDrawer } from './SettingsItemEditorDrawer';

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
      <div data-testid="nested-drawer-root">
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

const target = {
  kind: 'account' as const,
  mode: 'edit' as const,
  name: 'Wallet',
  icon: 'Wallet',
  color: '#22c55e',
};

function renderEditor(overrides: Partial<React.ComponentProps<typeof SettingsItemEditorDrawer>> = {}) {
  const props: React.ComponentProps<typeof SettingsItemEditorDrawer> = {
    open: true,
    target,
    existingNames: ['Wallet', 'Cash'],
    isSaving: false,
    onCreate: vi.fn().mockResolvedValue(undefined),
    onCommitName: vi.fn().mockResolvedValue(undefined),
    onCommitAppearance: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<SettingsItemEditorDrawer {...props} />);
  return props;
}

describe('SettingsItemEditorDrawer', () => {
  it('uses a nested live-save drawer without Save or Done actions', () => {
    renderEditor();

    expect(screen.getByTestId('nested-drawer-root')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveStyle({ touchAction: 'pan-y' });
    expect(screen.getByRole('heading', { name: 'Edit Wallet' })).toBeInTheDocument();
    expect(screen.getByText(/Names save when you leave the field/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save|Done/ })).not.toBeInTheDocument();
  });

  it('commits valid text on blur and discrete appearance changes immediately', async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    const input = screen.getByRole('textbox', { name: 'Account name' });

    await user.clear(input);
    await user.type(input, 'Travel Wallet');
    await user.tab();
    await waitFor(() => expect(props.onCommitName).toHaveBeenCalledWith('Travel Wallet'));

    await user.click(screen.getByRole('button', { name: 'Use Blue' }));
    expect(props.onCommitAppearance).toHaveBeenCalledWith({
      icon: 'Wallet',
      color: '#3b82f6',
    });
    await user.click(screen.getByRole('button', { name: 'Use CreditCard icon' }));
    expect(props.onCommitAppearance).toHaveBeenLastCalledWith({
      icon: 'CreditCard',
      color: '#3b82f6',
    });
  });

  it('blocks every dismissal path for an invalid name and supports Revert', async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    const input = screen.getByRole('textbox', { name: 'Account name' });

    await user.clear(input);
    await user.type(input, 'cash');
    await user.tab();
    expect(await screen.findByText('An account named Cash already exists.')).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Simulate swipe dismiss' }));
    expect(props.onDismiss).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(input).toHaveValue('Wallet');
    expect(screen.queryByText('An account named Cash already exists.')).not.toBeInTheDocument();
  });
});
