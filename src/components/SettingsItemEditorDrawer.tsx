import { Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  COLOR_PALETTE,
  ICON_PICKER_LIST,
  type IconName,
} from '../lib/icons';
import { validateSettingsName } from '../lib/settingsControlCenter';
import type { TransactionType } from '../lib/types';
import { DynamicIcon } from './DynamicIcon';
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerTitle,
} from './ui/drawer';

export type SettingsItemEditorTarget = {
  kind: 'account' | 'category';
  mode: 'create' | 'edit';
  name: string;
  icon: string;
  color: string;
  categoryType?: TransactionType;
};

export type SettingsItemAppearance = {
  icon: string;
  color: string;
};

export type SettingsItemCreateValue = SettingsItemAppearance & {
  name: string;
};

export type SettingsItemEditorDrawerProps = {
  open: boolean;
  target: SettingsItemEditorTarget;
  existingNames: string[];
  isSaving: boolean;
  onCreate: (value: SettingsItemCreateValue) => Promise<void>;
  onCommitName: (nextName: string) => Promise<void>;
  onCommitAppearance: (appearance: SettingsItemAppearance) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDismiss: () => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function titleCase(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

export function SettingsItemEditorDrawer({
  open,
  target,
  existingNames,
  isSaving,
  onCreate,
  onCommitName,
  onCommitAppearance,
  onDelete,
  onDismiss,
}: SettingsItemEditorDrawerProps) {
  const [activeSnapPoint, setActiveSnapPoint] = useState<string | number | null>('62%');
  const [draftName, setDraftName] = useState(target.name);
  const [savedName, setSavedName] = useState(target.mode === 'edit' ? target.name : '');
  const [icon, setIcon] = useState(target.icon);
  const [color, setColor] = useState(target.color);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const commitPromiseRef = useRef<Promise<boolean> | null>(null);
  const errorId = useId();
  const noun = target.kind;
  const nounTitle = titleCase(noun);

  useEffect(() => {
    setDraftName(target.name);
    setSavedName(target.mode === 'edit' ? target.name : '');
    setIcon(target.icon);
    setColor(target.color);
    setNameError(null);
    setSaveState('idle');
    setActiveSnapPoint('62%');
  }, [target.color, target.icon, target.mode, target.name]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const focusInvalidName = useCallback(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const performNameCommit = useCallback(async (): Promise<boolean> => {
    const error = validateSettingsName(draftName, existingNames, savedName || undefined, noun);
    if (error) {
      setNameError(error);
      setSaveState('idle');
      focusInvalidName();
      return false;
    }

    const nextName = draftName.trim();
    if (nextName === savedName) {
      setDraftName(nextName);
      setNameError(null);
      return true;
    }

    try {
      setSaveState('saving');
      if (!savedName && target.mode === 'create') {
        await onCreate({ name: nextName, icon, color });
      } else {
        await onCommitName(nextName);
      }
      setSavedName(nextName);
      setDraftName(nextName);
      setNameError(null);
      setSaveState('saved');
      return true;
    } catch {
      setNameError(`Couldn’t save the ${noun} name. Try again.`);
      setSaveState('error');
      focusInvalidName();
      return false;
    }
  }, [color, draftName, existingNames, focusInvalidName, icon, noun, onCommitName, onCreate, savedName, target.mode]);

  const commitName = useCallback((): Promise<boolean> => {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    const pending = performNameCommit();
    commitPromiseRef.current = pending;
    void pending.finally(() => {
      if (commitPromiseRef.current === pending) commitPromiseRef.current = null;
    });
    return pending;
  }, [performNameCommit]);

  const requestDismiss = useCallback(async () => {
    const valid = await commitName();
    if (valid) onDismiss();
  }, [commitName, onDismiss]);

  const commitAppearance = useCallback(
    async (nextIcon: string, nextColor: string) => {
      setIcon(nextIcon);
      setColor(nextColor);
      if (!savedName) return;
      try {
        setSaveState('saving');
        await onCommitAppearance({ icon: nextIcon, color: nextColor });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    },
    [onCommitAppearance, savedName],
  );

  const revert = () => {
    if (!savedName) {
      onDismiss();
      return;
    }
    setDraftName(savedName);
    setNameError(null);
    setSaveState('idle');
    focusInvalidName();
  };

  const remove = async () => {
    if (!onDelete || !window.confirm(`Delete this ${noun}?`)) return;
    try {
      setSaveState('saving');
      await onDelete();
      onDismiss();
    } catch {
      setSaveState('error');
    }
  };

  const title = target.mode === 'create' ? `New ${nounTitle}` : `Edit ${savedName || target.name}`;
  const statusLabel = isSaving || saveState === 'saving'
    ? 'Saving…'
    : saveState === 'saved'
      ? 'Saved'
      : saveState === 'error'
        ? 'Couldn’t save'
        : 'Live save';

  return (
    <DrawerNestedRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestDismiss();
      }}
      snapPoints={['62%', 1]}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
    >
      <DrawerContent
        data-home-carousel-swipe-lock="true"
        className="max-h-[96dvh] overflow-hidden"
      >
        <DrawerHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>
                Changes save as you make them. Names save when you leave the field.
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
          <div className="rounded-[16px] border border-border/70 bg-surface-2/50 p-3">
            <label htmlFor={`${errorId}-name`} className="text-[12px] font-semibold text-muted-foreground">
              {nounTitle} name
            </label>
            <input
              ref={inputRef}
              id={`${errorId}-name`}
              type="text"
              value={draftName}
              aria-label={`${nounTitle} name`}
              aria-invalid={nameError ? 'true' : undefined}
              aria-describedby={nameError ? errorId : undefined}
              onChange={(event) => {
                setDraftName(event.target.value);
                if (nameError) setNameError(null);
              }}
              onBlur={() => void commitName()}
              className="mt-1 w-full bg-transparent text-[20px] font-semibold text-foreground outline-none"
            />
            {nameError ? (
              <div className="mt-2 flex items-start justify-between gap-3">
                <p id={errorId} role="alert" className="text-[13px] leading-5 text-danger">
                  {nameError}
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
          </div>

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Color
            </h3>
            <span aria-live="polite" className="text-[12px] font-medium text-muted-foreground">
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-9 gap-2">
            {COLOR_PALETTE.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={`Use ${option.name}`}
                aria-pressed={color === option.value}
                onClick={() => void commitAppearance(icon, option.value)}
                className="aspect-square rounded-full border-2 border-card ring-offset-2 ring-offset-card aria-pressed:ring-2 aria-pressed:ring-primary"
                style={{ backgroundColor: option.value }}
              />
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between rounded-[14px] border border-border/70 px-3 py-2 text-[14px] font-medium text-foreground">
            Custom color
            <input
              type="color"
              aria-label="Custom color"
              value={color}
              onChange={(event) => void commitAppearance(icon, event.target.value)}
              className="h-8 w-12 rounded border-0 bg-transparent"
            />
          </label>

          <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Icon
          </h3>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {ICON_PICKER_LIST.map((iconName) => (
              <button
                key={iconName}
                type="button"
                aria-label={`Use ${iconName} icon`}
                aria-pressed={icon === iconName}
                onClick={() => void commitAppearance(iconName, color)}
                className="flex aspect-square items-center justify-center rounded-[13px] border border-border/70 bg-surface-2 text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                <DynamicIcon name={iconName as IconName} className="h-5 w-5" />
              </button>
            ))}
          </div>

          {target.mode === 'edit' && onDelete ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-danger/30 text-[15px] font-semibold text-danger active:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete {noun}
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </DrawerNestedRoot>
  );
}
