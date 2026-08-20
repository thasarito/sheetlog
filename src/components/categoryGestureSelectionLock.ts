export const CATEGORY_GESTURE_SELECTION_ATTRIBUTE =
  'data-category-gesture-selection-locked';

type SelectionLockState = {
  owners: number;
  preventSelection: EventListener;
  clearSelection: EventListener;
};

const selectionLockStates = new WeakMap<Document, SelectionLockState>();

function clearDocumentSelection(targetDocument: Document) {
  const selection =
    targetDocument.getSelection?.() ??
    targetDocument.defaultView?.getSelection?.() ??
    null;

  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

export function acquireCategoryGestureSelectionLock(
  targetDocument: Document | undefined =
    typeof document === 'undefined' ? undefined : document,
): () => void {
  if (!targetDocument?.documentElement) return () => {};

  let state = selectionLockStates.get(targetDocument);
  if (!state) {
    const preventSelection: EventListener = (event) => {
      event.preventDefault();
      clearDocumentSelection(targetDocument);
    };
    const clearSelection: EventListener = () =>
      clearDocumentSelection(targetDocument);

    state = {
      owners: 0,
      preventSelection,
      clearSelection,
    };
    selectionLockStates.set(targetDocument, state);
  }

  state.owners += 1;
  if (state.owners === 1) {
    targetDocument.documentElement.setAttribute(
      CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
      'true',
    );
    targetDocument.addEventListener(
      'selectstart',
      state.preventSelection,
      true,
    );
    targetDocument.addEventListener(
      'selectionchange',
      state.clearSelection,
    );
    clearDocumentSelection(targetDocument);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const currentState = selectionLockStates.get(targetDocument);
    if (!currentState) return;

    currentState.owners = Math.max(0, currentState.owners - 1);
    if (currentState.owners > 0) return;

    targetDocument.removeEventListener(
      'selectstart',
      currentState.preventSelection,
      true,
    );
    targetDocument.removeEventListener(
      'selectionchange',
      currentState.clearSelection,
    );
    targetDocument.documentElement.removeAttribute(
      CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
    );
    selectionLockStates.delete(targetDocument);
  };
}
