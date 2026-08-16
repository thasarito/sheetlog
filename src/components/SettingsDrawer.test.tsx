import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SettingsReconciliationResult,
  SettingsReconciliationStatus,
} from '../lib/settingsReconciliation';
import type { SettingsSyncState } from '../lib/settingsSync';
import type { OnboardingState } from '../lib/types';
import { SettingsDrawer } from './SettingsDrawer';

const defaultSettingsState = (): SettingsSyncState => ({
  targetUserId: 'user-a',
  baselines: { accounts: 'accounts-a', categories: 'categories-a', quickNotes: 'notes-a' },
  dirty: [],
  errors: {},
  lastSyncedAt: '2026-08-16T12:00:00.000Z',
});

const mocks = vi.hoisted(() => ({
  isOnline: true,
  onboarding: {
    sheetFolderId: null,
    accounts: [{ name: 'Wallet', icon: 'Wallet', color: '#34C759' }],
    accountsConfirmed: true,
    categories: {
      expense: [{ name: 'Food', icon: 'Utensils', color: '#FF9500' }],
      income: [{ name: 'Salary', icon: 'Banknote', color: '#34C759' }],
      transfer: [{ name: 'Transfer', icon: 'ArrowRightLeft', color: '#007AFF' }],
    },
    categoriesConfirmed: true,
  } as OnboardingState,
  sync: {
    isSyncing: false,
    refreshSettings: vi.fn(),
    settingsSyncResult: undefined as SettingsReconciliationResult | undefined,
    settingsSyncState: null as SettingsSyncState | null,
    settingsSyncStatus: 'synced' as SettingsReconciliationStatus,
    settingsSyncError: null as Error | null,
    hasLegacyQuickNotesMigrationPrompt: false,
    importLegacyQuickNotes: vi.fn(),
    isImportingLegacyQuickNotes: false,
  },
  updateOnboarding: vi.fn(),
  onOpenChange: vi.fn(),
  onToast: vi.fn(),
  quickNotesConfig: {},
  emptyQuickNotes: [],
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    span: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  },
  Reorder: {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

vi.mock('../app/providers', () => ({
  useConnectivity: () => ({ isOnline: mocks.isOnline }),
}));

vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    onboarding: mocks.onboarding,
    isLoading: false,
    updateOnboarding: mocks.updateOnboarding,
    ...mocks.sync,
  }),
}));

function idleMutation() {
  return { mutate: vi.fn(), isPending: false };
}

vi.mock('../hooks/useAccountMutations', () => ({
  useAccountMutations: () => ({
    addAccount: idleMutation(),
    removeAccount: idleMutation(),
    updateAccountMeta: idleMutation(),
    reorderAccounts: idleMutation(),
    isSaving: false,
  }),
}));

vi.mock('../hooks/useCategoryMutations', () => ({
  useCategoryMutations: () => ({
    addCategory: idleMutation(),
    removeCategory: idleMutation(),
    updateCategoryMeta: idleMutation(),
    reorderCategories: idleMutation(),
    isSaving: false,
  }),
}));

vi.mock('../hooks/useQuickNotes', () => ({
  getQuickNotesForCategory: () => mocks.emptyQuickNotes,
  getDefaultQuickNotes: () => mocks.emptyQuickNotes,
  useQuickNotesQuery: () => ({ data: mocks.quickNotesConfig }),
  useUpdateQuickNotes: () => idleMutation(),
  useUpdateDefaultQuickNotes: () => idleMutation(),
}));

vi.mock('./AppearancePicker', () => ({ AppearancePicker: () => null }));

function renderDrawer() {
  return render(
    <SettingsDrawer
      open
      onOpenChange={mocks.onOpenChange}
      onToast={mocks.onToast}
    />,
  );
}

describe('SettingsDrawer settings sync', () => {
  beforeEach(() => {
    mocks.isOnline = true;
    Object.assign(mocks.sync, {
      isSyncing: false,
      settingsSyncResult: undefined,
      settingsSyncState: defaultSettingsState(),
      settingsSyncStatus: 'synced' as const,
      settingsSyncError: null,
      hasLegacyQuickNotesMigrationPrompt: false,
      isImportingLegacyQuickNotes: false,
    });
    mocks.sync.refreshSettings.mockReset().mockResolvedValue(undefined);
    mocks.sync.importLegacyQuickNotes.mockReset().mockResolvedValue(undefined);
    mocks.onOpenChange.mockReset();
    mocks.onToast.mockReset();
  });

  it('shows a synced status and lets the user refresh settings manually', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const syncButton = screen.getByRole('button', { name: /Sync Settings/i });
    expect(syncButton).toHaveTextContent('Synced');
    expect(syncButton).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('Synced')).toHaveAttribute('aria-live', 'polite');

    await user.click(syncButton);

    expect(mocks.sync.refreshSettings).toHaveBeenCalledTimes(1);
  });

  it('shows pending progress and prevents duplicate refreshes while busy', () => {
    mocks.sync.isSyncing = true;
    mocks.sync.settingsSyncStatus = 'synced';

    renderDrawer();

    const syncButton = screen.getByRole('button', { name: /Sync Settings/i });
    expect(syncButton).toBeDisabled();
    expect(syncButton).toHaveAttribute('aria-busy', 'true');
    expect(syncButton).toHaveTextContent('Pending');
    expect(syncButton.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('keeps failures visible while busy and reports global, section, and Sheet-wins diagnostics', () => {
    const state = {
      ...defaultSettingsState(),
      errors: { accounts: 'Account tab is invalid.' },
    } satisfies SettingsSyncState;
    mocks.sync.settingsSyncState = state;
    mocks.sync.settingsSyncStatus = 'error';
    mocks.sync.isSyncing = true;
    mocks.sync.settingsSyncError = new Error('Google Sheets is unavailable.');
    mocks.sync.settingsSyncResult = {
      state,
      changed: ['quickNotes'],
      pushed: [],
      conflicts: ['quickNotes'],
      errors: { categories: 'Category row 4 is invalid.' },
      migrationDecision: 'none',
      migrationApplied: false,
      status: 'error',
    };

    renderDrawer();

    expect(screen.getByRole('button', { name: /Sync Settings/i })).toHaveTextContent(
      'Needs attention',
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toHaveTextContent('Google Sheets is unavailable.');
    expect(alerts[1]).toHaveTextContent('Accounts: Account tab is invalid.');
    expect(alerts[2]).toHaveTextContent('Categories: Category row 4 is invalid.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quick Notes changed in both places; the Sheet version was kept.',
    );
  });

  it('keeps the legacy Quick Notes prompt after an explicit import fails', async () => {
    const user = userEvent.setup();
    mocks.sync.hasLegacyQuickNotesMigrationPrompt = true;
    mocks.sync.importLegacyQuickNotes.mockRejectedValueOnce(new Error('Import failed.'));

    renderDrawer();

    expect(
      screen.getByText(
        'Quick Notes from another Sheet were found on this device. Importing will replace this Sheet’s Quick Notes.',
      ),
    ).toHaveClass('break-words');
    const importButton = screen.getByRole('button', { name: 'Import' });
    expect(importButton).toHaveClass('min-h-11');

    await user.click(importButton);

    await waitFor(() => expect(mocks.sync.importLegacyQuickNotes).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Import' })).toBeVisible();
    expect(mocks.onToast).toHaveBeenCalledWith('Import failed.');
  });

  it('explains offline durability and disables refresh and import actions', () => {
    mocks.isOnline = false;
    mocks.sync.settingsSyncStatus = 'pending';
    mocks.sync.hasLegacyQuickNotesMigrationPrompt = true;

    renderDrawer();

    expect(
      screen.getByText(
        'You’re offline. Changes stay on this device and will sync when you reconnect.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Sync Settings/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
