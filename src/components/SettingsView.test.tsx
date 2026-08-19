import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SettingsReconciliationResult,
  SettingsReconciliationStatus,
} from '../lib/settingsReconciliation';
import type { SettingsSyncState } from '../lib/settingsSync';
import type { OnboardingState, QuickNotesConfig } from '../lib/types';
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
    records: [],
    meta: null,
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
  records: [],
  rates: [],
  hasLocalHistory: true,
  status: 'synced',
  lastSyncedAt: '2026-08-17T12:34:00.000Z',
  isResyncing: false,
  resync: vi.fn(),
};

const mocks = vi.hoisted(() => {
  const mutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  });
  return {
    isOnline: true,
    onboarding: {
      sheetFolderId: null,
      accounts: [{ name: 'Wallet', icon: 'Wallet', color: '#22c55e' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food', icon: 'Utensils', color: '#f97316' }],
        income: [{ name: 'Salary', icon: 'Banknote', color: '#22c55e' }],
        transfer: [{ name: 'Move', icon: 'ArrowLeftRight', color: '#3b82f6' }],
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
    quickNotesConfig: {
      'default:expense': [
        { id: 'coffee', icon: 'Coffee', label: 'Coffee', note: 'Morning coffee' },
      ],
    } as QuickNotesConfig,
    account: {
      add: mutation(),
      remove: mutation(),
      update: mutation(),
      reorder: mutation(),
    },
    category: {
      add: mutation(),
      remove: mutation(),
      update: mutation(),
      reorder: mutation(),
    },
    quickNotes: {
      update: mutation(),
      updateDefault: mutation(),
      replace: mutation(),
    },
  };
});

vi.mock('framer-motion', () => ({
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

vi.mock('../hooks/useAccountMutations', () => ({
  useAccountMutations: () => ({
    addAccount: mocks.account.add,
    removeAccount: mocks.account.remove,
    updateAccountMeta: mocks.account.update,
    reorderAccounts: mocks.account.reorder,
    isSaving: false,
  }),
}));

vi.mock('../hooks/useCategoryMutations', () => ({
  useCategoryMutations: () => ({
    addCategory: mocks.category.add,
    removeCategory: mocks.category.remove,
    updateCategoryMeta: mocks.category.update,
    reorderCategories: mocks.category.reorder,
    isSaving: false,
  }),
}));

vi.mock('../hooks/useQuickNotes', () => ({
  useQuickNotesQuery: () => ({ data: mocks.quickNotesConfig }),
  useUpdateQuickNotes: () => mocks.quickNotes.update,
  useUpdateDefaultQuickNotes: () => mocks.quickNotes.updateDefault,
  useReplaceQuickNotesConfig: () => mocks.quickNotes.replace,
}));

vi.mock('./SettingsItemEditorDrawer', () => ({
  SettingsItemEditorDrawer: ({
    open,
    target,
    onDismiss,
  }: {
    open: boolean;
    target: { name: string; kind: string };
    onDismiss: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={`${target.kind} editor`}>
        <span>{target.name || `New ${target.kind}`}</span>
        <button type="button" onClick={onDismiss}>
          Close mock item editor
        </button>
      </div>
    ) : null,
}));

vi.mock('./SettingsQuickNoteEditorDrawer', () => ({
  SettingsQuickNoteEditorDrawer: ({
    open,
    onDismiss,
  }: {
    open: boolean;
    onDismiss: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Quick Note editor">
        <button type="button" onClick={onDismiss}>
          Close mock Quick Note editor
        </button>
      </div>
    ) : null,
}));

function renderView(
  props: Partial<React.ComponentProps<typeof SettingsView>> = {},
) {
  return render(
    <SettingsView
      onToast={mocks.onToast}
      analyticsSync={analyticsSync}
      {...props}
    />,
  );
}

describe('SettingsView Control Center', () => {
  beforeEach(() => {
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
    for (const group of [mocks.account, mocks.category, mocks.quickNotes]) {
      for (const mutation of Object.values(group)) {
        mutation.mutate.mockReset();
        mutation.mutateAsync.mockReset().mockResolvedValue(undefined);
      }
    }
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders one persistent Control Center scroll surface without an internal page stack', () => {
    renderView();

    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.getByTestId('settings-control-center-scroll')).toHaveAttribute(
      'data-dashboard-scroll',
      'true',
    );
    expect(screen.getByText('Everything is up to date')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back|Edit|Done/ })).not.toBeInTheDocument();
  });

  it('keeps Accounts and Categories expanded together with direct reorder handles', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /Accounts/ }));
    await user.click(screen.getByRole('button', { name: /Categories/ }));

    expect(screen.getByRole('region', { name: 'Accounts' })).toHaveTextContent('Wallet');
    expect(screen.getByRole('region', { name: 'Categories' })).toHaveTextContent('Food');
    expect(screen.getByRole('button', { name: 'Drag Wallet to reorder' })).toHaveAttribute(
      'data-home-carousel-swipe-lock',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Drag Food to reorder' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('positions a newly opened section and honors reduced motion', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    renderView();

    await user.click(screen.getByRole('button', { name: /Accounts/ }));
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
    );

    scrollIntoView.mockClear();
    vi.mocked(window.matchMedia).mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList);
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' }),
    );
  });

  it('opens a concrete Account in a nested editor and restores row focus on dismissal', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /Accounts/ }));
    const wallet = screen.getByRole('button', { name: 'Wallet' });
    await user.click(wallet);
    expect(screen.getByRole('dialog', { name: 'account editor' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close mock item editor' }));
    await waitFor(() => expect(wallet).toHaveFocus());
    expect(screen.getByRole('region', { name: 'Accounts' })).toBeVisible();
  });

  it('shows Quick Note targets without counting inherited defaults as custom notes', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /Quick Notes/ }));
    expect(screen.getByText('Expense defaults')).toBeVisible();
    expect(screen.getByText('Food')).toBeVisible();
    expect(screen.getByText('Uses 1 default')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Food.*Uses 1 default/ }));
    expect(screen.getByRole('button', { name: 'Add Quick Note to Food' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add Quick Note to Food' }));
    expect(screen.getByRole('dialog', { name: 'Quick Note editor' })).toBeVisible();
  });

  it('keeps technical sync details collapsed until Data & sync is opened', async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.queryByRole('button', { name: /Sync Settings/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Data & sync/ }));

    const syncButton = screen.getByRole('button', { name: /Sync Settings/i });
    expect(syncButton).toHaveTextContent('Synced');
    await user.click(syncButton);
    expect(mocks.sync.refreshSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Transaction history')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Resync transaction history' }));
    expect(analyticsSync.resync).toHaveBeenCalledTimes(1);
  });
});
