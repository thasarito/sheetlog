export const CATEGORY_GESTURE_SELECTION_ATTRIBUTE =
  'data-category-gesture-selection-locked';

const CATEGORY_GRID_SELECTOR = '[data-testid="category-grid"]';

type SelectionLockState = {
  owners: number;
  preventSelection: EventListener;
  clearSelection: EventListener;
};

type ActiveCategoryTouch = {
  identifier: number;
  releaseSelectionLock: () => void;
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

function findTouch(touches: TouchList, identifier: number): Touch | undefined {
  return Array.from(touches).find((touch) => touch.identifier === identifier);
}

function isCategoryGestureTarget(
  targetDocument: Document,
  target: EventTarget | null,
): boolean {
  const ElementConstructor = targetDocument.defaultView?.Element;
  return Boolean(
    ElementConstructor &&
      target instanceof ElementConstructor &&
      target.closest(CATEGORY_GRID_SELECTOR),
  );
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

export function installCategoryGestureSelectionGuard(
  targetDocument: Document | undefined =
    typeof document === 'undefined' ? undefined : document,
): () => void {
  if (!targetDocument) return () => {};

  let activeTouch: ActiveCategoryTouch | null = null;

  const releaseActiveTouch = () => {
    const releaseSelectionLock = activeTouch?.releaseSelectionLock;
    activeTouch = null;
    releaseSelectionLock?.();
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (activeTouch) {
      if (
        event.touches.length !== 1 ||
        !findTouch(event.touches, activeTouch.identifier)
      ) {
        releaseActiveTouch();
      }
      return;
    }

    if (event.touches.length !== 1 || event.changedTouches.length !== 1) {
      return;
    }
    if (!isCategoryGestureTarget(targetDocument, event.target)) return;

    const touch = event.changedTouches[0];
    activeTouch = {
      identifier: touch.identifier,
      releaseSelectionLock:
        acquireCategoryGestureSelectionLock(targetDocument),
    };
  };

  const handleTouchTerminal = (event: TouchEvent) => {
    if (!activeTouch) return;

    const activeIdentifier = activeTouch.identifier;
    const activeTouchEnded = Boolean(
      findTouch(event.changedTouches, activeIdentifier),
    );
    const activeTouchStillPresent = Boolean(
      findTouch(event.touches, activeIdentifier),
    );

    if (activeTouchEnded || !activeTouchStillPresent) {
      releaseActiveTouch();
    }
  };

  targetDocument.addEventListener('touchstart', handleTouchStart, {
    capture: true,
    passive: true,
  });
  targetDocument.addEventListener('touchend', handleTouchTerminal, {
    capture: true,
    passive: true,
  });
  targetDocument.addEventListener('touchcancel', handleTouchTerminal, {
    capture: true,
    passive: true,
  });

  return () => {
    releaseActiveTouch();
    targetDocument.removeEventListener('touchstart', handleTouchStart, true);
    targetDocument.removeEventListener('touchend', handleTouchTerminal, true);
    targetDocument.removeEventListener(
      'touchcancel',
      handleTouchTerminal,
      true,
    );
  };
}
