import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import { DEFAULT_ACCOUNT_COLOR } from '../../lib/icons';
import type { QuickNote, TransactionType } from '../../lib/types';
import {
  AppearancePicker,
  type AppearancePickerSection,
} from '../AppearancePicker';
import { DynamicIcon } from '../DynamicIcon';
import { StepAmount } from '../TransactionFlow/StepAmount';
import type { TransactionFormApi } from '../TransactionFlow/useTransactionForm';
import { useQuickNoteForm } from './useQuickNoteForm';

interface QuickNoteFlowProps {
  note: QuickNote | null;
  onSave: (note: Omit<QuickNote, 'id'> & { id?: string }) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void | Promise<void>;
  transactionType: TransactionType;
  accounts?: string[];
  isSaving?: boolean;
}

const DEFAULT_ICON = 'Tag';
type QuickNoteAppearanceSection = Exclude<
  AppearancePickerSection,
  'appearance'
>;

export function QuickNoteFlow({
  note,
  onSave,
  onCancel,
  onDelete,
  transactionType,
  accounts,
  isSaving = false,
}: QuickNoteFlowProps) {
  const { onboarding } = useOnboarding();
  const labelInputRef = useRef<HTMLInputElement>(null);
  const form = useQuickNoteForm({ note, transactionType });
  const [icon, setIcon] = useState(note?.icon ?? DEFAULT_ICON);
  const [color, setColor] = useState(note?.color ?? DEFAULT_ACCOUNT_COLOR);
  const [appearanceSection, setAppearanceSection] =
    useState<QuickNoteAppearanceSection | null>(null);

  const { label } = form.useStore((state) => state.values);

  useEffect(() => {
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, []);

  const onboardingAccountNames = useMemo(
    () => onboarding.accounts.map((account) => account.name),
    [onboarding.accounts],
  );
  const accountNames = accounts ?? onboardingAccountNames;

  const canDelete = note !== null && onDelete !== undefined;
  const isValid = label.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!isValid || isSaving) return;

    const values = form.state.values;
    void onSave({
      id: note?.id,
      icon,
      color,
      label: values.label.trim(),
      note: values.note.trim() || undefined,
      amount: values.amount || undefined,
      currency: values.currency || undefined,
      account: values.account || undefined,
      forValue: values.forValue || undefined,
    });
  }, [color, form.state.values, icon, isSaving, isValid, note?.id, onSave]);

  const handleDelete = useCallback(() => {
    if (isSaving) return;
    void onDelete?.();
  }, [isSaving, onDelete]);

  const handleAppearanceSave = useCallback(
    (nextIcon: string, nextColor: string) => {
      setIcon(nextIcon);
      setColor(nextColor);
      setAppearanceSection(null);
    },
    [],
  );

  const customHeader = (
    <div
      data-testid="quick-note-identity-row"
      className="flex items-center gap-2 border-b border-border/20 pb-3 pt-4"
    >
      <button
        type="button"
        aria-label="Go back"
        className="-ml-2 rounded-full p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onCancel}
        disabled={isSaving}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Choose Quick Note icon"
        aria-haspopup="dialog"
        onClick={() => setAppearanceSection('icon')}
        disabled={isSaving}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <DynamicIcon
          name={icon}
          fallback={DEFAULT_ICON}
          className="h-4 w-4"
          style={{ color }}
        />
      </button>
      <input
        type="text"
        ref={labelInputRef}
        value={label}
        onChange={(event) => form.setFieldValue('label', event.target.value)}
        placeholder="Label (required)"
        maxLength={12}
        disabled={isSaving}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        aria-label="Choose Quick Note color"
        aria-haspopup="dialog"
        onClick={() => setAppearanceSection('color')}
        disabled={isSaving}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-background pt-safe">
      <StepAmount
        form={form as unknown as TransactionFormApi}
        accounts={accountNames}
        onBack={onCancel}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        onDelete={canDelete ? handleDelete : undefined}
        submitLabel="Save Quick Note"
        customHeader={customHeader}
        optionalAmount
      />

      <AppearancePicker
        open={appearanceSection !== null}
        onOpenChange={(open) => {
          if (!open) setAppearanceSection(null);
        }}
        initialIcon={icon}
        initialColor={color}
        onSave={handleAppearanceSave}
        defaultIcon={DEFAULT_ICON}
        defaultColor={DEFAULT_ACCOUNT_COLOR}
        title={
          appearanceSection === 'icon'
            ? 'Choose Quick Note Icon'
            : 'Choose Quick Note Color'
        }
        section={appearanceSection ?? 'appearance'}
      />
    </div>
  );
}
