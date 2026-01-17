import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import type { QuickNote, TransactionType } from '../../lib/types';
import { StepAmount } from '../TransactionFlow/StepAmount';
import type { TransactionFormApi } from '../TransactionFlow/useTransactionForm';
import { useQuickNoteForm } from './useQuickNoteForm';

interface QuickNoteFlowProps {
  note: QuickNote | null;
  onSave: (note: Omit<QuickNote, 'id'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
  transactionType: TransactionType;
}

const DEFAULT_ICON = 'StickyNote';

export function QuickNoteFlow({
  note,
  onSave,
  onCancel,
  onDelete,
  transactionType,
}: QuickNoteFlowProps) {
  const { onboarding } = useOnboarding();
  const labelInputRef = useRef<HTMLInputElement>(null);
  const form = useQuickNoteForm({ note, transactionType });

  const { label } = form.useStore((state) => state.values);

  useEffect(() => {
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, []);

  const accountNames = useMemo(() => onboarding.accounts.map((a) => a.name), [onboarding.accounts]);

  const isEditing = note !== null;
  const isValid = label.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!isValid) return;

    const values = form.state.values;
    onSave({
      id: note?.id,
      icon: DEFAULT_ICON,
      label: values.label.trim(),
      note: values.note.trim() || undefined,
      amount: values.amount || undefined,
      currency: values.currency || undefined,
      account: values.account || undefined,
      forValue: values.forValue || undefined,
    });
  }, [form.state.values, isValid, note?.id, onSave]);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const customHeader = (
    <div className="flex items-center gap-3 border-b border-border/20 pt-4 pb-3">
      <button
        type="button"
        aria-label="Go back"
        className="rounded-full p-2 hover:bg-muted transition-colors -ml-2"
        onClick={onCancel}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <input
        type="text"
        ref={labelInputRef}
        value={label}
        onChange={(e) => form.setFieldValue('label', e.target.value)}
        placeholder="Label (required)"
        maxLength={12}
        className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
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
        onDelete={isEditing ? handleDelete : undefined}
        submitLabel="Save Quick Note"
        customHeader={customHeader}
        optionalAmount
      />
    </div>
  );
}
