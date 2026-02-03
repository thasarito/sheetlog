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
import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAccountMutations } from '../hooks/useAccountMutations';
import { useCategoryMutations } from '../hooks/useCategoryMutations';
import { useOnboarding } from '../hooks/useOnboarding';
import {
  getQuickNotesForCategory,
  getDefaultQuickNotes,
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
import type { CategoryItem, QuickNote, TransactionType } from '../lib/types';
import { AppearancePicker } from './AppearancePicker';
import { DynamicIcon } from './DynamicIcon';
import { QuickNoteFlow } from './QuickNotes/QuickNoteFlow';
import { SwipeableListItem } from './SwipeableListItem';

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResync: () => void;
  isResyncing: boolean;
  onToast: (message: string) => void;
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

function generateQuickNoteId(): string {
  return `qn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const CATEGORY_TYPES: { key: TransactionType; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

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
  enter: (direction: number) => ({
    x: direction > 0 ? 14 : -14,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -14 : 14,
    opacity: 0,
  }),
};

function triggerHaptic(ms = 10) {
  if ('vibrate' in navigator) {
    navigator.vibrate(ms);
  }
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
    <div className="px-4 pt-3 pb-2 text-[13px] font-semibold text-muted-foreground">{children}</div>
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
  iconFgClassName?: string;
  title: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
  rightAccessory?: React.ReactNode;
  tone?: 'default' | 'primary' | 'danger';
};

function SettingsRow({
  icon,
  iconBg,
  iconFgClassName,
  title,
  detail,
  onPress,
  disabled,
  showChevron = true,
  rightAccessory,
  tone = 'default',
}: SettingsRowProps) {
  const textTone =
    tone === 'danger' ? 'text-danger' : tone === 'primary' ? 'text-primary' : 'text-foreground';

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || !onPress}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 disabled:opacity-50"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[9px]"
        style={iconBg ? { backgroundColor: iconBg } : undefined}
      >
        <div className={iconFgClassName ?? 'text-white'}>{icon}</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`min-w-0 truncate text-[17px] ${textTone}`}>{title}</span>
      </div>
      {detail ? <span className="text-[17px] text-muted-foreground">{detail}</span> : null}
      {rightAccessory}
      {showChevron ? <ChevronRight className="h-5 w-5 text-muted-foreground/60" /> : null}
    </button>
  );
}

type SegmentedControlProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="mx-4 mt-3 rounded-[12px] border border-border/70 bg-surface-2 p-1">
      <div className="flex gap-1">
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold transition ${
                isActive
                  ? 'border border-border/70 bg-card text-foreground'
                  : 'text-muted-foreground active:bg-surface-3'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ReorderableRowProps<T> = {
  value: T;
  disabled?: boolean;
  reorderEnabled: boolean;
  onDragEnd?: () => void;
  children: ReactNode;
};

type ScreenScrollProps = {
  screenKey: string;
  scrollPositions: React.MutableRefObject<Map<string, number>>;
  children: ReactNode;
};

function ScreenScroll({ screenKey, scrollPositions, children }: ScreenScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const top = scrollPositions.current.get(screenKey);
    if (typeof top === 'number') {
      const el = ref.current;
      if (el) el.scrollTop = top;
    }

    return () => {
      const el = ref.current;
      if (el) {
        scrollPositions.current.set(screenKey, el.scrollTop);
      }
    };
  }, [screenKey, scrollPositions]);

  return (
    <div ref={ref} className="h-full overflow-y-auto pb-safe">
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
}: ReorderableRowProps<T>) {
  const dragControls = useDragControls();

  function handlePointerDown(e: React.PointerEvent) {
    if (!reorderEnabled || disabled) return;
    triggerHaptic();
    dragControls.start(e);
  }

  return (
    <Reorder.Item
      value={value}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      whileDrag={{
        scale: 1.01,
        zIndex: 50,
      }}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="relative"
    >
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">{children}</div>
        {reorderEnabled ? (
          <button
            type="button"
            onPointerDown={handlePointerDown}
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

export function SettingsDrawer({
  open,
  onOpenChange,
  onResync,
  isResyncing,
  onToast,
}: SettingsDrawerProps) {
  const { onboarding } = useOnboarding();
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
  const isSaving = isAccountSaving || isCategorySaving;

  // Quick notes hooks
  const { data: quickNotesConfig } = useQuickNotesQuery();
  const updateQuickNotes = useUpdateQuickNotes();
  const updateDefaultQuickNotes = useUpdateDefaultQuickNotes();

  // Navigation stack (iOS-style push navigation)
  const [stack, setStack] = useState<SettingsScreen[]>([{ screen: 'main' }]);
  const [direction, setDirection] = useState(0);

  // Screen-local UI state
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

  const accounts = onboarding.accounts ?? [];
  const categories = onboarding.categories ?? {
    expense: [],
    income: [],
    transfer: [],
  };

  const currentScreen = stack[stack.length - 1] ?? { screen: 'main' };

  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const accountNameInputRef = useRef<HTMLInputElement>(null);
  const categoryNameInputRef = useRef<HTMLInputElement>(null);

  // Local state for optimistic reorder UI
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [localCategoriesByType, setLocalCategoriesByType] = useState<
    Record<TransactionType, CategoryItem[]>
  >({
    expense: categories.expense ?? [],
    income: categories.income ?? [],
    transfer: categories.transfer ?? [],
  });

  // Sync local state with server state
  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    setLocalCategoriesByType({
      expense: categories.expense ?? [],
      income: categories.income ?? [],
      transfer: categories.transfer ?? [],
    });
  }, [categories.expense, categories.income, categories.transfer]);

  // Quick notes for current screen (category or defaults)
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
  }, [quickNotesConfig, currentScreen]);

  const [localQuickNotes, setLocalQuickNotes] = useState<QuickNote[]>([]);

  useEffect(() => {
    setLocalQuickNotes(quickNotes);
  }, [quickNotes]);

  const canAddMoreQuickNotes = localQuickNotes.length < MAX_QUICK_NOTES;

  const resetEphemeralState = useCallback(() => {
    setDirection(0);
    setStack([{ screen: 'main' }]);
    setAccountsEditMode(false);
    setCategoriesEditMode(false);
    setQuickNotesEditMode(false);
    setNewAccountName('');
    setNewCategoryName('');
    setNewCategoryType('expense');
    setEditingItem(null);
    setQuickNoteEditMode({ isOpen: false, note: null });
  }, []);

  // Close on Escape; pop if nested
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (quickNoteEditMode.isOpen) {
        setQuickNoteEditMode({ isOpen: false, note: null });
        return;
      }
      if (stack.length > 1) {
        setDirection(-1);
        setStack((prev) => prev.slice(0, -1));
        return;
      }
      onOpenChange(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, quickNoteEditMode.isOpen, stack.length]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus inputs when entering create screens (avoids autoFocus)
  useEffect(() => {
    if (!open) return;
    if (currentScreen.screen === 'accountCreate') {
      requestAnimationFrame(() => accountNameInputRef.current?.focus());
      return;
    }
    if (currentScreen.screen === 'categoryCreate') {
      requestAnimationFrame(() => categoryNameInputRef.current?.focus());
    }
  }, [currentScreen.screen, open]);

  // Close QuickNoteFlow if user navigates away from Quick Notes
  useEffect(() => {
    if (
      currentScreen.screen === 'quickNotes' ||
      currentScreen.screen === 'defaultQuickNotes' ||
      !quickNoteEditMode.isOpen
    )
      return;
    setQuickNoteEditMode({ isOpen: false, note: null });
  }, [currentScreen.screen, quickNoteEditMode.isOpen]);

  // Reset when closing
  useEffect(() => {
    if (open) return;
    resetEphemeralState();
  }, [open, resetEphemeralState]);

  const push = useCallback((screen: SettingsScreen) => {
    triggerHaptic();
    setDirection(1);
    setStack((prev) => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    triggerHaptic();
    setDirection(-1);
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  // Get current item being edited
  const currentEditItem =
    editingItem?.type === 'account'
      ? accounts.find((a) => a.name === editingItem.name)
      : categories[editingItem?.categoryType ?? 'expense']?.find(
          (c) => c.name === editingItem?.name,
        );

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  function handleAddAccount() {
    const trimmed = newAccountName.trim();
    if (!trimmed) {
      onToast('Enter an account name');
      return;
    }
    if (accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      onToast('Account already exists');
      return;
    }
    addAccount.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setNewAccountName('');
          pop();
        },
      },
    );
  }

  function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      onToast('Enter a category name');
      return;
    }
    const list = categories[newCategoryType] ?? [];
    if (list.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      onToast('Category already exists');
      return;
    }
    addCategory.mutate(
      { name: trimmed, categoryType: newCategoryType },
      {
        onSuccess: () => {
          setNewCategoryName('');
          pop();
        },
      },
    );
  }

  // Handle appearance (icon + color) save
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

  // Handle account reorder persistence
  function handleAccountReorderEnd() {
    // Only persist if order actually changed
    const orderChanged = accounts.some((a, i) => a.name !== localAccounts[i]?.name);
    if (orderChanged) {
      reorderAccounts.mutate({ accounts: localAccounts });
    }
  }

  // Handle category reorder persistence
  function handleCategoryReorderEnd(categoryType: TransactionType) {
    const current = categories[categoryType] ?? [];
    const local = localCategoriesByType[categoryType] ?? [];
    const orderChanged = current.some((c, i) => c.name !== local[i]?.name);
    if (!orderChanged) return;
    reorderCategories.mutate({
      categories: local,
      categoryType,
    });
  }

  // Quick notes handlers
  const isQuickNotesSaving = updateQuickNotes.isPending || updateDefaultQuickNotes.isPending;

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

  function handleAddQuickNote() {
    if (!canAddMoreQuickNotes) {
      onToast(`Maximum ${MAX_QUICK_NOTES} quick notes per category`);
      return;
    }
    setQuickNoteEditMode({ isOpen: true, note: null });
  }

  function handleEditQuickNote(note: QuickNote) {
    setQuickNoteEditMode({ isOpen: true, note });
  }

  function handleCloseQuickNoteEdit() {
    setQuickNoteEditMode({ isOpen: false, note: null });
  }

  function handleSaveQuickNote(noteData: Omit<QuickNote, 'id'> & { id?: string }) {
    if (!quickNotesTarget) return;
    const isNew = !noteData.id;
    const newNote: QuickNote = {
      id: noteData.id ?? generateQuickNoteId(),
      icon: noteData.icon,
      label: noteData.label,
      note: noteData.note,
      amount: noteData.amount,
      currency: noteData.currency,
      account: noteData.account,
      forValue: noteData.forValue,
    };

    let updatedNotes: QuickNote[];
    if (isNew) {
      updatedNotes = [...localQuickNotes, newNote];
    } else {
      updatedNotes = localQuickNotes.map((n) => (n.id === newNote.id ? newNote : n));
    }

    setLocalQuickNotes(updatedNotes);
    if (quickNotesTarget.kind === 'category') {
      updateQuickNotes.mutate({
        type: quickNotesTarget.type,
        categoryName: quickNotesTarget.categoryName,
        notes: updatedNotes,
      });
    } else {
      updateDefaultQuickNotes.mutate({ type: quickNotesTarget.type, notes: updatedNotes });
    }
    handleCloseQuickNoteEdit();
  }

  function handleDeleteQuickNote() {
    if (!quickNoteEditMode.note || !quickNotesTarget) return;
    const noteId = quickNoteEditMode.note.id;
    const updatedNotes = localQuickNotes.filter((n) => n.id !== noteId);
    setLocalQuickNotes(updatedNotes);
    if (quickNotesTarget.kind === 'category') {
      updateQuickNotes.mutate({
        type: quickNotesTarget.type,
        categoryName: quickNotesTarget.categoryName,
        notes: updatedNotes,
      });
    } else {
      updateDefaultQuickNotes.mutate({ type: quickNotesTarget.type, notes: updatedNotes });
    }
    handleCloseQuickNoteEdit();
  }

  function handleRemoveQuickNote(noteId: string) {
    if (!quickNotesTarget) return;
    const updatedNotes = localQuickNotes.filter((n) => n.id !== noteId);
    setLocalQuickNotes(updatedNotes);
    if (quickNotesTarget.kind === 'category') {
      updateQuickNotes.mutate({
        type: quickNotesTarget.type,
        categoryName: quickNotesTarget.categoryName,
        notes: updatedNotes,
      });
    } else {
      updateDefaultQuickNotes.mutate({ type: quickNotesTarget.type, notes: updatedNotes });
    }
  }

  function handleQuickNoteReorderEnd() {
    if (!quickNotesTarget) return;
    const orderChanged = quickNotes.some((n, i) => n.id !== localQuickNotes[i]?.id);
    if (orderChanged) {
      if (quickNotesTarget.kind === 'category') {
        updateQuickNotes.mutate({
          type: quickNotesTarget.type,
          categoryName: quickNotesTarget.categoryName,
          notes: localQuickNotes,
        });
      } else {
        updateDefaultQuickNotes.mutate({ type: quickNotesTarget.type, notes: localQuickNotes });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close settings"
              className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]"
              onClick={() => onOpenChange(false)}
            />

            <motion.div
              className="absolute inset-x-0 bottom-0 h-[80vh] overflow-hidden rounded-t-[28px] border border-border bg-surface"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 45 }}
            >
              <div className="flex h-full flex-col">
                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />

                <div className="flex min-h-0 flex-1 flex-col">
                  {/* iOS-style navigation bar */}
                  <div className="sticky top-0 z-10 border-b border-border/60 bg-surface/90 backdrop-blur">
                    <div className="relative flex items-center justify-between px-2 pt-2 pb-2">
                      <div className="flex min-w-0 flex-1 items-center">
                        {stack.length > 1 ? (
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
                        ) : (
                          <div className="w-12" />
                        )}
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

                      <div className="flex min-w-0 flex-1 justify-end">
                        {currentScreen.screen === 'main' ? (
                          <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
                          >
                            Done
                          </button>
                        ) : currentScreen.screen === 'accounts' ? (
                          <button
                            type="button"
                            onClick={() => setAccountsEditMode((v) => !v)}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
                          >
                            {accountsEditMode ? 'Done' : 'Edit'}
                          </button>
                        ) : currentScreen.screen === 'categories' ? (
                          <button
                            type="button"
                            onClick={() => setCategoriesEditMode((v) => !v)}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
                          >
                            {categoriesEditMode ? 'Done' : 'Edit'}
                          </button>
                        ) : currentScreen.screen === 'quickNotes' ||
                          currentScreen.screen === 'defaultQuickNotes' ? (
                          <button
                            type="button"
                            onClick={() => setQuickNotesEditMode((v) => !v)}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary active:bg-surface-2"
                          >
                            {quickNotesEditMode ? 'Done' : 'Edit'}
                          </button>
                        ) : currentScreen.screen === 'accountCreate' ? (
                          <button
                            type="button"
                            onClick={handleAddAccount}
                            disabled={isSaving}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary disabled:opacity-50"
                          >
                            Add
                          </button>
                        ) : currentScreen.screen === 'categoryCreate' ? (
                          <button
                            type="button"
                            onClick={handleAddCategory}
                            disabled={isSaving}
                            className="rounded-full px-3 py-1 text-[17px] font-semibold text-primary disabled:opacity-50"
                          >
                            Add
                          </button>
                        ) : (
                          <div className="w-12" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex-1 overflow-hidden">
                    <AnimatePresence custom={direction} initial={false}>
                      <motion.div
                        key={getScreenKey(currentScreen)}
                        custom={direction}
                        variants={screenVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={screenTransition}
                        className="absolute inset-0 h-full bg-surface"
                      >
                        {/* Main */}
                        {currentScreen.screen === 'main' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h1 className="text-[34px] font-bold leading-tight text-foreground">
                                Settings
                              </h1>
                            </div>

                            <SettingsSectionLabel>SYNC</SettingsSectionLabel>
                            <SettingsGroup>
                              <SettingsRow
                                icon={
                                  <RefreshCw
                                    className={`h-4 w-4 ${isResyncing ? 'animate-spin' : ''}`}
                                  />
                                }
                                iconBg="#007AFF"
                                title="Sync Accounts & Categories"
                                onPress={onResync}
                                disabled={isResyncing}
                                showChevron={false}
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
                                detail={`${Object.values(categories).reduce(
                                  (sum, list) => sum + list.length,
                                  0,
                                )}`}
                                onPress={() => push({ screen: 'categories' })}
                              />
                            </SettingsGroup>
                          </ScreenScroll>
                        ) : null}

                        {/* Accounts list */}
                        {currentScreen.screen === 'accounts' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h2 className="text-[34px] font-bold leading-tight text-foreground">
                                Accounts
                              </h2>
                            </div>

                            <SettingsSectionLabel>
                              ACCOUNTS ({accounts.length})
                            </SettingsSectionLabel>
                            <SettingsGroup>
                              {localAccounts.length > 0 ? (
                                <Reorder.Group
                                  axis="y"
                                  values={localAccounts}
                                  onReorder={setLocalAccounts}
                                >
                                  {localAccounts.map((account, index) => (
                                    <ReorderableRow
                                      key={account.name}
                                      value={account}
                                      reorderEnabled={accountsEditMode}
                                      disabled={isSaving}
                                      onDragEnd={handleAccountReorderEnd}
                                    >
                                      <SwipeableListItem
                                        onDelete={() =>
                                          removeAccount.mutate({ name: account.name })
                                        }
                                        disabled={isSaving}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (accountsEditMode) return;
                                            push({
                                              screen: 'accountDetail',
                                              accountName: account.name,
                                            });
                                          }}
                                          className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                                        >
                                          <div
                                            className="flex h-8 w-8 items-center justify-center rounded-[9px]"
                                            style={{
                                              backgroundColor:
                                                account.color || DEFAULT_ACCOUNT_COLOR,
                                            }}
                                          >
                                            <DynamicIcon
                                              name={account.icon}
                                              className="h-4 w-4 text-white"
                                            />
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
                                    </ReorderableRow>
                                  ))}
                                </Reorder.Group>
                              ) : (
                                <div className="px-4 py-6 text-center text-[15px] text-muted-foreground">
                                  No accounts yet
                                </div>
                              )}

                              {localAccounts.length > 0 ? (
                                <div className="ml-[56px] h-px bg-border/70" />
                              ) : null}
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
                                <span className="text-[17px] font-semibold text-primary">
                                  Add Account
                                </span>
                              </button>
                            </SettingsGroup>
                          </ScreenScroll>
                        ) : null}

                        {/* Account create */}
                        {currentScreen.screen === 'accountCreate' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h2 className="text-[34px] font-bold leading-tight text-foreground">
                                New Account
                              </h2>
                            </div>

                            <SettingsSectionLabel>DETAILS</SettingsSectionLabel>
                            <SettingsGroup>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-20 text-[17px] text-foreground">Name</div>
                                <input
                                  type="text"
                                  ref={accountNameInputRef}
                                  value={newAccountName}
                                  onChange={(e) => setNewAccountName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddAccount();
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
                        ) : null}

                        {/* Account detail */}
                        {currentScreen.screen === 'accountDetail' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            {(() => {
                              const account = accounts.find(
                                (a) => a.name === currentScreen.accountName,
                              );
                              if (!account) {
                                return (
                                  <div className="px-4 py-6 text-[15px] text-muted-foreground">
                                    Account not found
                                  </div>
                                );
                              }

                              return (
                                <>
                                  <div className="px-4 pt-4 pb-2">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="flex h-12 w-12 items-center justify-center rounded-[14px]"
                                        style={{
                                          backgroundColor: account.color || DEFAULT_ACCOUNT_COLOR,
                                        }}
                                      >
                                        <DynamicIcon
                                          name={account.icon}
                                          className="h-6 w-6 text-white"
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <h2 className="truncate text-[28px] font-bold leading-tight text-foreground">
                                          {account.name}
                                        </h2>
                                        <div className="text-[13px] text-muted-foreground">
                                          Account settings
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <SettingsSectionLabel>APPEARANCE</SettingsSectionLabel>
                                  <SettingsGroup>
                                    <SettingsRow
                                      icon={
                                        <DynamicIcon
                                          name={account.icon}
                                          className="h-4 w-4 text-white"
                                        />
                                      }
                                      iconBg={account.color || DEFAULT_ACCOUNT_COLOR}
                                      title="Icon & Color"
                                      onPress={() =>
                                        setEditingItem({
                                          type: 'account',
                                          name: account.name,
                                        })
                                      }
                                      showChevron
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
                                        removeAccount.mutate(
                                          { name: account.name },
                                          { onSuccess: pop },
                                        );
                                      }}
                                    />
                                  </SettingsGroup>
                                </>
                              );
                            })()}
                          </ScreenScroll>
                        ) : null}

                        {/* Categories */}
                        {currentScreen.screen === 'categories' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h2 className="text-[34px] font-bold leading-tight text-foreground">
                                Categories
                              </h2>
                            </div>

                            {CATEGORY_TYPES.map(({ key, label }) => {
                              const list = localCategoriesByType[key] ?? [];
                              return (
                                <div key={key}>
                                  <SettingsSectionLabel>
                                    {label.toUpperCase()} ({list.length})
                                  </SettingsSectionLabel>
                                  <SettingsGroup>
                                    <SettingsRow
                                      icon={<Zap className="h-4 w-4" />}
                                      iconBg="#FF9500"
                                      title="Default Quick Notes"
                                      detail={`${getDefaultQuickNotes(quickNotesConfig, key).length}/${MAX_QUICK_NOTES}`}
                                      onPress={() => {
                                        if (categoriesEditMode) return;
                                        push({ screen: 'defaultQuickNotes', categoryType: key });
                                      }}
                                    />
                                    <div className="ml-[56px] h-px bg-border/70" />

                                    {list.length > 0 ? (
                                      <Reorder.Group
                                        axis="y"
                                        values={list}
                                        onReorder={(nextList) =>
                                          setLocalCategoriesByType((prev) => ({
                                            ...prev,
                                            [key]: nextList,
                                          }))
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
                                                  if (categoriesEditMode) return;
                                                  push({
                                                    screen: 'categoryDetail',
                                                    categoryName: category.name,
                                                    categoryType: key,
                                                  });
                                                }}
                                                className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                                              >
                                                <div
                                                  className="flex h-8 w-8 items-center justify-center rounded-[9px]"
                                                  style={{
                                                    backgroundColor:
                                                      category.color ||
                                                      DEFAULT_CATEGORY_COLORS[key],
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
                                          </ReorderableRow>
                                        ))}
                                      </Reorder.Group>
                                    ) : null}

                                    {list.length > 0 ? (
                                      <div className="ml-[56px] h-px bg-border/70" />
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewCategoryName('');
                                        setNewCategoryType(key);
                                        push({
                                          screen: 'categoryCreate',
                                          categoryType: key,
                                        });
                                      }}
                                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                                      disabled={isSaving}
                                    >
                                      <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary">
                                        <Plus className="h-4 w-4 text-white" />
                                      </div>
                                      <span className="text-[17px] font-semibold text-primary">
                                        Add {label} Category
                                      </span>
                                    </button>
                                  </SettingsGroup>
                                </div>
                              );
                            })}
                          </ScreenScroll>
                        ) : null}

                        {/* Category create */}
                        {currentScreen.screen === 'categoryCreate' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h2 className="text-[34px] font-bold leading-tight text-foreground">
                                New Category
                              </h2>
                            </div>

                            <SegmentedControl
                              value={newCategoryType}
                              options={CATEGORY_TYPES.map(({ key, label }) => ({
                                value: key,
                                label,
                              }))}
                              onChange={setNewCategoryType}
                            />

                            <SettingsSectionLabel>DETAILS</SettingsSectionLabel>
                            <SettingsGroup>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-20 text-[17px] text-foreground">Name</div>
                                <input
                                  type="text"
                                  ref={categoryNameInputRef}
                                  value={newCategoryName}
                                  onChange={(e) => setNewCategoryName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddCategory();
                                  }}
                                  placeholder="e.g. Groceries"
                                  disabled={isSaving}
                                  className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                                />
                              </div>
                            </SettingsGroup>
                          </ScreenScroll>
                        ) : null}

                        {/* Category detail */}
                        {currentScreen.screen === 'categoryDetail' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            {(() => {
                              const list = categories[currentScreen.categoryType] ?? [];
                              const category = list.find(
                                (c) => c.name === currentScreen.categoryName,
                              );
                              if (!category) {
                                return (
                                  <div className="px-4 py-6 text-[15px] text-muted-foreground">
                                    Category not found
                                  </div>
                                );
                              }

                              const quickNotesCount = getQuickNotesForCategory(
                                quickNotesConfig,
                                currentScreen.categoryType,
                                currentScreen.categoryName,
                              ).length;

                              return (
                                <>
                                  <div className="px-4 pt-4 pb-2">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="flex h-12 w-12 items-center justify-center rounded-[14px]"
                                        style={{
                                          backgroundColor:
                                            category.color ||
                                            DEFAULT_CATEGORY_COLORS[currentScreen.categoryType],
                                        }}
                                      >
                                        <DynamicIcon
                                          name={category.icon}
                                          fallback={
                                            DEFAULT_CATEGORY_ICONS[currentScreen.categoryType]
                                          }
                                          className="h-6 w-6 text-white"
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <h2 className="truncate text-[28px] font-bold leading-tight text-foreground">
                                          {category.name}
                                        </h2>
                                        <div className="text-[13px] text-muted-foreground">
                                          {currentScreen.categoryType} category
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
                                          fallback={
                                            DEFAULT_CATEGORY_ICONS[currentScreen.categoryType]
                                          }
                                          className="h-4 w-4 text-white"
                                        />
                                      }
                                      iconBg={
                                        category.color ||
                                        DEFAULT_CATEGORY_COLORS[currentScreen.categoryType]
                                      }
                                      title="Icon & Color"
                                      onPress={() =>
                                        setEditingItem({
                                          type: 'category',
                                          name: category.name,
                                          categoryType: currentScreen.categoryType,
                                        })
                                      }
                                      showChevron
                                    />
                                  </SettingsGroup>

                                  <SettingsSectionLabel>QUICK NOTES</SettingsSectionLabel>
                                  <SettingsGroup>
                                    <SettingsRow
                                      icon={<Zap className="h-4 w-4" />}
                                      iconBg="#FF9500"
                                      title="Quick Notes"
                                      detail={`${quickNotesCount}/${MAX_QUICK_NOTES}`}
                                      onPress={() =>
                                        push({
                                          screen: 'quickNotes',
                                          categoryName: currentScreen.categoryName,
                                          categoryType: currentScreen.categoryType,
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
                                          {
                                            name: category.name,
                                            categoryType: currentScreen.categoryType,
                                          },
                                          { onSuccess: pop },
                                        );
                                      }}
                                    />
                                  </SettingsGroup>
                                </>
                              );
                            })()}
                          </ScreenScroll>
                        ) : null}

                        {/* Quick Notes */}
                        {currentScreen.screen === 'quickNotes' ||
                        currentScreen.screen === 'defaultQuickNotes' ? (
                          <ScreenScroll
                            screenKey={getScreenKey(currentScreen)}
                            scrollPositions={scrollPositionsRef}
                          >
                            <div className="px-4 pt-4 pb-2">
                              <h2 className="text-[34px] font-bold leading-tight text-foreground">
                                {getScreenTitle(currentScreen)}
                              </h2>
                            </div>

                            <div className="px-4 pb-2 text-[13px] text-muted-foreground">
                              {currentScreen.screen === 'defaultQuickNotes'
                                ? `Shown for any ${currentScreen.categoryType} category without custom quick notes. Max ${MAX_QUICK_NOTES}.`
                                : `Long press on a category while logging to quickly add a pre-filled note. Max ${MAX_QUICK_NOTES} per category.`}
                            </div>

                            <SettingsGroup>
                              {localQuickNotes.length > 0 ? (
                                <Reorder.Group
                                  axis="y"
                                  values={localQuickNotes}
                                  onReorder={setLocalQuickNotes}
                                >
                                  {localQuickNotes.map((note, index) => (
                                    <ReorderableRow
                                      key={note.id}
                                      value={note}
                                      reorderEnabled={quickNotesEditMode}
                                      disabled={isQuickNotesSaving}
                                      onDragEnd={handleQuickNoteReorderEnd}
                                    >
                                      <SwipeableListItem
                                        onDelete={() => handleRemoveQuickNote(note.id)}
                                        disabled={isQuickNotesSaving}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (quickNotesEditMode) return;
                                            handleEditQuickNote(note);
                                          }}
                                          className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-surface-2"
                                        >
                                          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border/70 bg-surface-2">
                                            <DynamicIcon
                                              name={note.icon}
                                              className="h-4 w-4 text-foreground"
                                            />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="truncate text-[17px] text-foreground">
                                              {note.label}
                                            </div>
                                            <div className="truncate text-[13px] text-muted-foreground">
                                              {note.note}
                                            </div>
                                          </div>
                                          {!quickNotesEditMode ? (
                                            <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                                          ) : null}
                                        </button>
                                        {index < localQuickNotes.length - 1 ? (
                                          <div className="ml-[56px] h-px bg-border/70" />
                                        ) : null}
                                      </SwipeableListItem>
                                    </ReorderableRow>
                                  ))}
                                </Reorder.Group>
                              ) : (
                                <div className="px-4 py-6 text-center text-[15px] text-muted-foreground">
                                  {currentScreen.screen === 'defaultQuickNotes'
                                    ? 'No default quick notes yet'
                                    : 'No quick notes yet'}
                                </div>
                              )}

                              {canAddMoreQuickNotes ? (
                                <>
                                  {localQuickNotes.length > 0 ? (
                                    <div className="ml-[56px] h-px bg-border/70" />
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={handleAddQuickNote}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                                    disabled={isQuickNotesSaving}
                                  >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary">
                                      <Plus className="h-4 w-4 text-white" />
                                    </div>
                                    <span className="text-[17px] font-semibold text-primary">
                                      Add Quick Note
                                    </span>
                                  </button>
                                </>
                              ) : null}
                            </SettingsGroup>
                          </ScreenScroll>
                        ) : null}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Appearance Picker (Icon + Color) */}
      <AppearancePicker
        open={editingItem !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingItem(null);
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

      {/* Quick Note Flow (full-screen editor) */}
      {quickNoteEditMode.isOpen &&
        (currentScreen.screen === 'quickNotes' ||
          currentScreen.screen === 'defaultQuickNotes') && (
        <QuickNoteFlow
          note={quickNoteEditMode.note}
          onSave={handleSaveQuickNote}
          onCancel={handleCloseQuickNoteEdit}
          onDelete={handleDeleteQuickNote}
          transactionType={currentScreen.categoryType}
        />
      )}
    </>
  );
}
