import { Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { CURRENCIES } from '../lib/currencies';
import { ICON_PICKER_LIST, type IconName } from '../lib/icons';
import { validateSettingsName } from '../lib/settingsControlCenter';
import type { QuickNote, TransactionType } from '../lib/types';
import { DynamicIcon } from './DynamicIcon';
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerTitle,
} from './ui/drawer';

export type SettingsQuickNoteTarget = {
  type: TransactionType;
  categoryName?: string;
};

export type SettingsQuickNoteEditorDrawerProps = {
  open: boolean;
  mode: 'create' | 'edit';
  target: SettingsQuickNoteTarget;
  note: QuickNote;
  accounts: string[];
  isSaving: boolean;
  onCommit: (nextNote: QuickNote) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDismiss: () => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function sameNote(first: QuickNote, second: QuickNote): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function normalizeNote(note: QuickNote): QuickNote {
  return {
    ...note,
    label: note.label.trim(),
    note: note.note?.trim() || undefined,
    amount: note.amount?.trim() || undefined,
    currency: note.currency || undefined,
    account: note.account || undefined,
    forValue: note.forValue?.trim() || undefined,
  };
}

export function SettingsQuickNoteEditorDrawer({
  open,
  mode,
  target,
  note,
  accounts,
  isSaving,
  onCommit,
  onDelete,
  onDismiss,
}: SettingsQuickNoteEditorDrawerProps) {
  const [activeSnapPoint, setActiveSnapPoint] = useState<string | number | null>('82%');
  const [draft, setDraft] = useState(note);
  const [savedNote, setSavedNote] = useState<QuickNote | null>(mode === 'edit' ? note : null);
  const [amountDraft, setAmountDraft] = useState(note.amount ?? '');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const labelRef = useRef<HTMLInputElement>(null);
  const commitPromiseRef = useRef<Promise<boolean> | null>(null);
  const errorId = useId();

  useEffect(() => {
    setDraft(note);
    setSavedNote(mode === 'edit' ? note : null);
    setAmountDraft(note.amount ?? '');
    setLabelError(null);
    setSaveState('idle');
    setActiveSnapPoint('82%');
  }, [mode, note]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => labelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const focusInvalidLabel = useCallback(() => {
    window.requestAnimationFrame(() => labelRef.current?.focus());
  }, []);

  const performCommit = useCallback(
    async (candidate: QuickNote, showValidation = true): Promise<boolean> => {
      const error = validateSettingsName(candidate.label, [], undefined, 'Quick Note', 12);
      if (error) {
        if (showValidation) {
          setLabelError(error);
          focusInvalidLabel();
        }
        return false;
      }

      const nextNote = normalizeNote(candidate);
      if (savedNote && sameNote(nextNote, savedNote)) {
        setDraft(nextNote);
        setLabelError(null);
        return true;
      }

      try {
        setSaveState('saving');
        await onCommit(nextNote);
        setSavedNote(nextNote);
        setDraft(nextNote);
        setAmountDraft(nextNote.amount ?? '');
        setLabelError(null);
        setSaveState('saved');
        return true;
      } catch {
        setSaveState('error');
        if (showValidation) focusInvalidLabel();
        return false;
      }
    },
    [focusInvalidLabel, onCommit, savedNote],
  );

  const commit = useCallback(
    (candidate = draft, showValidation = true): Promise<boolean> => {
      if (commitPromiseRef.current) return commitPromiseRef.current;
      const pending = performCommit(candidate, showValidation);
      commitPromiseRef.current = pending;
      void pending.finally(() => {
        if (commitPromiseRef.current === pending) commitPromiseRef.current = null;
      });
      return pending;
    },
    [draft, performCommit],
  );

  const requestDismiss = useCallback(async () => {
    const valid = await commit(draft, true);
    if (valid) onDismiss();
  }, [commit, draft, onDismiss]);

  const updateDiscrete = (patch: Partial<QuickNote>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void commit(next, false);
  };

  const updateAmount = (value: string) => {
    setAmountDraft(value);
    setDraft((current) => ({
      ...current,
      amount: value || undefined,
    }));
  };

  const revert = () => {
    if (!savedNote) {
      onDismiss();
      return;
    }
    setDraft(savedNote);
    setAmountDraft(savedNote.amount ?? '');
    setLabelError(null);
    setSaveState('idle');
    focusInvalidLabel();
  };

  const remove = async () => {
    if (!onDelete || !window.confirm('Delete this Quick Note?')) return;
    try {
      setSaveState('saving');
      await onDelete();
      onDismiss();
    } catch {
      setSaveState('error');
    }
  };

  const statusLabel = isSaving || saveState === 'saving'
    ? 'Saving…'
    : saveState === 'saved'
      ? 'Saved'
      : saveState === 'error'
        ? 'Couldn’t save'
        : 'Live save';
  const forLabel = target.type === 'transfer' ? 'To' : 'For';

  return (
    <DrawerNestedRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestDismiss();
      }}
      snapPoints={['82%', 1]}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
    >
      <DrawerContent
        data-home-carousel-swipe-lock="true"
        className="max-h-[98dvh] overflow-hidden"
        style={{ touchAction: 'pan-y' }}
      >
        <DrawerHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>{mode === 'create' ? 'New Quick Note' : 'Edit Quick Note'}</DrawerTitle>
              <DrawerDescription>
                Changes save as you make them. Text saves when you leave the field.
              </DrawerDescription>
            </div>
            <button
              type="button"
              onClick={() => void requestDismiss()}
              className="shrink-0 rounded-full px-3 py-1.5 text-[15px] font-semibold text-primary active:bg-surface-2"
            >
              Close
            </button>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),24px)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              {target.categoryName ?? `${target.type} defaults`}
            </p>
            <span aria-live="polite" className="text-[12px] font-medium text-muted-foreground">
              {statusLabel}
            </span>
          </div>

          <div className="mt-3 space-y-3 rounded-[18px] border border-border/70 bg-surface-2/50 p-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Quick Note label</span>
              <input
                ref={labelRef}
                type="text"
                value={draft.label}
                aria-label="Quick Note label"
                aria-invalid={labelError ? 'true' : undefined}
                aria-describedby={labelError ? errorId : undefined}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, label: event.target.value }));
                  if (labelError) setLabelError(null);
                }}
                onBlur={() => void commit()}
                className="mt-1 w-full bg-transparent text-[18px] font-semibold text-foreground outline-none"
              />
            </label>
            {labelError ? (
              <div className="flex items-start justify-between gap-3">
                <p id={errorId} role="alert" className="text-[13px] leading-5 text-danger">
                  {labelError}
                </p>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={revert}
                  className="shrink-0 text-[13px] font-semibold text-primary"
                >
                  Revert
                </button>
              </div>
            ) : null}
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Quick Note text</span>
              <textarea
                value={draft.note ?? ''}
                aria-label="Quick Note text"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, note: event.target.value }))
                }
                onBlur={() => void commit()}
                rows={3}
                className="mt-1 w-full resize-none bg-transparent text-[16px] text-foreground outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Amount</span>
              <input
                type="number"
                inputMode="decimal"
                value={amountDraft}
                aria-label="Amount"
                onChange={(event) => updateAmount(event.target.value)}
                onBlur={() => void commit()}
                className="mt-1 w-full bg-transparent text-[16px] text-foreground outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-muted-foreground">Currency</span>
                <select
                  value={draft.currency ?? ''}
                  aria-label="Currency"
                  onChange={(event) => updateDiscrete({ currency: event.target.value || undefined })}
                  className="mt-1 w-full rounded-[12px] border border-border/70 bg-card px-2 py-2 text-[15px] text-foreground"
                >
                  <option value="">Default</option>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-muted-foreground">Account</span>
                <select
                  value={draft.account ?? ''}
                  aria-label="Account"
                  onChange={(event) => updateDiscrete({ account: event.target.value || undefined })}
                  className="mt-1 w-full rounded-[12px] border border-border/70 bg-card px-2 py-2 text-[15px] text-foreground"
                >
                  <option value="">None</option>
                  {accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">{forLabel}</span>
              <input
                type="text"
                value={draft.forValue ?? ''}
                aria-label={forLabel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, forValue: event.target.value }))
                }
                onBlur={() => void commit()}
                className="mt-1 w-full bg-transparent text-[16px] text-foreground outline-none"
              />
            </label>
          </div>

          <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Icon
          </h3>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {ICON_PICKER_LIST.map((iconName) => (
              <button
                key={iconName}
                type="button"
                aria-label={`Use ${iconName} icon`}
                aria-pressed={draft.icon === iconName}
                onClick={() => updateDiscrete({ icon: iconName })}
                className="flex aspect-square items-center justify-center rounded-[13px] border border-border/70 bg-surface-2 text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                <DynamicIcon name={iconName as IconName} className="h-5 w-5" />
              </button>
            ))}
          </div>

          {mode === 'edit' && onDelete ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-danger/30 text-[15px] font-semibold text-danger active:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete Quick Note
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </DrawerNestedRoot>
  );
}
