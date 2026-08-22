import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import type { QuickNote, TransactionType } from '../../lib/types';
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

const DEFAULT_ICON = 'StickyNote';

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

  const { label } = form.useStore((state) => state.values);

  useEffect(() => {
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, []);

  const onboardingAccountNames = useMemo(
    () => onboarding.accounts.map((account) => account.name),
    [onboarding.accounts],
  );
  const accountNames = accounts ?? onboardingAccountNames;

  const isEditing = note !== null;
  const isValid = label.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!isValid || isSaving) return;

    const values = form.state.values;
    void onSave({
      id: note?.id,
      icon: note?.icon ?? DEFAULT_ICON,
      color: note?.color,
      label: values.label.trim(),
      note: values.note.trim() || undefined,
      amount: values.amount || undefined,
      currency: values.currency || undefined,
      account: values.account || undefined,
      forValue: values.forValue || undefined,
    });
  }, [form.state.values, isSaving, isValid, note, onSave]);

  const handleDelete = useCallback(() => {
    if (isSaving) return;
    void onDelete?.();
  }, [isSaving, onDelete]);

  const customHeader = (
    <div className="flex items-center gap-3 border-b border-border/20 pb-3 pt-4">
      <button
        type="button"
        aria-label="Go back"
        className="-ml-2 rounded-full p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onCancel}
        disabled={isSaving}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <input
        type="text"
        ref={labelInputRef}
        value={label}
        onChange={(event) => form.setFieldValue('label', event.target.value)}
        placeholder="Label (required)"
        maxLength={12}
        disabled={isSaving}
        className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <StepAmount
        form={form as unknown as TransactionFormApi}
        accounts={accountNames}
        onBack={onCancel}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        onDelete={isEditing ? handleDelete : undefined}
        submitLabel="Save Quick Note"
        customHeader={customHeader}
        optionalAmount
      />
    </div>
  );
}
