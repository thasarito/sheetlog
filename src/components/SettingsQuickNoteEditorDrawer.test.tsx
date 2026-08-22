import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickNote } from '../lib/types';
import { SettingsQuickNoteEditorDrawer } from './SettingsQuickNoteEditorDrawer';

type StepAmountHarnessProps = {
  accounts: string[];
  customHeader?: React.ReactNode;
  isSubmitting?: boolean;
  onBack: () => void;
  onDelete?: () => void;
  onSubmit: () => void;
  optionalAmount?: boolean;
  submitLabel?: string;
};

type AppearancePickerSection = 'appearance' | 'icon' | 'color';

type AppearancePickerHarnessProps = {
  open: boolean;
  section?: AppearancePickerSection;
  initialIcon?: string;
  initialColor?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (icon: string, color: string) => void;
};

const mocks = vi.hoisted(() => ({
  stepAmountProps: null as StepAmountHarnessProps | null,
  appearancePickerProps: null as AppearancePickerHarnessProps | null,
}));

vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [{ name: 'Wallet' }, { name: 'Cash' }],
    },
  }),
}));

vi.mock('./AppearancePicker', () => ({
  AppearancePicker: (props: AppearancePickerHarnessProps) => {
    mocks.appearancePickerProps = props;
    if (!props.open) return null;

    const nextIcon = props.section === 'icon' ? 'Star' : (props.initialIcon ?? 'Tag');
    const nextColor = props.section === 'color' ? '#abcdef' : (props.initialColor ?? '#6366f1');

    return (
      <div role="dialog" aria-label={`${props.section ?? 'appearance'} picker`}>
        <button type="button" onClick={() => props.onSave(nextIcon, nextColor)}>
          Apply appearance
        </button>
      </div>
    );
  },
}));

vi.mock('./TransactionFlow/StepAmount', () => ({
  StepAmount: (props: StepAmountHarnessProps) => {
    mocks.stepAmountProps = props;
    return (
      <div data-testid="step-amount">
        {props.customHeader}
        <button type="button" onClick={props.onBack}>
          Back from amount
        </button>
        {props.onDelete ? (
          <button type="button" aria-label="Delete Quick Note" onClick={props.onDelete}>
            Delete
          </button>
        ) : null}
        <button type="button" onClick={props.onSubmit}>
          {props.isSubmitting ? 'Saving...' : props.submitLabel}
        </button>
      </div>
    );
  },
}));

vi.mock('./ui/drawer', () => ({
  DrawerNestedRoot: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const savedNote: QuickNote = {
  id: 'coffee',
  icon: 'Coffee',
  color: '#123456',
  label: 'Coffee',
  note: 'Morning coffee',
  amount: '120',
  currency: 'THB',
  account: 'Wallet',
  forValue: 'Food',
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
  beforeEach(() => {
    mocks.stepAmountProps = null;
    mocks.appearancePickerProps = null;
  });

  it('opens the WYSIWYG StepAmount flow from Settings', () => {
    renderEditor();

    expect(screen.getByTestId('step-amount')).toBeInTheDocument();
    expect(mocks.stepAmountProps).toMatchObject({
      accounts: ['Wallet', 'Cash'],
      optionalAmount: true,
      submitLabel: 'Save Quick Note',
    });
    expect(screen.getByPlaceholderText('Label (required)')).toHaveValue('Coffee');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a compact icon, label, and color identity row', () => {
    renderEditor();

    const row = screen.getByTestId('quick-note-identity-row');
    const iconButton = within(row).getByRole('button', { name: 'Choose Quick Note icon' });
    const labelInput = within(row).getByPlaceholderText('Label (required)');
    const colorButton = within(row).getByRole('button', { name: 'Choose Quick Note color' });

    expect(iconButton.nextElementSibling).toBe(labelInput);
    expect(labelInput.nextElementSibling).toBe(colorButton);
  });

  it('opens the icon picker and saves the selected icon', async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Choose Quick Note icon' }));

    expect(mocks.appearancePickerProps).toMatchObject({
      open: true,
      section: 'icon',
      initialIcon: 'Coffee',
      initialColor: '#123456',
    });

    await user.click(screen.getByRole('button', { name: 'Apply appearance' }));
    await user.click(screen.getByRole('button', { name: 'Save Quick Note' }));

    await waitFor(() =>
      expect(props.onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'Star',
          color: '#123456',
        }),
      ),
    );
  });

  it('opens the color picker and saves the selected color', async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Choose Quick Note color' }));

    expect(mocks.appearancePickerProps).toMatchObject({
      open: true,
      section: 'color',
      initialIcon: 'Coffee',
      initialColor: '#123456',
    });

    await user.click(screen.getByRole('button', { name: 'Apply appearance' }));
    await user.click(screen.getByRole('button', { name: 'Save Quick Note' }));

    await waitFor(() =>
      expect(props.onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'Coffee',
          color: '#abcdef',
        }),
      ),
    );
  });

  it('renders above the persistent StepCategory drawer', () => {
    renderEditor();

    expect(screen.getByTestId('step-amount').parentElement).toHaveClass('z-[60]');
  });

  it('pads the full-screen flow below the top safe area', () => {
    renderEditor();

    expect(screen.getByTestId('step-amount').parentElement).toHaveClass('pt-safe');
  });

  it('does not offer deletion while creating a Quick Note', () => {
    renderEditor({ mode: 'create' });

    expect(mocks.stepAmountProps?.onDelete).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Delete Quick Note' })).not.toBeInTheDocument();
  });

  it('saves from StepAmount, preserves the visual identity, and dismisses afterward', async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    const label = screen.getByPlaceholderText('Label (required)');

    await user.clear(label);
    await user.type(label, 'Client');
    await user.click(screen.getByRole('button', { name: 'Save Quick Note' }));

    await waitFor(() =>
      expect(props.onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'coffee',
          icon: 'Coffee',
          color: '#123456',
          label: 'Client',
        }),
      ),
    );
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps StepAmount open when saving fails', async () => {
    const user = userEvent.setup();
    const props = renderEditor({
      onCommit: vi.fn().mockRejectedValue(new Error('save failed')),
    });

    await user.click(screen.getByRole('button', { name: 'Save Quick Note' }));

    await waitFor(() => expect(props.onCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.stepAmountProps?.isSubmitting).toBe(false));
    expect(props.onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('step-amount')).toBeInTheDocument();
  });

  it('deletes from StepAmount and dismisses after persistence succeeds', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Delete Quick Note' }));

    expect(confirm).toHaveBeenCalledWith('Delete this Quick Note?');
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('renders nothing while closed', () => {
    renderEditor({ open: false });

    expect(screen.queryByTestId('step-amount')).not.toBeInTheDocument();
  });
});
