import { Reorder, useDragControls } from 'framer-motion';
import {
  AlertCircle,
  Cloud,
  Database,
  GripVertical,
  Plus,
  RefreshCw,
  Tags,
  Wallet,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '../app/providers';
import { useAccountMutations } from '../hooks/useAccountMutations';
import { useCategoryMutations } from '../hooks/useCategoryMutations';
import { useOnboarding } from '../hooks/useOnboarding';
import {
  useQuickNotesQuery,
  useReplaceQuickNotesConfig,
  useUpdateDefaultQuickNotes,
  useUpdateQuickNotes,
} from '../hooks/useQuickNotes';
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
} from '../lib/icons';
import {
  buildQuickNotesGroups,
  renameQuickNotesAccountReferences,
  renameQuickNotesCategoryGroup,
  type QuickNotesControlGroup,
} from '../lib/settingsControlCenter';
import { SETTINGS_SECTIONS, type SettingsSection } from '../lib/settingsSync';
import type {
  QuickNote,
  QuickNotesConfig,
  TransactionType,
} from '../lib/types';
import { AnalyticsBaseCurrencySetting } from './AnalyticsBaseCurrencySetting';
import { AnalyticsBigSpendingThresholdSetting } from './AnalyticsBigSpendingThresholdSetting';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';
import { DynamicIcon } from './DynamicIcon';
import { SettingsControlSection } from './SettingsControlSection';
import {
  SettingsItemEditorDrawer,
  type SettingsItemEditorTarget,
} from './SettingsItemEditorDrawer';
import {
  SettingsQuickNoteEditorDrawer,
  type SettingsQuickNoteTarget,
} from './SettingsQuickNoteEditorDrawer';
import type { AnalyticsSyncController } from './TransactionFlow/useAnalyticsSync';

export type SettingsViewProps = {
  onToast: (message: string) => void;
  analyticsSync: Pick<
    AnalyticsSyncController,
    'history' | 'status' | 'isResyncing' | 'resync'
  >;
  onCarouselNavigationLockChange?: (locked: boolean) => void;
};

type ControlSectionId = 'accounts' | 'categories' | 'quickNotes' | 'data';

type ItemEditorState = {
  target: SettingsItemEditorTarget;
};

type QuickNoteEditorState = {
  groupKey: string;
  target: SettingsQuickNoteTarget;
  mode: 'create' | 'edit';
  note: QuickNote;
};

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

function triggerHaptic(ms = 10) {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

function generateQuickNoteId(): string {
  return `qn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function arraysMatchByName(
  first: ReadonlyArray<{ name: string }>,
  second: ReadonlyArray<{ name: string }>,
): boolean {
  return (
    first.length === second.length &&
    first.every((item, index) => item.name === second[index]?.name)
  );
}

function notesMatchById(first: QuickNote[], second: QuickNote[]): boolean {
  return (
    first.length === second.length &&
    first.every((item, index) => item.id === second[index]?.id)
  );
}

function InlineReorderRow<T>({
  value,
  label,
  disabled,
  onDragEnd,
  children,
}: {
  value: T;
  label: string;
  disabled?: boolean;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={value}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, zIndex: 30 }}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="relative"
    >
      <div className="flex min-h-14 items-stretch">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          data-home-carousel-swipe-lock="true"
          aria-label={`Drag ${label} to reorder`}
          disabled={disabled}
          onPointerDown={(event) => {
            if (disabled) return;
            triggerHaptic();
            dragControls.start(event);
          }}
          className="flex w-12 shrink-0 items-center justify-center text-muted-foreground active:text-foreground disabled:opacity-40"
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      </div>
    </Reorder.Item>
  );
}

function RowDivider() {
  return <div className="ml-14 h-px bg-border/70" />;
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function QuickNotesTargetPanel({
  group,
  isSaving,
  onOpenNote,
  onAdd,
  onReorder,
}: {
  group: QuickNotesControlGroup;
  isSaving: boolean;
  onOpenNote: (note: QuickNote, origin: HTMLElement) => void;
  onAdd: (origin: HTMLElement) => void;
  onReorder: (notes: QuickNote[]) => void;
}) {
  const [localNotes, setLocalNotes] = useState(group.notes);

  useEffect(() => setLocalNotes(group.notes), [group.notes]);

  const commitOrder = () => {
    if (!notesMatchById(group.notes, localNotes)) onReorder(localNotes);
  };

  return (
    <div className="border-t border-border/70 bg-surface-2/25 px-3 pb-3">
      {group.inheritsDefaults ? (
        <p className="px-1 py-3 text-[13px] leading-5 text-muted-foreground">
          This category currently uses the {group.type} defaults. Adding a Quick Note creates a
          custom set for {group.label}.
        </p>
      ) : null}
      {localNotes.length ? (
        <Reorder.Group axis="y" values={localNotes} onReorder={setLocalNotes}>
          {localNotes.map((note, index) => (
            <InlineReorderRow
              key={note.id}
              value={note}
              label={note.label}
              disabled={isSaving}
              onDragEnd={commitOrder}
            >
              <button
                type="button"
                onClick={(event) => onOpenNote(note, event.currentTarget)}
                className="flex min-h-14 w-full items-center gap-3 text-left active:bg-surface-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border/70 bg-card text-foreground">
                  <DynamicIcon name={note.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-foreground">
                    {note.label}
                  </span>
                  {note.note ? (
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {note.note}
                    </span>
                  ) : null}
                </span>
              </button>
              {index < localNotes.length - 1 ? <RowDivider /> : null}
            </InlineReorderRow>
          ))}
        </Reorder.Group>
      ) : (
        <p className="px-1 py-3 text-[13px] text-muted-foreground">
          {group.inheritsDefaults ? 'No custom Quick Notes yet.' : 'No Quick Notes yet.'}
        </p>
      )}
      {localNotes.length < MAX_QUICK_NOTES ? (
        <button
          type="button"
          aria-label={`Add Quick Note to ${group.label}`}
          disabled={isSaving}
          onClick={(event) => onAdd(event.currentTarget)}
          className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border border-dashed border-primary/40 text-[14px] font-semibold text-primary active:bg-primary/10 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Quick Note
        </button>
      ) : null}
    </div>
  );
}

function SyncActionRow({
  busy,
  disabled,
  statusLabel,
  statusTone,
  onPress,
}: {
  busy: boolean;
  disabled: boolean;
  statusLabel: string;
  statusTone: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-busy={busy}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 disabled:opacity-50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#007AFF] text-white">
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} />
      </span>
      <span className="min-w-0 flex-1 text-[17px] text-foreground">Sync Settings</span>
      <span
        aria-live="polite"
        className={`shrink-0 whitespace-nowrap text-[13px] font-medium ${statusTone}`}
      >
        {statusLabel}
      </span>
    </button>
  );
}

export function SettingsView({
  onToast,
  analyticsSync,
  onCarouselNavigationLockChange,
}: SettingsViewProps) {
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
  const replaceQuickNotesConfig = useReplaceQuickNotesConfig();

  const accounts = onboarding.accounts ?? [];
  const categories = onboarding.categories ?? {
    expense: [],
    income: [],
    transfer: [],
  };
  const resolvedQuickNotesConfig = quickNotesConfig ?? {};

  const [expandedSections, setExpandedSections] = useState<Set<ControlSectionId>>(
    () => new Set(),
  );
  const [expandedQuickNoteTargets, setExpandedQuickNoteTargets] = useState<Set<string>>(
    () => new Set(),
  );
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [localCategories, setLocalCategories] = useState(categories);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [quickNoteEditor, setQuickNoteEditor] = useState<QuickNoteEditorState | null>(null);
  const hasOpenEditor = itemEditor !== null || quickNoteEditor !== null;
  const editorOriginRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<Record<ControlSectionId, HTMLDivElement | null>>({
    accounts: null,
    categories: null,
    quickNotes: null,
    data: null,
  });

  useEffect(() => {
    onCarouselNavigationLockChange?.(hasOpenEditor);
    return () => {
      if (hasOpenEditor) onCarouselNavigationLockChange?.(false);
    };
  }, [hasOpenEditor, onCarouselNavigationLockChange]);

  useEffect(() => setLocalAccounts(accounts), [accounts]);
  useEffect(
    () =>
      setLocalCategories({
        expense: categories.expense ?? [],
        income: categories.income ?? [],
        transfer: categories.transfer ?? [],
      }),
    [categories.expense, categories.income, categories.transfer],
  );

  const isSettingsSyncBusy = isSyncing || isImportingLegacyQuickNotes;
  const isQuickNotesSaving =
    updateQuickNotes.isPending ||
    updateDefaultQuickNotes.isPending ||
    replaceQuickNotesConfig.isPending;
  const isSaving = isAccountSaving || isCategorySaving || isQuickNotesSaving;

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

  const historyHasError = Boolean(analyticsSync.history.error);
  const hasAttention = hasSettingsDiagnostics || historyHasError || analyticsSync.status === 'incomplete';
  const hasPendingWork =
    isSaving ||
    isSettingsSyncBusy ||
    settingsSyncStatus === 'pending' ||
    analyticsSync.isResyncing ||
    analyticsSync.history.isLoading ||
    analyticsSync.history.isDownloading ||
    analyticsSync.history.isRefreshing;
  const health = !isOnline
    ? {
        title: 'Working offline',
        detail: 'Changes stay on this device and sync after you reconnect.',
        tone: 'text-warning',
        icon: <Cloud className="h-5 w-5" />,
      }
    : hasAttention
      ? {
          title: 'Some data needs attention',
          detail: 'Open Data & sync to review the issue.',
          tone: 'text-danger',
          icon: <AlertCircle className="h-5 w-5" />,
        }
      : hasPendingWork
        ? {
            title: 'Saving changes',
            detail: 'Sheetlog is finishing background work.',
            tone: 'text-warning',
            icon: <RefreshCw className="h-5 w-5 animate-spin motion-reduce:animate-none" />,
          }
        : {
            title: 'Everything is up to date',
            detail: 'Your setup and transaction history are ready.',
            tone: 'text-success',
            icon: <Database className="h-5 w-5" />,
          };

  const quickNotesGroups = useMemo(
    () => buildQuickNotesGroups(resolvedQuickNotesConfig, categories),
    [categories, resolvedQuickNotesConfig],
  );

  const positionSection = useCallback((id: ControlSectionId) => {
    window.requestAnimationFrame(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      sectionRefs.current[id]?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, []);

  const toggleSection = useCallback(
    (id: ControlSectionId) => {
      const opening = !expandedSections.has(id);
      setExpandedSections((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (opening) positionSection(id);
    },
    [expandedSections, positionSection],
  );

  const toggleQuickNotesTarget = (key: string) => {
    setExpandedQuickNoteTargets((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const restoreEditorFocus = useCallback(() => {
    const origin = editorOriginRef.current;
    editorOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, []);

  const dismissItemEditor = useCallback(() => {
    setItemEditor(null);
    restoreEditorFocus();
  }, [restoreEditorFocus]);

  const dismissQuickNoteEditor = useCallback(() => {
    setQuickNoteEditor(null);
    restoreEditorFocus();
  }, [restoreEditorFocus]);

  const openItemEditor = (target: SettingsItemEditorTarget, origin: HTMLElement) => {
    editorOriginRef.current = origin;
    setItemEditor({ target });
  };

  const openQuickNoteEditor = (
    group: QuickNotesControlGroup,
    note: QuickNote,
    mode: 'create' | 'edit',
    origin: HTMLElement,
  ) => {
    editorOriginRef.current = origin;
    setQuickNoteEditor({
      groupKey: group.key,
      target: { type: group.type, categoryName: group.categoryName },
      note,
      mode,
    });
  };

  const persistQuickNotesGroup = useCallback(
    async (group: QuickNotesControlGroup, notes: QuickNote[]) => {
      if (group.kind === 'default') {
        await updateDefaultQuickNotes.mutateAsync({ type: group.type, notes });
      } else {
        await updateQuickNotes.mutateAsync({
          type: group.type,
          categoryName: group.categoryName ?? '',
          notes,
        });
      }
    },
    [updateDefaultQuickNotes, updateQuickNotes],
  );

  const replaceConfigIfNeeded = useCallback(
    async (nextConfig: QuickNotesConfig) => {
      if (JSON.stringify(nextConfig) === JSON.stringify(resolvedQuickNotesConfig)) return;
      await replaceQuickNotesConfig.mutateAsync({ config: nextConfig });
    },
    [replaceQuickNotesConfig, resolvedQuickNotesConfig],
  );

  async function handleSettingsRefresh() {
    if (!isOnline || isSettingsSyncBusy) return;
    try {
      await refreshSettings();
    } catch {
      // Persistent diagnostics already expose the failure inline.
    }
  }

  async function handleLegacyQuickNotesImport() {
    if (!isOnline || isSettingsSyncBusy) return;
    try {
      await importLegacyQuickNotes();
    } catch {
      // Persistent diagnostics already expose the failure inline.
    }
  }

  const currentItemTarget = itemEditor?.target;
  const currentItemNames =
    currentItemTarget?.kind === 'category'
      ? categories[currentItemTarget.categoryType ?? 'expense'].map((item) => item.name)
      : accounts.map((item) => item.name);

  const createItem = async ({
    name,
    icon,
    color,
  }: {
    name: string;
    icon: string;
    color: string;
  }) => {
    if (!currentItemTarget) return;
    if (currentItemTarget.kind === 'account') {
      await addAccount.mutateAsync({ name, icon, color });
    } else {
      await addCategory.mutateAsync({
        name,
        icon,
        color,
        categoryType: currentItemTarget.categoryType ?? 'expense',
      });
    }
    setItemEditor({
      target: { ...currentItemTarget, mode: 'edit', name, icon, color },
    });
  };

  const renameItem = async (nextName: string) => {
    if (!currentItemTarget || currentItemTarget.mode !== 'edit') return;
    const previousName = currentItemTarget.name;
    if (currentItemTarget.kind === 'account') {
      await updateAccountMeta.mutateAsync({ previousName, name: nextName });
      await replaceConfigIfNeeded(
        renameQuickNotesAccountReferences(
          resolvedQuickNotesConfig,
          previousName,
          nextName,
        ),
      );
    } else {
      const categoryType = currentItemTarget.categoryType ?? 'expense';
      await updateCategoryMeta.mutateAsync({
        previousName,
        name: nextName,
        categoryType,
      });
      await replaceConfigIfNeeded(
        renameQuickNotesCategoryGroup(
          resolvedQuickNotesConfig,
          categoryType,
          previousName,
          nextName,
        ),
      );
    }
    setItemEditor({ target: { ...currentItemTarget, name: nextName } });
  };

  const updateItemAppearance = async ({ icon, color }: { icon: string; color: string }) => {
    if (!currentItemTarget || currentItemTarget.mode !== 'edit') return;
    if (currentItemTarget.kind === 'account') {
      await updateAccountMeta.mutateAsync({
        previousName: currentItemTarget.name,
        name: currentItemTarget.name,
        icon,
        color,
      });
    } else {
      await updateCategoryMeta.mutateAsync({
        previousName: currentItemTarget.name,
        name: currentItemTarget.name,
        categoryType: currentItemTarget.categoryType ?? 'expense',
        icon,
        color,
      });
    }
    setItemEditor({ target: { ...currentItemTarget, icon, color } });
  };

  const deleteItem = async () => {
    if (!currentItemTarget || currentItemTarget.mode !== 'edit') return;
    if (currentItemTarget.kind === 'account') {
      await removeAccount.mutateAsync({ name: currentItemTarget.name });
      await replaceConfigIfNeeded(
        renameQuickNotesAccountReferences(
          resolvedQuickNotesConfig,
          currentItemTarget.name,
          '',
        ),
      );
      return;
    }

    const categoryType = currentItemTarget.categoryType ?? 'expense';
    await removeCategory.mutateAsync({
      name: currentItemTarget.name,
      categoryType,
    });
    const key = `${categoryType}:${currentItemTarget.name}`;
    if (Object.hasOwn(resolvedQuickNotesConfig, key)) {
      const nextConfig = Object.fromEntries(
        Object.entries(resolvedQuickNotesConfig).filter(([entryKey]) => entryKey !== key),
      );
      await replaceQuickNotesConfig.mutateAsync({ config: nextConfig });
    }
  };

  const currentQuickNotesGroup = quickNoteEditor
    ? quickNotesGroups.find((group) => group.key === quickNoteEditor.groupKey)
    : undefined;

  const commitQuickNote = async (nextNote: QuickNote) => {
    if (!quickNoteEditor || !currentQuickNotesGroup) return;
    const notes = currentQuickNotesGroup.notes.some((note) => note.id === nextNote.id)
      ? currentQuickNotesGroup.notes.map((note) =>
          note.id === nextNote.id ? nextNote : note,
        )
      : [...currentQuickNotesGroup.notes, nextNote];
    await persistQuickNotesGroup(currentQuickNotesGroup, notes);
    setQuickNoteEditor({ ...quickNoteEditor, mode: 'edit', note: nextNote });
  };

  const deleteQuickNote = async () => {
    if (!quickNoteEditor || !currentQuickNotesGroup) return;
    await persistQuickNotesGroup(
      currentQuickNotesGroup,
      currentQuickNotesGroup.notes.filter((note) => note.id !== quickNoteEditor.note.id),
    );
  };

  const commitAccountOrder = () => {
    if (!arraysMatchByName(accounts, localAccounts)) {
      reorderAccounts.mutate({ accounts: localAccounts });
    }
  };

  const commitCategoryOrder = (type: TransactionType) => {
    const local = localCategories[type] ?? [];
    if (!arraysMatchByName(categories[type] ?? [], local)) {
      reorderCategories.mutate({ categories: local, categoryType: type });
    }
  };

  return (
    <section
      data-testid="settings-view"
      aria-label="Settings"
      className="flex h-full min-h-0 flex-col bg-transparent"
      style={{
        paddingTop: 'var(--dashboard-header-space, var(--dashboard-header-height, 68px))',
      }}
    >
      <div
        data-testid="settings-control-center-scroll"
        data-dashboard-scroll="true"
        className="h-full overflow-y-auto overscroll-contain pb-safe"
      >
        <div className="space-y-4 px-4 pb-8 pt-3">
          <section
            aria-label="Workspace health"
            className="rounded-[22px] border border-border/70 bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-surface-2 ${health.tone}`}>
                {health.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[17px] font-semibold ${health.tone}`}>{health.title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  {health.detail}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CountBadge>{accounts.length} accounts</CountBadge>
                  <CountBadge>
                    {Object.values(categories).reduce((sum, list) => sum + list.length, 0)} categories
                  </CountBadge>
                  <CountBadge>{analyticsSync.history.records.length} transactions</CountBadge>
                </div>
              </div>
            </div>
          </section>

          <div className="px-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Set up Sheetlog
            </p>
          </div>

          <SettingsControlSection
            id="accounts"
            eyebrow="Money"
            title="Accounts"
            summary={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
            icon={<Wallet className="h-5 w-5" />}
            expanded={expandedSections.has('accounts')}
            onToggle={() => toggleSection('accounts')}
            headerRef={(node) => {
              sectionRefs.current.accounts = node;
            }}
          >
            <div className="px-3 pb-3">
              {localAccounts.length ? (
                <Reorder.Group axis="y" values={localAccounts} onReorder={setLocalAccounts}>
                  {localAccounts.map((account, index) => (
                    <InlineReorderRow
                      key={account.name}
                      value={account}
                      label={account.name}
                      disabled={isSaving}
                      onDragEnd={commitAccountOrder}
                    >
                      <button
                        type="button"
                        onClick={(event) =>
                          openItemEditor(
                            {
                              kind: 'account',
                              mode: 'edit',
                              name: account.name,
                              icon: account.icon ?? DEFAULT_ACCOUNT_ICON,
                              color: account.color ?? DEFAULT_ACCOUNT_COLOR,
                            },
                            event.currentTarget,
                          )
                        }
                        className="flex min-h-14 w-full items-center gap-3 text-left active:bg-surface-2"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white"
                          style={{ backgroundColor: account.color ?? DEFAULT_ACCOUNT_COLOR }}
                        >
                          <DynamicIcon
                            name={account.icon ?? DEFAULT_ACCOUNT_ICON}
                            className="h-4 w-4"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-foreground">
                          {account.name}
                        </span>
                      </button>
                      {index < localAccounts.length - 1 ? <RowDivider /> : null}
                    </InlineReorderRow>
                  ))}
                </Reorder.Group>
              ) : (
                <p className="py-4 text-center text-[14px] text-muted-foreground">
                  No accounts yet
                </p>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={(event) =>
                  openItemEditor(
                    {
                      kind: 'account',
                      mode: 'create',
                      name: '',
                      icon: DEFAULT_ACCOUNT_ICON,
                      color: DEFAULT_ACCOUNT_COLOR,
                    },
                    event.currentTarget,
                  )
                }
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border border-dashed border-primary/40 text-[14px] font-semibold text-primary active:bg-primary/10 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Account
              </button>
            </div>
          </SettingsControlSection>

          <SettingsControlSection
            id="categories"
            eyebrow="Logging"
            title="Categories"
            summary={`${Object.values(categories).reduce((sum, list) => sum + list.length, 0)} categories`}
            icon={<Tags className="h-5 w-5" />}
            expanded={expandedSections.has('categories')}
            onToggle={() => toggleSection('categories')}
            headerRef={(node) => {
              sectionRefs.current.categories = node;
            }}
          >
            <div className="space-y-4 px-3 pb-3">
              {CATEGORY_TYPES.map(({ key, label }) => {
                const list = localCategories[key] ?? [];
                return (
                  <section key={key} aria-label={`${label} categories`}>
                    <div className="flex items-center justify-between px-1 pb-1 pt-3">
                      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {label}
                      </h3>
                      <CountBadge>{list.length}</CountBadge>
                    </div>
                    <Reorder.Group
                      axis="y"
                      values={list}
                      onReorder={(next) =>
                        setLocalCategories((current) => ({ ...current, [key]: next }))
                      }
                    >
                      {list.map((category, index) => (
                        <InlineReorderRow
                          key={category.name}
                          value={category}
                          label={category.name}
                          disabled={isSaving}
                          onDragEnd={() => commitCategoryOrder(key)}
                        >
                          <button
                            type="button"
                            onClick={(event) =>
                              openItemEditor(
                                {
                                  kind: 'category',
                                  mode: 'edit',
                                  name: category.name,
                                  icon: category.icon ?? DEFAULT_CATEGORY_ICONS[key],
                                  color: category.color ?? DEFAULT_CATEGORY_COLORS[key],
                                  categoryType: key,
                                },
                                event.currentTarget,
                              )
                            }
                            className="flex min-h-14 w-full items-center gap-3 text-left active:bg-surface-2"
                          >
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white"
                              style={{
                                backgroundColor: category.color ?? DEFAULT_CATEGORY_COLORS[key],
                              }}
                            >
                              <DynamicIcon
                                name={category.icon ?? DEFAULT_CATEGORY_ICONS[key]}
                                fallback={DEFAULT_CATEGORY_ICONS[key]}
                                className="h-4 w-4"
                              />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-foreground">
                              {category.name}
                            </span>
                          </button>
                          {index < list.length - 1 ? <RowDivider /> : null}
                        </InlineReorderRow>
                      ))}
                    </Reorder.Group>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={(event) =>
                        openItemEditor(
                          {
                            kind: 'category',
                            mode: 'create',
                            name: '',
                            icon: DEFAULT_CATEGORY_ICONS[key],
                            color: DEFAULT_CATEGORY_COLORS[key],
                            categoryType: key,
                          },
                          event.currentTarget,
                        )
                      }
                      className="mt-1 flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-primary/30 text-[13px] font-semibold text-primary active:bg-primary/10 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add {label} Category
                    </button>
                  </section>
                );
              })}
            </div>
          </SettingsControlSection>

          <div className="px-1 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Analytics preferences
            </p>
          </div>
          <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card">
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
            <RowDivider />
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
          </section>

          <SettingsControlSection
            id="quick-notes"
            eyebrow="Speed up logging"
            title="Quick Notes"
            summary={`${Object.values(resolvedQuickNotesConfig).reduce((sum, notes) => sum + notes.length, 0)} configured`}
            icon={<Zap className="h-5 w-5" />}
            expanded={expandedSections.has('quickNotes')}
            onToggle={() => toggleSection('quickNotes')}
            headerRef={(node) => {
              sectionRefs.current.quickNotes = node;
            }}
          >
            <div className="space-y-2 p-3">
              {quickNotesGroups.map((group) => {
                const expanded = expandedQuickNoteTargets.has(group.key);
                const status = group.inheritsDefaults
                  ? `Uses ${group.inheritedCount} ${group.inheritedCount === 1 ? 'default' : 'defaults'}`
                  : `${group.configuredCount}/${MAX_QUICK_NOTES} configured`;
                return (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-[15px] border border-border/70 bg-card"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleQuickNotesTarget(group.key)}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-primary">
                        <Zap className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-foreground">
                          {group.label}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">{status}</span>
                      </span>
                      <span aria-hidden="true" className="text-[18px] text-muted-foreground">
                        {expanded ? '−' : '+'}
                      </span>
                    </button>
                    {expanded ? (
                      <QuickNotesTargetPanel
                        group={group}
                        isSaving={isQuickNotesSaving}
                        onOpenNote={(note, origin) =>
                          openQuickNoteEditor(group, note, 'edit', origin)
                        }
                        onAdd={(origin) =>
                          openQuickNoteEditor(
                            group,
                            {
                              id: generateQuickNoteId(),
                              icon: 'Zap',
                              label: '',
                            },
                            'create',
                            origin,
                          )
                        }
                        onReorder={(notes) => void persistQuickNotesGroup(group, notes)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SettingsControlSection>

          <SettingsControlSection
            id="data-sync"
            eyebrow="Workspace health"
            title="Data & sync"
            summary={isOnline ? settingsStatusLabel : 'Offline'}
            icon={<Cloud className="h-5 w-5" />}
            expanded={expandedSections.has('data')}
            onToggle={() => toggleSection('data')}
            headerRef={(node) => {
              sectionRefs.current.data = node;
            }}
          >
            <div className="overflow-hidden">
              <SyncActionRow
                busy={isSettingsSyncBusy}
                disabled={!isOnline || isSettingsSyncBusy}
                statusLabel={settingsStatusLabel}
                statusTone={settingsStatusTone}
                onPress={() => void handleSettingsRefresh()}
              />
              <RowDivider />
              <AnalyticsSyncSetting
                transactionCount={analyticsSync.history.records.length}
                historyCapturedAt={analyticsSync.history.meta?.capturedAt}
                isHistoryLoading={analyticsSync.history.isLoading}
                isHistoryDownloading={analyticsSync.history.isDownloading}
                isHistoryRefreshing={analyticsSync.history.isRefreshing}
                status={analyticsSync.status}
                isResyncing={analyticsSync.isResyncing}
                onResync={analyticsSync.resync}
              />
              {hasSettingsDiagnostics ? (
                <>
                  <RowDivider />
                  <div className="space-y-2 px-4 py-3 text-[13px] leading-5">
                    {globalSettingsError ? (
                      <p role="alert" className="break-words text-danger">
                        {globalSettingsError}
                      </p>
                    ) : null}
                    {SETTINGS_SECTIONS.map((section) => {
                      const error = settingsSectionErrors[section];
                      return error ? (
                        <p key={section} role="alert" className="break-words text-danger">
                          <span className="font-semibold">{SETTINGS_SECTION_LABELS[section]}:</span>{' '}
                          {error}
                        </p>
                      ) : null;
                    })}
                    {settingsConflicts.map((section) => (
                      <output key={section} className="block break-words text-warning">
                        {SETTINGS_SECTION_LABELS[section]} changed in both places; the Sheet version
                        was kept.
                      </output>
                    ))}
                  </div>
                </>
              ) : null}
              {!isOnline ? (
                <p className="border-t border-border/70 px-4 py-3 text-[13px] leading-5 text-muted-foreground">
                  You’re offline. Changes stay on this device and will sync when you reconnect.
                </p>
              ) : null}
              {hasLegacyQuickNotesMigrationPrompt ? (
                <div className="border-t border-border/70 px-4 py-3">
                  <p className="text-[13px] leading-5 text-muted-foreground">
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
              ) : null}
            </div>
          </SettingsControlSection>
        </div>
      </div>

      {currentItemTarget ? (
        <SettingsItemEditorDrawer
          open
          target={currentItemTarget}
          existingNames={currentItemNames}
          isSaving={isAccountSaving || isCategorySaving || replaceQuickNotesConfig.isPending}
          onCreate={createItem}
          onCommitName={renameItem}
          onCommitAppearance={updateItemAppearance}
          onDelete={currentItemTarget.mode === 'edit' ? deleteItem : undefined}
          onDismiss={dismissItemEditor}
        />
      ) : null}

      {quickNoteEditor ? (
        <SettingsQuickNoteEditorDrawer
          open
          mode={quickNoteEditor.mode}
          target={quickNoteEditor.target}
          note={quickNoteEditor.note}
          accounts={accounts.map((account) => account.name)}
          isSaving={isQuickNotesSaving}
          onCommit={commitQuickNote}
          onDelete={quickNoteEditor.mode === 'edit' ? deleteQuickNote : undefined}
          onDismiss={dismissQuickNoteEditor}
        />
      ) : null}
    </section>
  );
}
