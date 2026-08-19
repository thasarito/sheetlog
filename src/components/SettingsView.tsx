import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react';
import type { MutableRefObject, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '../app/providers';
import { useAccountMutations } from '../hooks/useAccountMutations';
import { useCategoryMutations } from '../hooks/useCategoryMutations';
import { useOnboarding } from '../hooks/useOnboarding';
import {
  getDefaultQuickNotes,
  getQuickNotesForCategory,
  useQuickNotesQuery,
  useUpdateDefaultQuickNotes,
  useUpdateQuickNotes,
} from '../hooks/useQuickNotes';
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
} from '../lib/icons';
import { SETTINGS_SECTIONS, type SettingsSection } from '../lib/settingsSync';
import type { CategoryItem, QuickNote, TransactionType } from '../lib/types';
import { AnalyticsBaseCurrencySetting } from './AnalyticsBaseCurrencySetting';
import { AnalyticsBigSpendingThresholdSetting } from './AnalyticsBigSpendingThresholdSetting';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';
import { AppearancePicker } from './AppearancePicker';
import { DynamicIcon } from './DynamicIcon';
import { QuickNoteFlow } from './QuickNotes/QuickNoteFlow';
import { persistQuickNotesOptimistically } from './QuickNotes/quickNotesPersistence';
import { SwipeableListItem } from './SwipeableListItem';
import type { AnalyticsSyncController } from './TransactionFlow/useAnalyticsSync';

export type SettingsViewProps = {
  onToast: (message: string) => void;
  analyticsSync: Pick<
    AnalyticsSyncController,
    'status' | 'lastSyncedAt' | 'isResyncing' | 'resync'
  >;
};

type SettingsScreen =
  | { screen: 'main' }
  | { screen: 'accounts' }
  | { screen: 'accountCreate' }
  | { screen: 'accountDetail'; accountName: string }
  | { screen: 'categories' }
  | { screen: 'categoryCreate'; categoryType: TransactionType }
  | { screen: 'categoryDetail'; categoryName: string; categoryType: TransactionType }
  | { screen: 'quickNotes'; categoryName: string; categoryType: TransactionType }
  | { screen: 'defaultQuickNotes'; categoryType: TransactionType };

type EditingItem =
  | { type: 'account'; name: string }
  | { type: 'category'; name: string; categoryType: TransactionType };

const MAX_QUICK_NOTES = 5;
const CATEGORY_TYPES: { key: TransactionType; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  accounts: 'Accounts',
  categories: 'Categories',
  quickNotes: 'Quick Notes',
};

const screenTransition = {
  type: 'tween' as const,
  duration: 0.32,
  ease: [0.2, 0, 0, 1] as const,
};

const screenVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-30%',
    opacity: 1,
    zIndex: direction > 0 ? 20 : 10,
  }),
  center: (direction: number) => ({
    x: 0,
    opacity: 1,
    zIndex: direction > 0 ? 20 : 10,
  }),
  exit: (direction: number) => ({
    x: direction > 0 ? '-30%' : '100%',
    opacity: 1,
    zIndex: direction > 0 ? 10 : 20,
  }),
};

const navTitleTransition = {
  type: 'tween' as const,
  duration: 0.18,
  ease: [0.2, 0, 0, 1] as const,
};

const navTitleVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 14 : -14, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -14 : 14, opacity: 0 }),
};

function triggerHaptic(ms = 10) {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

function generateQuickNoteId(): string {
  return `qn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getScreenKey(screen: SettingsScreen): string {
  switch (screen.screen) {
    case 'main':
      return 'main';
    case 'accounts':
      return 'accounts';
    case 'accountCreate':
      return 'accountCreate';
    case 'accountDetail':
      return `accountDetail:${screen.accountName}`;
    case 'categories':
      return 'categories';
    case 'categoryCreate':
      return `categoryCreate:${screen.categoryType}`;
    case 'categoryDetail':
      return `categoryDetail:${screen.categoryType}:${screen.categoryName}`;
    case 'quickNotes':
      return `quickNotes:${screen.categoryType}:${screen.categoryName}`;
    case 'defaultQuickNotes':
      return `defaultQuickNotes:${screen.categoryType}`;
  }
}

function getScreenTitle(screen: SettingsScreen): string {
  switch (screen.screen) {
    case 'main':
      return 'Settings';
    case 'accounts':
      return 'Accounts';
    case 'accountCreate':
      return 'New Account';
    case 'accountDetail':
      return screen.accountName;
    case 'categories':
      return 'Categories';
    case 'categoryCreate':
      return 'New Category';
    case 'categoryDetail':
      return screen.categoryName;
    case 'quickNotes':
      return 'Quick Notes';
    case 'defaultQuickNotes':
      return 'Default Quick Notes';
  }
}

function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-2 pt-3 text-[13px] font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 overflow-hidden rounded-[14px] border border-border/70 bg-card">
      {children}
    </div>
  );
}

type SettingsRowProps = {
  icon: ReactNode;
  iconBg?: string;
  title: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
  rightAccessory?: ReactNode;
  tone?: 'default' | 'primary' | 'danger';
  ariaBusy?: boolean;
};

function SettingsRow({
  icon,
  iconBg,
  title,
  detail,
  onPress,
  disabled,
  showChevron = true,
  rightAccessory,
  tone = 'default',
  ariaBusy,
}: SettingsRowProps) {
  const textTone =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'primary'
        ? 'text-primary'
        : 'text-foreground';
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || !onPress}
      aria-busy={ariaBusy}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 disabled:opacity-50"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[9px]"
        style={iconBg ? { backgroundColor: iconBg } : undefined}
      >
        <div className="text-white">{icon}</div>
      </div>
      <span className={`min-w-0 flex-1 truncate text-[17px] ${textTone}`}>{title}</span>
      {detail ? <span className="text-[17px] text-muted-foreground">{detail}</span> : null}
      {rightAccessory}
      {showChevron ? <ChevronRight className="h-5 w-5 text-muted-foreground/60" /> : null}
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mx-4 mt-3 rounded-[12px] border border-border/70 bg-surface-2 p-1">
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold transition ${
              option.value === value
                ? 'border border-border/70 bg-card text-foreground'
                : 'text-muted-foreground active:bg-surface-3'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScreenScroll({
  screenKey,
  scrollPositions,
  children,
}: {
  screenKey: string;
  scrollPositions: MutableRefObject<Map<string, number>>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element) {
      element.scrollTop = scrollPositions.current.get(screenKey) ?? 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    return () => {
      if (element) scrollPositions.current.set(screenKey, element.scrollTop);
    };
  }, [screenKey, scrollPositions]);

  return (
    <div
      ref={ref}
      data-testid={`settings-scroll-${screenKey}`}
      data-dashboard-scroll="true"
      className="h-full overflow-y-auto overscroll-contain pb-safe"
    >
      {children}
    </div>
  );
}

function ReorderableRow<T>({
  value,
  disabled = false,
  reorderEnabled,
  onDragEnd,
  children,
}: {
  value: T;
  disabled?: boolean;
  reorderEnabled: boolean;
  onDragEnd?: () => void;
  children: ReactNode;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, zIndex: 50 }}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="relative"
    >
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">{children}</div>
        {reorderEnabled ? (
          <button
            type="button"
            data-home-carousel-swipe-lock="true"
            onPointerDown={(event) => {
              if (disabled) return;
              triggerHaptic();
              dragControls.start(event);
            }}
            className={`flex items-center justify-center bg-card px-3 text-muted-foreground ${
              disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ touchAction: 'none' }}
            aria-label="Drag to reorder"
            disabled={disabled}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </Reorder.Item>
  );
}

function SwipeGestureLock({ children }: { children: ReactNode }) {
  return <div data-home-carousel-swipe-lock="true">{children}</div>;
}

export function SettingsView({ onToast, analyticsSync }: SettingsViewProps) {
  const { isOnline } = useConnectivity();
  const {
    onboarding,
    isSyncing,
    isUpdating,
    updateOnboarding,
    refreshSettings,
    settingsSyncResult,
    settingsSyncState,
    settingsSyncStatus,
    settingsSyncError,
    hasLegacyQuickNotesMigrationPrompt,
    importLegacyQuickNotes,
    isImportingLegacyQuickNotes,
  } = useOnboarding();
  const {
    addAccount,
    removeAccount,
    updateAccountMeta,
    reorderAccounts,
    isSaving: isAccountSaving,
  } = useAccountMutations(onToast);
  const {
    addCategory,
    removeCategory,
    updateCategoryMeta,
    reorderCategories,
    isSaving: isCategorySaving,
  } = useCategoryMutations(onToast);
  const { data: quickNotesConfig } = useQuickNotesQuery();
  const updateQuickNotes = useUpdateQuickNotes();
  const updateDefaultQuickNotes = useUpdateDefaultQuickNotes();

  const [stack, setStack] = useState<SettingsScreen[]>([{ screen: 'main' }]);
  const [direction, setDirection] = useState(0);
  const [accountsEditMode, setAccountsEditMode] = useState(false);
  const [categoriesEditMode, setCategoriesEditMode] = useState(false);
  const [quickNotesEditMode, setQuickNotesEditMode] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>('expense');
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [quickNoteEditMode, setQuickNoteEditMode] = useState<{
    isOpen: boolean;
    note: QuickNote | null;
  }>({ isOpen: false, note: null });

  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const accountNameInputRef = useRef<HTMLInputElement>(null);
  const categoryNameInputRef = useRef<HTMLInputElement>(null);
  const accounts = onboarding.accounts ?? [];
  const categories = onboarding.categories ?? {
    expense: [],
    income: [],
    transfer: [],
  };
  const currentScreen = stack.at(-1) ?? { screen: 'main' };
  const isSaving = isAccountSaving || isCategorySaving;
  const isSettingsSyncBusy = isSyncing || isImportingLegacyQuickNotes;
  const isQuickNotesSaving = updateQuickNotes.isPending || updateDefaultQuickNotes.isPending;

  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [localCategoriesByType, setLocalCategoriesByType] = useState<
    Record<TransactionType, CategoryItem[]>
  >({
    expense: categories.expense ?? [],
    income: categories.income ?? [],
    transfer: categories.transfer ?? [],
  });

  useEffect(() => setLocalAccounts(accounts), [accounts]);
  useEffect(() => {
    setLocalCategoriesByType({
      expense: categories.expense ?? [],
      income: categories.income ?? [],
      transfer: categories.transfer ?? [],
    });
  }, [categories.expense, categories.income, categories.transfer]);

  const quickNotes = useMemo(() => {
    if (currentScreen.screen === 'quickNotes') {
      return getQuickNotesForCategory(
        quickNotesConfig,
        currentScreen.categoryType,
        currentScreen.categoryName,
      );
    }
    if (currentScreen.screen === 'defaultQuickNotes') {
      return getDefaultQuickNotes(quickNotesConfig, currentScreen.categoryType);
    }
    return [];
  }, [currentScreen, quickNotesConfig]);
  const [localQuickNotes, setLocalQuickNotes] = useState<QuickNote[]>([]);
  useEffect(() => setLocalQuickNotes(quickNotes), [quickNotes]);

  useEffect(() => {
    if (currentScreen.screen === 'accountCreate') {
      requestAnimationFrame(() => accountNameInputRef.current?.focus());
    } else if (currentScreen.screen === 'categoryCreate') {
      requestAnimationFrame(() => categoryNameInputRef.current?.focus());
    }
  }, [currentScreen.screen]);

  useEffect(() => {
    if (
      currentScreen.screen !== 'quickNotes' &&
      currentScreen.screen !== 'defaultQuickNotes' &&
      quickNoteEditMode.isOpen
    ) {
      setQuickNoteEditMode({ isOpen: false, note: null });
    }
  }, [currentScreen.screen, quickNoteEditMode.isOpen]);

  const push = useCallback((screen: SettingsScreen) => {
    triggerHaptic();
    setDirection(1);
    setStack((current) => [...current, screen]);
  }, []);
  const pop = useCallback(() => {
    triggerHaptic();
    setDirection(-1);
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const settingsSectionErrors = {
    ...(settingsSyncResult?.errors ?? {}),
    ...(settingsSyncState?.errors ?? {}),
  };
  const settingsConflicts = SETTINGS_SECTIONS.filter((section) =>
    settingsSyncResult?.conflicts.includes(section),
  );
  const hasSettingsSectionErrors = SETTINGS_SECTIONS.some(
    (section) => settingsSectionErrors[section],
  );
  const settingsSyncErrorMessage = settingsSyncError?.message ?? null;
  const globalSettingsError =
    settingsSyncErrorMessage &&
    !SETTINGS_SECTIONS.some(
      (section) => settingsSectionErrors[section] === settingsSyncErrorMessage,
    )
      ? settingsSyncErrorMessage
      : null;
  const settingsStatusLabel =
    settingsSyncStatus === 'error' || settingsSyncError || hasSettingsSectionErrors
      ? 'Needs attention'
      : isSettingsSyncBusy || settingsSyncStatus === 'pending'
        ? 'Pending'
        : 'Synced';
  const settingsStatusTone =
    settingsStatusLabel === 'Needs attention'
      ? 'text-danger'
      : settingsStatusLabel === 'Pending'
        ? 'text-warning'
        : 'text-success';
  const hasSettingsDiagnostics =
    Boolean(globalSettingsError) || hasSettingsSectionErrors || settingsConflicts.length > 0;

  const quickNotesTarget =
    currentScreen.screen === 'quickNotes'
      ? {
          kind: 'category' as const,
          type: currentScreen.categoryType,
          categoryName: currentScreen.categoryName,
        }
      : currentScreen.screen === 'defaultQuickNotes'
        ? { kind: 'default' as const, type: currentScreen.categoryType }
        : null;

  const currentEditItem =
    editingItem?.type === 'account'
      ? accounts.find((account) => account.name === editingItem.name)
      : categories[editingItem?.categoryType ?? 'expense']?.find(
          (category) => category.name === editingItem?.name,
        );

  async function handleSettingsRefresh() {
    if (!isOnline || isSettingsSyncBusy) return;
    try {
      await refreshSettings();
    } catch {
      // Persistent sync diagnostics already surface the failure inline.
    }
  }

  async function handleLegacyQuickNotesImport() {
    if (!isOnline || isSettingsSyncBusy) return;
    try {
      await importLegacyQuickNotes();
    } catch {
      // Persistent sync diagnostics already surface the failure inline.
    }
  }

  function handleAddAccount() {
    const name = newAccountName.trim();
    if (!name) {
      onToast('Enter an account name');
      return;
    }
    if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      onToast('Account already exists');
      return;
    }
    addAccount.mutate(
      { name },
      {
        onSuccess: () => {
          setNewAccountName('');
          pop();
        },
      },
    );
  }

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      onToast('Enter a category name');
      return;
    }
    if (
      (categories[newCategoryType] ?? []).some(
        (category) => category.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      onToast('Category already exists');
      return;
    }
    addCategory.mutate(
      { name, categoryType: newCategoryType },
      {
        onSuccess: () => {
          setNewCategoryName('');
          pop();
        },
      },
    );
  }

  function handleAppearanceSave(icon: string, color: string) {
    if (!editingItem) return;
    if (editingItem.type === 'account') {
      updateAccountMeta.mutate({ name: editingItem.name, icon, color });
    } else {
      updateCategoryMeta.mutate({
        name: editingItem.name,
        categoryType: editingItem.categoryType,
        icon,
        color,
      });
    }
    setEditingItem(null);
  }

  function handleAccountReorderEnd() {
    if (accounts.some((account, index) => account.name !== localAccounts[index]?.name)) {
      reorderAccounts.mutate({ accounts: localAccounts });
    }
  }

  function handleCategoryReorderEnd(categoryType: TransactionType) {
    const current = categories[categoryType] ?? [];
    const local = localCategoriesByType[categoryType] ?? [];
    if (current.some((category, index) => category.name !== local[index]?.name)) {
      reorderCategories.mutate({ categories: local, categoryType });
    }
  }

  function persistCurrentQuickNotes(updatedNotes: QuickNote[], onSuccess?: () => void) {
    if (!quickNotesTarget) return;
    if (quickNotesTarget.kind === 'category') {
      persistQuickNotesOptimistically({
        authoritativeNotes: quickNotes,
        optimisticNotes: updatedNotes,
        setLocalNotes: setLocalQuickNotes,
        mutate: (variables, callbacks) => updateQuickNotes.mutate(variables, callbacks),
        variables: {
          type: quickNotesTarget.type,
          categoryName: quickNotesTarget.categoryName,
          notes: updatedNotes,
        },
        onToast,
        onSuccess,
      });
      return;
    }
    persistQuickNotesOptimistically({
      authoritativeNotes: quickNotes,
      optimisticNotes: updatedNotes,
      setLocalNotes: setLocalQuickNotes,
      mutate: (variables, callbacks) => updateDefaultQuickNotes.mutate(variables, callbacks),
      variables: { type: quickNotesTarget.type, notes: updatedNotes },
      onToast,
      onSuccess,
    });
  }

  function handleSaveQuickNote(noteData: Omit<QuickNote, 'id'> & { id?: string }) {
    if (!quickNotesTarget) return;
    const note: QuickNote = {
      id: noteData.id ?? generateQuickNoteId(),
      icon: noteData.icon,
      label: noteData.label,
      note: noteData.note,
      amount: noteData.amount,
      currency: noteData.currency,
      account: noteData.account,
      forValue: noteData.forValue,
    };
    const updated = noteData.id
      ? localQuickNotes.map((current) => (current.id === note.id ? note : current))
      : [...localQuickNotes, note];
    persistCurrentQuickNotes(updated, () =>
      setQuickNoteEditMode({ isOpen: false, note: null }),
    );
  }

  function renderMain() {
    return (
      <ScreenScroll screenKey="main" scrollPositions={scrollPositionsRef}>
        <SettingsSectionLabel>SYNC</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={
              <RefreshCw className={`h-4 w-4 ${isSettingsSyncBusy ? 'animate-spin' : ''}`} />
            }
            iconBg="#007AFF"
            title="Sync Settings"
            onPress={() => void handleSettingsRefresh()}
            disabled={!isOnline || isSettingsSyncBusy}
            showChevron={false}
            ariaBusy={isSettingsSyncBusy}
            rightAccessory={
              <span
                aria-live="polite"
                className={`shrink-0 whitespace-nowrap text-[13px] font-medium ${settingsStatusTone}`}
              >
                {settingsStatusLabel}
              </span>
            }
          />
          {hasSettingsDiagnostics ? (
            <>
              <div className="ml-[56px] h-px bg-border/70" />
              <div className="min-w-0 space-y-2 px-4 py-3 text-[13px] leading-5">
                {globalSettingsError ? (
                  <p role="alert" className="min-w-0 break-words text-danger">
                    {globalSettingsError}
                  </p>
                ) : null}
                {SETTINGS_SECTIONS.map((section) => {
                  const error = settingsSectionErrors[section];
                  return error ? (
                    <p key={section} role="alert" className="min-w-0 break-words text-danger">
                      <span className="font-semibold">{SETTINGS_SECTION_LABELS[section]}:</span>{' '}
                      {error}
                    </p>
                  ) : null;
                })}
                {settingsConflicts.map((section) => (
                  <output key={section} className="block min-w-0 break-words text-warning">
                    {SETTINGS_SECTION_LABELS[section]} changed in both places; the Sheet version was
                    kept.
                  </output>
                ))}
              </div>
            </>
          ) : null}
        </SettingsGroup>

        {!isOnline ? (
          <div className="min-w-0 break-words px-4 pt-3 text-[13px] leading-5 text-muted-foreground">
            You’re offline. Changes stay on this device and will sync when you reconnect.
          </div>
        ) : null}

        {hasLegacyQuickNotesMigrationPrompt ? (
          <>
            <SettingsSectionLabel>QUICK NOTES IMPORT</SettingsSectionLabel>
            <SettingsGroup>
              <div className="min-w-0 px-4 py-3">
                <p className="min-w-0 break-words text-[13px] leading-5 text-muted-foreground">
                  Quick Notes from another Sheet were found on this device. Importing will replace
                  this Sheet’s Quick Notes.
                </p>
                <button
                  type="button"
                  onClick={() => void handleLegacyQuickNotesImport()}
                  disabled={!isOnline || isSettingsSyncBusy}
                  aria-busy={isImportingLegacyQuickNotes}
                  className="mt-3 min-h-11 w-full rounded-[12px] bg-primary px-4 py-2.5 text-[15px] font-semibold text-primary-foreground active:bg-primary/90 disabled:opacity-50"
                >
                  {isImportingLegacyQuickNotes ? 'Importing…' : 'Import'}
                </button>
              </div>
            </SettingsGroup>
          </>
        ) : null}

        <SettingsSectionLabel>ANALYTICS</SettingsSectionLabel>
        <SettingsGroup>
          <AnalyticsBaseCurrencySetting
            value={onboarding.analyticsBaseCurrency}
            disabled={isUpdating}
            onChange={(analyticsBaseCurrency) => {
              const updatedAt = new Date().toISOString();
              void updateOnboarding({
                analyticsBaseCurrency,
                analyticsBaseCurrencyUpdatedAt: updatedAt,
                analyticsBigSpendingThreshold: {
                  amount: null,
                  currency: analyticsBaseCurrency,
                  updatedAt,
                },
              }).catch(() => onToast('Base currency saved locally; sync pending'));
            }}
          />
          <div className="ml-[56px] h-px bg-border/70" />
          <AnalyticsSyncSetting
            status={analyticsSync.status}
            lastSyncedAt={analyticsSync.lastSyncedAt}
            isResyncing={analyticsSync.isResyncing}
            onResync={analyticsSync.resync}
          />
          <div className="ml-[56px] h-px bg-border/70" />
          <AnalyticsBigSpendingThresholdSetting
            currency={onboarding.analyticsBaseCurrency}
            value={
              onboarding.analyticsBigSpendingThreshold?.currency ===
              onboarding.analyticsBaseCurrency
                ? onboarding.analyticsBigSpendingThreshold.amount
                : null
            }
            disabled={isUpdating}
            onInvalid={() => onToast('Enter an amount greater than zero.')}
            onCommit={(amount) => {
              void updateOnboarding({
                analyticsBigSpendingThreshold: {
                  amount,
                  currency: onboarding.analyticsBaseCurrency,
                  updatedAt: new Date().toISOString(),
                },
              }).catch(() => onToast('Big spending cutoff saved locally; sync pending'));
            }}
          />
        </SettingsGroup>

        <SettingsSectionLabel>MANAGE</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<Wallet className="h-4 w-4" />}
            iconBg="#34C759"
            title="Accounts"
            detail={`${accounts.length}`}
            onPress={() => push({ screen: 'accounts' })}
          />
          <div className="ml-[56px] h-px bg-border/70" />
          <SettingsRow
            icon={<Tags className="h-4 w-4" />}
            iconBg="#AF52DE"
            title="Categories"
            detail={`${Object.values(categories).reduce((sum, list) => sum + list.length, 0)}`}
            onPress={() => push({ screen: 'categories' })}
          />
        </SettingsGroup>
        <div className="h-6" />
      </ScreenScroll>
    );
  }

  function renderAccounts() {
    return (
      <ScreenScroll screenKey="accounts" scrollPositions={scrollPositionsRef}>
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[34px] font-bold leading-tight text-foreground">Accounts</h2>
        </div>
        <SettingsSectionLabel>ACCOUNTS ({accounts.length})</SettingsSectionLabel>
        <SettingsGroup>
          {localAccounts.length ? (
            <Reorder.Group axis="y" values={localAccounts} onReorder={setLocalAccounts}>
              {localAccounts.map((account, index) => (
                <ReorderableRow
                  key={account.name}
                  value={account}
                  reorderEnabled={accountsEditMode}
                  disabled={isSaving}
                  onDragEnd={handleAccountReorderEnd}
                >
                  <SwipeGestureLock>
                    <SwipeableListItem
                      onDelete={() => removeAccount.mutate({ name: account.name })}
                      disabled={isSaving}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!accountsEditMode) {
                            push({ screen: 'accountDetail', accountName: account.name });
                          }
                        }}
                        className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-[9px]"
                          style={{ backgroundColor: account.color || DEFAULT_ACCOUNT_COLOR }}
                        >
                          <DynamicIcon name={account.icon} className="h-4 w-4 text-white" />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[17px] text-foreground">
                          {account.name}
                        </span>
                        {!accountsEditMode ? (
                          <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                        ) : null}
                      </button>
                      {index < localAccounts.length - 1 ? (
                        <div className="ml-[56px] h-px bg-border/70" />
                      ) : null}
                    </SwipeableListItem>
                  </SwipeGestureLock>
                </ReorderableRow>
              ))}
            </Reorder.Group>
          ) : (
            <div className="px-4 py-6 text-center text-[15px] text-muted-foreground">
              No accounts yet
            </div>
          )}
          {localAccounts.length ? <div className="ml-[56px] h-px bg-border/70" /> : null}
          <button
            type="button"
            onClick={() => {
              setNewAccountName('');
              push({ screen: 'accountCreate' });
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
            disabled={isSaving}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <span className="text-[17px] font-semibold text-primary">Add Account</span>
          </button>
        </SettingsGroup>
      </ScreenScroll>
    );
  }

  function renderAccountCreate() {
    return (
      <ScreenScroll screenKey="accountCreate" scrollPositions={scrollPositionsRef}>
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[34px] font-bold leading-tight text-foreground">New Account</h2>
        </div>
        <SettingsSectionLabel>DETAILS</SettingsSectionLabel>
        <SettingsGroup>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-20 text-[17px] text-foreground">Name</div>
            <input
              ref={accountNameInputRef}
              type="text"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAddAccount();
              }}
              placeholder="e.g. Cash"
              disabled={isSaving}
              className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
          </div>
        </SettingsGroup>
        <div className="px-4 pt-3 text-[13px] text-muted-foreground">
          Accounts sync to your Sheet when you’re online.
        </div>
      </ScreenScroll>
    );
  }

  function renderAccountDetail(screen: Extract<SettingsScreen, { screen: 'accountDetail' }>) {
    const account = accounts.find((item) => item.name === screen.accountName);
    return (
      <ScreenScroll screenKey={getScreenKey(screen)} scrollPositions={scrollPositionsRef}>
        {!account ? (
          <div className="px-4 py-6 text-[15px] text-muted-foreground">Account not found</div>
        ) : (
          <>
            <div className="px-4 pb-2 pt-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[14px]"
                  style={{ backgroundColor: account.color || DEFAULT_ACCOUNT_COLOR }}
                >
                  <DynamicIcon name={account.icon} className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[28px] font-bold leading-tight text-foreground">
                    {account.name}
                  </h2>
                  <div className="text-[13px] text-muted-foreground">Account settings</div>
                </div>
              </div>
            </div>
            <SettingsSectionLabel>APPEARANCE</SettingsSectionLabel>
            <SettingsGroup>
              <SettingsRow
                icon={<DynamicIcon name={account.icon} className="h-4 w-4 text-white" />}
                iconBg={account.color || DEFAULT_ACCOUNT_COLOR}
                title="Icon & Color"
                onPress={() => setEditingItem({ type: 'account', name: account.name })}
              />
            </SettingsGroup>
            <SettingsSectionLabel>DANGER ZONE</SettingsSectionLabel>
            <SettingsGroup>
              <SettingsRow
                icon={<Trash2 className="h-4 w-4" />}
                iconBg="#FF3B30"
                title="Delete Account"
                tone="danger"
                showChevron={false}
                disabled={isSaving}
                onPress={() => {
                  if (!window.confirm('Delete this account?')) return;
                  removeAccount.mutate({ name: account.name }, { onSuccess: pop });
                }}
              />
            </SettingsGroup>
          </>
        )}
      </ScreenScroll>
    );
  }

  function renderCategories() {
    return (
      <ScreenScroll screenKey="categories" scrollPositions={scrollPositionsRef}>
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[34px] font-bold leading-tight text-foreground">Categories</h2>
        </div>
        {CATEGORY_TYPES.map(({ key, label }) => {
          const list = localCategoriesByType[key] ?? [];
          return (
            <div key={key}>
              <SettingsSectionLabel>{label.toUpperCase()} ({list.length})</SettingsSectionLabel>
              <SettingsGroup>
                <SettingsRow
                  icon={<Zap className="h-4 w-4" />}
                  iconBg="#FF9500"
                  title="Default Quick Notes"
                  detail={`${getDefaultQuickNotes(quickNotesConfig, key).length}/${MAX_QUICK_NOTES}`}
                  onPress={() => {
                    if (!categoriesEditMode) push({ screen: 'defaultQuickNotes', categoryType: key });
                  }}
                />
                <div className="ml-[56px] h-px bg-border/70" />
                {list.length ? (
                  <Reorder.Group
                    axis="y"
                    values={list}
                    onReorder={(next) =>
                      setLocalCategoriesByType((current) => ({ ...current, [key]: next }))
                    }
                  >
                    {list.map((category, index) => (
                      <ReorderableRow
                        key={category.name}
                        value={category}
                        reorderEnabled={categoriesEditMode}
                        disabled={isSaving}
                        onDragEnd={() => handleCategoryReorderEnd(key)}
                      >
                        <SwipeGestureLock>
                          <SwipeableListItem
                            onDelete={() =>
                              removeCategory.mutate({
                                name: category.name,
                                categoryType: key,
                              })
                            }
                            disabled={isSaving}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (!categoriesEditMode) {
                                  push({
                                    screen: 'categoryDetail',
                                    categoryName: category.name,
                                    categoryType: key,
                                  });
                                }
                              }}
                              className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                            >
                              <div
                                className="flex h-8 w-8 items-center justify-center rounded-[9px]"
                                style={{
                                  backgroundColor: category.color || DEFAULT_CATEGORY_COLORS[key],
                                }}
                              >
                                <DynamicIcon
                                  name={category.icon}
                                  fallback={DEFAULT_CATEGORY_ICONS[key]}
                                  className="h-4 w-4 text-white"
                                />
                              </div>
                              <span className="min-w-0 flex-1 truncate text-[17px] text-foreground">
                                {category.name}
                              </span>
                              {!categoriesEditMode ? (
                                <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                              ) : null}
                            </button>
                            {index < list.length - 1 ? (
                              <div className="ml-[56px] h-px bg-border/70" />
                            ) : null}
                          </SwipeableListItem>
                        </SwipeGestureLock>
                      </ReorderableRow>
                    ))}
                  </Reorder.Group>
                ) : null}
                {list.length ? <div className="ml-[56px] h-px bg-border/70" /> : null}
                <button
                  type="button"
                  onClick={() => {
                    setNewCategoryName('');
                    setNewCategoryType(key);
                    push({ screen: 'categoryCreate', categoryType: key });
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                  disabled={isSaving}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary">
                    <Plus className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-[17px] font-semibold text-primary">Add {label} Category</span>
                </button>
              </SettingsGroup>
            </div>
          );
        })}
      </ScreenScroll>
    );
  }

  function renderCategoryCreate() {
    return (
      <ScreenScroll screenKey={getScreenKey(currentScreen)} scrollPositions={scrollPositionsRef}>
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[34px] font-bold leading-tight text-foreground">New Category</h2>
        </div>
        <SegmentedControl
          value={newCategoryType}
          options={CATEGORY_TYPES.map(({ key, label }) => ({ value: key, label }))}
          onChange={setNewCategoryType}
        />
        <SettingsSectionLabel>DETAILS</SettingsSectionLabel>
        <SettingsGroup>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-20 text-[17px] text-foreground">Name</div>
            <input
              ref={categoryNameInputRef}
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAddCategory();
              }}
              placeholder="e.g. Groceries"
              disabled={isSaving}
              className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
          </div>
        </SettingsGroup>
      </ScreenScroll>
    );
  }

  function renderCategoryDetail(
    screen: Extract<SettingsScreen, { screen: 'categoryDetail' }>,
  ) {
    const category = (categories[screen.categoryType] ?? []).find(
      (item) => item.name === screen.categoryName,
    );
    return (
      <ScreenScroll screenKey={getScreenKey(screen)} scrollPositions={scrollPositionsRef}>
        {!category ? (
          <div className="px-4 py-6 text-[15px] text-muted-foreground">Category not found</div>
        ) : (
          <>
            <div className="px-4 pb-2 pt-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[14px]"
                  style={{
                    backgroundColor: category.color || DEFAULT_CATEGORY_COLORS[screen.categoryType],
                  }}
                >
                  <DynamicIcon
                    name={category.icon}
                    fallback={DEFAULT_CATEGORY_ICONS[screen.categoryType]}
                    className="h-6 w-6 text-white"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[28px] font-bold leading-tight text-foreground">
                    {category.name}
                  </h2>
                  <div className="text-[13px] text-muted-foreground">
                    {screen.categoryType} category
                  </div>
                </div>
              </div>
            </div>
            <SettingsSectionLabel>APPEARANCE</SettingsSectionLabel>
            <SettingsGroup>
              <SettingsRow
                icon={
                  <DynamicIcon
                    name={category.icon}
                    fallback={DEFAULT_CATEGORY_ICONS[screen.categoryType]}
                    className="h-4 w-4 text-white"
                  />
                }
                iconBg={category.color || DEFAULT_CATEGORY_COLORS[screen.categoryType]}
                title="Icon & Color"
                onPress={() =>
                  setEditingItem({
                    type: 'category',
                    name: category.name,
                    categoryType: screen.categoryType,
                  })
                }
              />
            </SettingsGroup>
            <SettingsSectionLabel>QUICK NOTES</SettingsSectionLabel>
            <SettingsGroup>
              <SettingsRow
                icon={<Zap className="h-4 w-4" />}
                iconBg="#FF9500"
                title="Quick Notes"
                detail={`${getQuickNotesForCategory(quickNotesConfig, screen.categoryType, screen.categoryName).length}/${MAX_QUICK_NOTES}`}
                onPress={() =>
                  push({
                    screen: 'quickNotes',
                    categoryName: screen.categoryName,
                    categoryType: screen.categoryType,
                  })
                }
              />
            </SettingsGroup>
            <SettingsSectionLabel>DANGER ZONE</SettingsSectionLabel>
            <SettingsGroup>
              <SettingsRow
                icon={<Trash2 className="h-4 w-4" />}
                iconBg="#FF3B30"
                title="Delete Category"
                tone="danger"
                showChevron={false}
                disabled={isSaving}
                onPress={() => {
                  if (!window.confirm('Delete this category?')) return;
                  removeCategory.mutate(
                    { name: category.name, categoryType: screen.categoryType },
                    { onSuccess: pop },
                  );
                }}
              />
            </SettingsGroup>
          </>
        )}
      </ScreenScroll>
    );
  }

  function renderQuickNotes(
    screen: Extract<SettingsScreen, { screen: 'quickNotes' | 'defaultQuickNotes' }>,
  ) {
    const canAddMore = localQuickNotes.length < MAX_QUICK_NOTES;
    return (
      <ScreenScroll screenKey={getScreenKey(screen)} scrollPositions={scrollPositionsRef}>
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[34px] font-bold leading-tight text-foreground">
            {getScreenTitle(screen)}
          </h2>
        </div>
        <div className="px-4 pb-2 text-[13px] text-muted-foreground">
          {screen.screen === 'defaultQuickNotes'
            ? `Shown for any ${screen.categoryType} category without custom quick notes. Max ${MAX_QUICK_NOTES}.`
            : `Long press on a category while logging to quickly add a pre-filled note. Max ${MAX_QUICK_NOTES} per category.`}
        </div>
        <SettingsGroup>
          {localQuickNotes.length ? (
            <Reorder.Group axis="y" values={localQuickNotes} onReorder={setLocalQuickNotes}>
              {localQuickNotes.map((note, index) => (
                <ReorderableRow
                  key={note.id}
                  value={note}
                  reorderEnabled={quickNotesEditMode}
                  disabled={isQuickNotesSaving}
                  onDragEnd={() => {
                    if (
                      quickNotes.some((item, itemIndex) =>
                        item.id !== localQuickNotes[itemIndex]?.id,
                      )
                    ) {
                      persistCurrentQuickNotes(localQuickNotes);
                    }
                  }}
                >
                  <SwipeGestureLock>
                    <SwipeableListItem
                      onDelete={() =>
                        persistCurrentQuickNotes(
                          localQuickNotes.filter((item) => item.id !== note.id),
                        )
                      }
                      disabled={isQuickNotesSaving}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!quickNotesEditMode) {
                            setQuickNoteEditMode({ isOpen: true, note });
                          }
                        }}
                        className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border/70 bg-surface-2">
                          <DynamicIcon name={note.icon} className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[17px] text-foreground">{note.label}</div>
                          <div className="truncate text-[13px] text-muted-foreground">{note.note}</div>
                        </div>
                        {!quickNotesEditMode ? (
                          <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                        ) : null}
                      </button>
                      {index < localQuickNotes.length - 1 ? (
                        <div className="ml-[56px] h-px bg-border/70" />
                      ) : null}
                    </SwipeableListItem>
                  </SwipeGestureLock>
                </ReorderableRow>
              ))}
            </Reorder.Group>
          ) : (
            <div className="px-4 py-6 text-center text-[15px] text-muted-foreground">
              {screen.screen === 'defaultQuickNotes'
                ? 'No default quick notes yet'
                : 'No quick notes yet'}
            </div>
          )}
          {canAddMore ? (
            <>
              {localQuickNotes.length ? <div className="ml-[56px] h-px bg-border/70" /> : null}
              <button
                type="button"
                onClick={() => setQuickNoteEditMode({ isOpen: true, note: null })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                disabled={isQuickNotesSaving}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary">
                  <Plus className="h-4 w-4 text-white" />
                </div>
                <span className="text-[17px] font-semibold text-primary">Add Quick Note</span>
              </button>
            </>
          ) : null}
        </SettingsGroup>
      </ScreenScroll>
    );
  }

  function renderScreen() {
    switch (currentScreen.screen) {
      case 'main':
        return renderMain();
      case 'accounts':
        return renderAccounts();
      case 'accountCreate':
        return renderAccountCreate();
      case 'accountDetail':
        return renderAccountDetail(currentScreen);
      case 'categories':
        return renderCategories();
      case 'categoryCreate':
        return renderCategoryCreate();
      case 'categoryDetail':
        return renderCategoryDetail(currentScreen);
      case 'quickNotes':
      case 'defaultQuickNotes':
        return renderQuickNotes(currentScreen);
    }
  }

  const nestedAction = (() => {
    switch (currentScreen.screen) {
      case 'accounts':
        return (
          <button
            type="button"
            onClick={() => setAccountsEditMode((value) => !value)}
            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
          >
            {accountsEditMode ? 'Done' : 'Edit'}
          </button>
        );
      case 'categories':
        return (
          <button
            type="button"
            onClick={() => setCategoriesEditMode((value) => !value)}
            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
          >
            {categoriesEditMode ? 'Done' : 'Edit'}
          </button>
        );
      case 'quickNotes':
      case 'defaultQuickNotes':
        return (
          <button
            type="button"
            onClick={() => setQuickNotesEditMode((value) => !value)}
            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
          >
            {quickNotesEditMode ? 'Done' : 'Edit'}
          </button>
        );
      case 'accountCreate':
        return (
          <button
            type="button"
            onClick={handleAddAccount}
            disabled={isSaving}
            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary disabled:opacity-50"
          >
            Add
          </button>
        );
      case 'categoryCreate':
        return (
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={isSaving}
            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary disabled:opacity-50"
          >
            Add
          </button>
        );
      default:
        return <div className="w-12" />;
    }
  })();

  return (
    <section
      data-testid="settings-view"
      aria-label="Settings"
      className="flex h-full min-h-0 flex-col bg-transparent"
      style={{
        paddingTop: 'var(--dashboard-header-space, var(--dashboard-header-height, 68px))',
      }}
    >
      {stack.length > 1 ? (
        <div className="z-10 shrink-0 border-b border-border/60 bg-surface/90 backdrop-blur">
          <div className="relative flex items-center justify-between px-2 pb-2 pt-2">
            <div className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                onClick={pop}
                className="flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-primary active:bg-surface-2"
              >
                <ChevronLeft className="h-5 w-5 shrink-0" />
                <span className="min-w-0 truncate text-[17px]">
                  {getScreenTitle(stack[stack.length - 2] ?? { screen: 'main' })}
                </span>
              </button>
            </div>
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 px-8">
              <AnimatePresence custom={direction} initial={false} mode="popLayout">
                <motion.span
                  key={getScreenKey(currentScreen)}
                  custom={direction}
                  variants={navTitleVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={navTitleTransition}
                  className="block max-w-[70vw] truncate text-center text-[17px] font-semibold text-foreground"
                >
                  {getScreenTitle(currentScreen)}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="flex min-w-0 flex-1 justify-end">{nestedAction}</div>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence custom={direction} initial={false}>
          <motion.div
            key={getScreenKey(currentScreen)}
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={screenTransition}
            className="absolute inset-0 h-full bg-transparent"
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </div>

      <AppearancePicker
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        initialIcon={currentEditItem?.icon}
        initialColor={currentEditItem?.color}
        defaultIcon={
          editingItem?.type === 'account'
            ? DEFAULT_ACCOUNT_ICON
            : DEFAULT_CATEGORY_ICONS[editingItem?.categoryType ?? 'expense']
        }
        defaultColor={
          editingItem?.type === 'account'
            ? DEFAULT_ACCOUNT_COLOR
            : DEFAULT_CATEGORY_COLORS[editingItem?.categoryType ?? 'expense']
        }
        onSave={handleAppearanceSave}
        title={`Edit ${editingItem?.type === 'account' ? 'Account' : 'Category'}`}
      />

      {quickNoteEditMode.isOpen &&
      (currentScreen.screen === 'quickNotes' || currentScreen.screen === 'defaultQuickNotes') ? (
        <div data-home-carousel-swipe-lock="true">
          <QuickNoteFlow
            note={quickNoteEditMode.note}
            onSave={handleSaveQuickNote}
            onCancel={() => setQuickNoteEditMode({ isOpen: false, note: null })}
            onDelete={() => {
              if (!quickNoteEditMode.note) return;
              persistCurrentQuickNotes(
                localQuickNotes.filter((note) => note.id !== quickNoteEditMode.note?.id),
                () => setQuickNoteEditMode({ isOpen: false, note: null }),
              );
            }}
            transactionType={currentScreen.categoryType}
          />
        </div>
      ) : null}
    </section>
  );
}
