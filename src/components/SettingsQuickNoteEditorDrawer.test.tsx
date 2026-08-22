import { render, screen, waitFor } from '@testing-library/react';
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

const mocks = vi.hoisted(() => ({
  stepAmountProps: null as StepAmountHarnessProps | null,
}));

vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [{ name: 'Wallet' }, { name: 'Cash' }],
    },
  }),
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
    const props = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Delete Quick Note' }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    renderEditor({ open: false });

    expect(screen.queryByTestId('step-amount')).not.toBeInTheDocument();
  });
});
