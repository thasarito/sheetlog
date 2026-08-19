import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SettingsReconciliationResult,
  SettingsReconciliationStatus,
} from '../lib/settingsReconciliation';
import type { SettingsSyncState } from '../lib/settingsSync';
import type { OnboardingState, TransactionRecord } from '../lib/types';
import { SettingsView } from './SettingsView';
import type { AnalyticsSyncController } from './TransactionFlow/useAnalyticsSync';

const defaultSettingsState = (): SettingsSyncState => ({
  targetUserId: 'user-a',
  baselines: { accounts: 'accounts-a', categories: 'categories-a', quickNotes: 'notes-a' },
  dirty: [],
  errors: {},
  lastSyncedAt: '2026-08-16T12:00:00.000Z',
});

const analyticsSync: AnalyticsSyncController = {
  history: {
    records: [{}, {}, {}] as TransactionRecord[],
    meta: {
      sheetId: 'sheet-a',
      capturedAt: '2026-08-19T13:42:00.000Z',
      sourceLastRow: 4,
      rowCount: 3,
    },
    error: null,
    hasCompleteCache: true,
    hasLocalSnapshot: true,
    isLoading: false,
    isRefreshing: false,
    isDownloading: false,
    isOnline: true,
    remoteStatus: 'success',
    remoteFetchedAt: undefined,
    remoteError: null,
    refresh: vi.fn(),
  },
  records: [{}, {}, {}] as TransactionRecord[],
  rates: [],
  hasLocalHistory: true,
  status: 'synced',
  lastSyncedAt: '2026-08-17T12:34:00.000Z',
  isResyncing: false,
  resync: vi.fn(),
};

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
    analyticsBaseCurrency: 'THB',
    analyticsBaseCurrencyUpdatedAt: '2026-08-16T12:00:00.000Z',
    analyticsBigSpendingThreshold: {
      amount: null,
      currency: 'THB',
      updatedAt: '2026-08-16T12:00:00.000Z',
    },
  } as OnboardingState,
  sync: {
    isSyncing: false,
    isUpdating: false,
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
  onToast: vi.fn(),
  quickNotesConfig: {},
  emptyQuickNotes: [],
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
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
vi.mock('./QuickNotes/QuickNoteFlow', () => ({ QuickNoteFlow: () => null }));

function renderView() {
  return render(<SettingsView onToast={mocks.onToast} analyticsSync={analyticsSync} />);
}

describe('SettingsView', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    mocks.isOnline = true;
    Object.assign(mocks.sync, {
      isSyncing: false,
      isUpdating: false,
      settingsSyncResult: undefined,
      settingsSyncState: defaultSettingsState(),
      settingsSyncStatus: 'synced' as const,
      settingsSyncError: null,
      hasLegacyQuickNotesMigrationPrompt: false,
      isImportingLegacyQuickNotes: false,
    });
    mocks.sync.refreshSettings.mockReset().mockResolvedValue(undefined);
    mocks.sync.importLegacyQuickNotes.mockReset().mockResolvedValue(undefined);
    mocks.updateOnboarding.mockReset().mockResolvedValue(undefined);
    mocks.onToast.mockReset();
    vi.mocked(analyticsSync.resync).mockReset();
  });

  it('renders inline without modal ownership or a main Done action', () => {
    renderView();

    const settingsView = screen.getByTestId('settings-view');
    expect(settingsView).toBeInTheDocument();
    expect(settingsView.querySelector('.absolute.inset-0')).toHaveClass('bg-transparent');
    expect(settingsView.querySelector('.absolute.inset-0')).not.toHaveClass('bg-surface');
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-scroll-main')).toHaveAttribute(
      'data-dashboard-scroll',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Close settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

it('keeps settings sync diagnostics and moves transaction history sync into Sync', async () => {
  const user = userEvent.setup();
  renderView();

  const syncButton = screen.getByRole('button', { name: /Sync Settings/i });
  expect(syncButton).toHaveTextContent('Synced');
  expect(screen.getByText('Synced')).toHaveAttribute('aria-live', 'polite');
  await user.click(syncButton);
  expect(mocks.sync.refreshSettings).toHaveBeenCalledTimes(1);

  const historySync = screen.getByTestId('transaction-history-sync-setting');
  expect(syncButton.parentElement).toContainElement(historySync);
  expect(within(historySync).getByText('3 transactions')).toBeInTheDocument();
  expect(
    within(historySync).getByText('Last saved Aug 19, 13:42'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Analytics sync')).not.toBeInTheDocument();

  await user.click(
    within(historySync).getByRole('button', {
      name: 'Resync transaction history',
    }),
  );
  expect(analyticsSync.resync).toHaveBeenCalledTimes(1);
});

  it('navigates nested screens with Back/Edit/Add actions while preserving local drafts', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /Accounts/i }));
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-scroll-accounts')).toHaveAttribute(
      'data-dashboard-scroll',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Add Account' }));
    const input = screen.getByPlaceholderText('e.g. Cash');
    await user.type(input, 'Travel Wallet');
    expect(input).toHaveValue('Travel Wallet');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeInTheDocument();
  });

  it('marks reorder and swipe-delete gesture owners as carousel locks', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /Accounts/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const drag = screen.getByRole('button', { name: 'Drag to reorder' });
    expect(drag).toHaveAttribute('data-home-carousel-swipe-lock', 'true');
    const wallet = screen.getByRole('button', { name: /Wallet/ });
    expect(wallet.closest('[data-home-carousel-swipe-lock="true"]')).not.toBeNull();
  });

  it('restores per-screen scroll positions when navigating back', async () => {
    const user = userEvent.setup();
    renderView();
    const mainScroll = screen.getByTestId('settings-scroll-main');
    Object.defineProperty(mainScroll, 'scrollTop', {
      configurable: true,
      value: 48,
      writable: true,
    });
    fireEvent.scroll(mainScroll);

    await user.click(screen.getByRole('button', { name: /Accounts/i }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByTestId('settings-scroll-main').scrollTop).toBe(48));
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

    renderView();

    expect(screen.getByRole('button', { name: /Sync Settings/i })).toHaveTextContent(
      'Needs attention',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quick Notes changed in both places; the Sheet version was kept.',
    );
  });

  it('explains offline durability and disables settings sync actions', () => {
    mocks.isOnline = false;
    mocks.sync.settingsSyncStatus = 'pending';
    mocks.sync.hasLegacyQuickNotesMigrationPrompt = true;
    renderView();

    expect(
      screen.getByText(
        'You’re offline. Changes stay on this device and will sync when you reconnect.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Sync Settings/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
