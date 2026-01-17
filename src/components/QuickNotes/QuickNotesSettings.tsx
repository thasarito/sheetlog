import { Reorder } from 'framer-motion';
import { GripVertical, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getQuickNotesForCategory,
  useQuickNotesQuery,
  useUpdateQuickNotes,
} from '../../hooks/useQuickNotes';
import type { QuickNote, TransactionType } from '../../lib/types';
import { DynamicIcon } from '../DynamicIcon';
import { SwipeableListItem } from '../SwipeableListItem';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '../ui/drawer';
import { QuickNoteFlow } from './QuickNoteFlow';

interface QuickNotesSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionType: TransactionType;
  categoryName: string;
  onToast?: (message: string) => void;
}

const MAX_QUICK_NOTES = 5;

function generateId(): string {
  return `qn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function QuickNotesSettings({
  open,
  onOpenChange,
  transactionType,
  categoryName,
  onToast,
}: QuickNotesSettingsProps) {
  const { data: quickNotesConfig } = useQuickNotesQuery();
  const updateQuickNotes = useUpdateQuickNotes();

  const notes = useMemo(
    () => getQuickNotesForCategory(quickNotesConfig, transactionType, categoryName),
    [quickNotesConfig, transactionType, categoryName],
  );

  // Local state for optimistic reorder UI
  const [localNotes, setLocalNotes] = useState<QuickNote[]>(notes);
  const [editMode, setEditMode] = useState<{ isOpen: boolean; note: QuickNote | null }>({
    isOpen: false,
    note: null,
  });

  // Sync local state with server state
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const canAddMore = localNotes.length < MAX_QUICK_NOTES;

  function handleAddNote() {
    if (!canAddMore) {
      onToast?.(`Maximum ${MAX_QUICK_NOTES} quick notes per category`);
      return;
    }
    onOpenChange(false);
    setEditMode({ isOpen: true, note: null });
  }

  function handleEditNote(note: QuickNote) {
    onOpenChange(false);
    setEditMode({ isOpen: true, note });
  }

  function handleCloseEditMode() {
    setEditMode({ isOpen: false, note: null });
    onOpenChange(true);
  }

  function handleSaveNote(noteData: Omit<QuickNote, 'id'> & { id?: string }) {
    const isNew = !noteData.id;
    const newNote: QuickNote = {
      id: noteData.id ?? generateId(),
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
      updatedNotes = [...localNotes, newNote];
    } else {
      updatedNotes = localNotes.map((n) => (n.id === newNote.id ? newNote : n));
    }

    setLocalNotes(updatedNotes);
    updateQuickNotes.mutate({
      type: transactionType,
      categoryName,
      notes: updatedNotes,
    });
    handleCloseEditMode();
  }

  function handleDeleteNote() {
    if (!editMode.note) return;
    const noteId = editMode.note.id;
    const updatedNotes = localNotes.filter((n) => n.id !== noteId);
    setLocalNotes(updatedNotes);
    updateQuickNotes.mutate({
      type: transactionType,
      categoryName,
      notes: updatedNotes,
    });
    handleCloseEditMode();
  }

  function handleRemoveNote(noteId: string) {
    const updatedNotes = localNotes.filter((n) => n.id !== noteId);
    setLocalNotes(updatedNotes);
    updateQuickNotes.mutate({
      type: transactionType,
      categoryName,
      notes: updatedNotes,
    });
  }

  function handleReorderEnd() {
    // Only persist if order actually changed
    const orderChanged = notes.some((n, i) => n.id !== localNotes[i]?.id);
    if (orderChanged) {
      updateQuickNotes.mutate({
        type: transactionType,
        categoryName,
        notes: localNotes,
      });
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[60vh]!">
          <DrawerHeader>
            <DrawerTitle>Quick Notes for {categoryName}</DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <p className="mb-3 text-xs text-muted-foreground">
              Long press on this category to quickly add a pre-filled note. Max {MAX_QUICK_NOTES}{' '}
              quick notes.
            </p>

            <div className="overflow-hidden rounded-xl border border-border">
              {localNotes.length > 0 ? (
                <Reorder.Group
                  axis="y"
                  values={localNotes}
                  onReorder={setLocalNotes}
                  className="divide-y divide-border"
                >
                  {localNotes.map((note) => (
                    <Reorder.Item
                      key={note.id}
                      value={note}
                      onDragEnd={handleReorderEnd}
                      className="relative"
                    >
                      <SwipeableListItem
                        onDelete={() => handleRemoveNote(note.id)}
                        disabled={updateQuickNotes.isPending}
                      >
                        <button
                          type="button"
                          onClick={() => handleEditNote(note)}
                          className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition hover:bg-surface"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface shrink-0">
                            <DynamicIcon name={note.icon} className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-foreground truncate">
                              {note.label}
                            </span>
                            <span className="block text-xs text-muted-foreground truncate">
                              {note.note}
                            </span>
                          </div>
                        </button>
                      </SwipeableListItem>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No quick notes yet
                </div>
              )}

              {/* Add button */}
              {canAddMore && (
                <button
                  type="button"
                  onClick={handleAddNote}
                  className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition hover:bg-surface border-t border-border"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                    <Plus className="h-4 w-4 text-primary" />
                  </span>
                  <span className="text-sm font-medium text-primary">Add Quick Note</span>
                </button>
              )}
            </div>
          </div>

          <DrawerFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Quick Note Flow */}
      {editMode.isOpen && (
        <QuickNoteFlow
          note={editMode.note}
          onSave={handleSaveNote}
          onCancel={handleCloseEditMode}
          onDelete={handleDeleteNote}
          transactionType={transactionType}
        />
      )}
    </>
  );
}
