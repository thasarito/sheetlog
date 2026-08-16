import type { QuickNote } from '../../lib/types';

interface QuickNotesMutationCallbacks {
  onError: (error: Error) => void;
  onSuccess?: () => void;
}

interface PersistQuickNotesOptimisticallyOptions<Variables> {
  authoritativeNotes: QuickNote[];
  optimisticNotes: QuickNote[];
  setLocalNotes: (notes: QuickNote[]) => void;
  mutate: (
    variables: Variables,
    callbacks: QuickNotesMutationCallbacks,
  ) => void;
  variables: Variables;
  onToast?: (message: string) => void;
  onSuccess?: () => void;
}

function persistenceErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not save Quick Notes.';
}

export function persistQuickNotesOptimistically<Variables>({
  authoritativeNotes,
  optimisticNotes,
  setLocalNotes,
  mutate,
  variables,
  onToast,
  onSuccess,
}: PersistQuickNotesOptimisticallyOptions<Variables>): void {
  setLocalNotes(optimisticNotes);
  mutate(variables, {
    onSuccess,
    onError: (error) => {
      setLocalNotes([...authoritativeNotes]);
      onToast?.(persistenceErrorMessage(error));
    },
  });
}
