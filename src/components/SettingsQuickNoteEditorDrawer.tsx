import { useCallback, useRef, useState } from 'react';
import type { QuickNote, TransactionType } from '../lib/types';
import { QuickNoteFlow } from './QuickNotes/QuickNoteFlow';

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
  const [isPersisting, setIsPersisting] = useState(false);
  const persistencePendingRef = useRef(false);
  const busy = isSaving || isPersisting;

  const persist = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      if (isSaving || persistencePendingRef.current) return false;

      persistencePendingRef.current = true;
      setIsPersisting(true);
      try {
        await action();
        return true;
      } catch {
        return false;
      } finally {
        persistencePendingRef.current = false;
        setIsPersisting(false);
      }
    },
    [isSaving],
  );

  const save = useCallback(
    async (candidate: Omit<QuickNote, 'id'> & { id?: string }) => {
      const nextNote: QuickNote = {
        ...note,
        ...candidate,
        id: candidate.id ?? note.id,
        icon: candidate.icon ?? note.icon,
        color: candidate.color ?? note.color,
      };
      if (await persist(() => onCommit(nextNote))) onDismiss();
    },
    [note, onCommit, onDismiss, persist],
  );

  const remove = useCallback(async () => {
    if (!onDelete || !window.confirm('Delete this Quick Note?')) return;
    if (await persist(onDelete)) onDismiss();
  }, [onDelete, onDismiss, persist]);

  const cancel = useCallback(() => {
    if (!busy && !persistencePendingRef.current) onDismiss();
  }, [busy, onDismiss]);

  if (!open) return null;

  return (
    <QuickNoteFlow
      note={note}
      transactionType={target.type}
      accounts={accounts}
      isSaving={busy}
      onSave={save}
      onCancel={cancel}
      onDelete={mode === 'edit' && onDelete ? remove : undefined}
    />
  );
}
