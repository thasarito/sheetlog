import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerHapticFeedback } from '../../lib/transactionHaptics';
import type { QuickNote } from '../../lib/types';

export type CategoryQuickNoteMenuPoint = { x: number; y: number };

export type CategoryQuickNoteMenuBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type CategoryQuickNoteMenuAnchor = {
  element: HTMLButtonElement;
  bounds: CategoryQuickNoteMenuBounds;
};

export type CategoryQuickNoteMenuPresentation = {
  label: string;
  icon: string;
  color: string;
};

export type CategoryQuickNoteMenuNoteSource = 'custom' | 'default';

type ActiveTarget =
  | { type: 'category' }
  | { type: 'note'; source: CategoryQuickNoteMenuNoteSource; id: string }
  | null;

export type CategoryQuickNoteMenuState = {
  category: string;
  presentation: CategoryQuickNoteMenuPresentation;
  anchor: CategoryQuickNoteMenuAnchor;
  customNotes: QuickNote[];
  defaultNotes: QuickNote[];
  isGestureActive: boolean;
  hasLeftAnchor: boolean;
  dragPosition: CategoryQuickNoteMenuPoint | null;
  activeTarget: ActiveTarget;
};

type UseCategoryQuickNoteMenuOptions = {
  getCustomNotes: (category: string) => QuickNote[];
  getDefaultNotes: () => QuickNote[];
  getCategoryPresentation: (
    category: string,
  ) => CategoryQuickNoteMenuPresentation;
  onSelectNote: (note: QuickNote, category: string) => void;
  onUseCategory: (category: string) => void;
  resetKey?: unknown;
};

type CategoryQuickNoteMenuHandlers = {
  onLongPressStart: (
    category: string,
    position: CategoryQuickNoteMenuPoint,
    anchor: CategoryQuickNoteMenuAnchor,
  ) => void;
  onDrag: (position: CategoryQuickNoteMenuPoint) => void;
  onRelease: (position: CategoryQuickNoteMenuPoint) => void;
  onCancel: () => void;
  onDismiss: () => void;
  onSelectNote: (source: CategoryQuickNoteMenuNoteSource, id: string) => void;
  onUseCategory: () => void;
};

const MAX_CUSTOM_NOTES = 4;
const MAX_DEFAULT_NOTES = 4;
const ANCHOR_ACCENT_PROPERTY = '--category-quick-note-anchor-accent';
const OPEN_ATTRIBUTE = 'data-category-quick-note-open';
const RETURN_TARGET_ATTRIBUTE = 'data-category-quick-note-return-target';

type AnchorPresentationSnapshot = {
  ariaHasPopup: string | null;
  ariaExpanded: string | null;
  open: string | null;
  returnTarget: string | null;
  accent: string;
};

function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
) {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

function activateAnchorPresentation(
  anchor: CategoryQuickNoteMenuAnchor,
  accent: string,
): () => void {
  const { element } = anchor;
  const snapshot: AnchorPresentationSnapshot = {
    ariaHasPopup: element.getAttribute('aria-haspopup'),
    ariaExpanded: element.getAttribute('aria-expanded'),
    open: element.getAttribute(OPEN_ATTRIBUTE),
    returnTarget: element.getAttribute(RETURN_TARGET_ATTRIBUTE),
    accent: element.style.getPropertyValue(ANCHOR_ACCENT_PROPERTY),
  };

  element.setAttribute('aria-haspopup', 'dialog');
  element.setAttribute('aria-expanded', 'true');
  element.setAttribute(OPEN_ATTRIBUTE, 'true');
  element.removeAttribute(RETURN_TARGET_ATTRIBUTE);
  element.style.setProperty(ANCHOR_ACCENT_PROPERTY, accent);

  return () => {
    restoreAttribute(element, 'aria-haspopup', snapshot.ariaHasPopup);
    restoreAttribute(element, 'aria-expanded', snapshot.ariaExpanded);
    restoreAttribute(element, OPEN_ATTRIBUTE, snapshot.open);
    restoreAttribute(element, RETURN_TARGET_ATTRIBUTE, snapshot.returnTarget);
    if (snapshot.accent) {
      element.style.setProperty(ANCHOR_ACCENT_PROPERTY, snapshot.accent);
    } else {
      element.style.removeProperty(ANCHOR_ACCENT_PROPERTY);
    }
  };
}

function setAnchorReturnTarget(
  anchor: CategoryQuickNoteMenuAnchor,
  active: boolean,
) {
  if (active) {
    anchor.element.setAttribute(RETURN_TARGET_ATTRIBUTE, 'true');
  } else {
    anchor.element.removeAttribute(RETURN_TARGET_ATTRIBUTE);
  }
}

function pointInsideBounds(
  point: CategoryQuickNoteMenuPoint,
  bounds: CategoryQuickNoteMenuBounds,
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function resolveDomTarget(
  position: CategoryQuickNoteMenuPoint,
): Exclude<ActiveTarget, { type: 'category' }> {
  if (
    typeof document === 'undefined' ||
    typeof document.elementFromPoint !== 'function'
  ) {
    return null;
  }

  const element = document.elementFromPoint(position.x, position.y);
  const target = element?.closest(
    '[data-category-quick-note-source][data-category-quick-note-id]',
  ) as HTMLElement | null;
  const source = target?.dataset.categoryQuickNoteSource;
  const id = target?.dataset.categoryQuickNoteId;
  if ((source !== 'custom' && source !== 'default') || !id) return null;
  return { type: 'note', source, id };
}

function resolveActiveTarget(
  state: CategoryQuickNoteMenuState,
  position: CategoryQuickNoteMenuPoint,
): ActiveTarget {
  if (state.hasLeftAnchor && pointInsideBounds(position, state.anchor.bounds)) {
    return { type: 'category' };
  }
  return resolveDomTarget(position);
}

function activeTargetsEqual(first: ActiveTarget, second: ActiveTarget): boolean {
  if (first === null || second === null) return first === second;
  if (first.type !== second.type) return false;
  if (first.type === 'category') return true;
  return (
    second.type === 'note' &&
    first.source === second.source &&
    first.id === second.id
  );
}

export function useCategoryQuickNoteMenu(
  options: UseCategoryQuickNoteMenuOptions,
): {
  state: CategoryQuickNoteMenuState | null;
  handlers: CategoryQuickNoteMenuHandlers;
} {
  const [state, setState] = useState<CategoryQuickNoteMenuState | null>(null);
  const stateRef = useRef<CategoryQuickNoteMenuState | null>(null);
  const optionsRef = useRef(options);
  const previousResetKeyRef = useRef(options.resetKey);
  const anchorCleanupRef = useRef<(() => void) | null>(null);
  optionsRef.current = options;

  const commitState = useCallback(
    (
      updater: (
        previous: CategoryQuickNoteMenuState | null,
      ) => CategoryQuickNoteMenuState | null,
    ) => {
      setState((previous) => {
        const next = updater(previous);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearAnchorPresentation = useCallback(() => {
    anchorCleanupRef.current?.();
    anchorCleanupRef.current = null;
  }, []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      const anchor = stateRef.current?.anchor.element ?? null;
      clearAnchorPresentation();
      stateRef.current = null;
      setState(null);
      if (restoreFocus && anchor) {
        queueMicrotask(() => anchor.focus());
      }
    },
    [clearAnchorPresentation],
  );

  const handleLongPressStart = useCallback(
    (
      category: string,
      position: CategoryQuickNoteMenuPoint,
      anchor: CategoryQuickNoteMenuAnchor,
    ) => {
      clearAnchorPresentation();
      const presentation =
        optionsRef.current.getCategoryPresentation(category);
      anchorCleanupRef.current = activateAnchorPresentation(
        anchor,
        presentation.color,
      );
      const next: CategoryQuickNoteMenuState = {
        category,
        presentation,
        anchor,
        customNotes: optionsRef.current
          .getCustomNotes(category)
          .slice(0, MAX_CUSTOM_NOTES),
        defaultNotes: optionsRef.current
          .getDefaultNotes()
          .slice(0, MAX_DEFAULT_NOTES),
        isGestureActive: true,
        hasLeftAnchor: false,
        dragPosition: position,
        activeTarget: null,
      };
      stateRef.current = next;
      setState(next);
    },
    [clearAnchorPresentation],
  );

  const handleDrag = useCallback(
    (position: CategoryQuickNoteMenuPoint) => {
      commitState((previous) => {
        if (!previous) return null;
        const hasLeftAnchor =
          previous.hasLeftAnchor ||
          !pointInsideBounds(position, previous.anchor.bounds);
        const candidate = {
          ...previous,
          hasLeftAnchor,
        };
        const activeTarget = resolveActiveTarget(candidate, position);
        setAnchorReturnTarget(
          previous.anchor,
          activeTarget?.type === 'category',
        );
        if (
          activeTarget !== null &&
          !activeTargetsEqual(activeTarget, previous.activeTarget)
        ) {
          triggerHapticFeedback('selection');
        }
        return {
          ...candidate,
          dragPosition: position,
          activeTarget,
        };
      });
    },
    [commitState],
  );

  const handleRelease = useCallback(
    (position: CategoryQuickNoteMenuPoint) => {
      const current = stateRef.current;
      if (!current) return;
      const hasLeftAnchor =
        current.hasLeftAnchor ||
        !pointInsideBounds(position, current.anchor.bounds);
      const resolvedState = { ...current, hasLeftAnchor };
      const target = resolveActiveTarget(resolvedState, position);

      if (target?.type === 'category') {
        const category = current.category;
        close(false);
        optionsRef.current.onUseCategory(category);
        return;
      }

      if (target?.type === 'note') {
        const notes =
          target.source === 'custom'
            ? current.customNotes
            : current.defaultNotes;
        const note = notes.find((candidate) => candidate.id === target.id);
        if (note) {
          const category = current.category;
          close(false);
          optionsRef.current.onSelectNote(note, category);
          return;
        }
      }

      close(false);
    },
    [close],
  );

  const handleSelectNote = useCallback(
    (source: CategoryQuickNoteMenuNoteSource, id: string) => {
      const current = stateRef.current;
      if (!current) return;
      const notes =
        source === 'custom' ? current.customNotes : current.defaultNotes;
      const note = notes.find((candidate) => candidate.id === id);
      if (!note) return;
      const category = current.category;
      triggerHapticFeedback('selection');
      close(false);
      optionsRef.current.onSelectNote(note, category);
    },
    [close],
  );

  const handleUseCategory = useCallback(() => {
    const category = stateRef.current?.category;
    if (!category) return;
    triggerHapticFeedback('selection');
    close(false);
    optionsRef.current.onUseCategory(category);
  }, [close]);

  const handleDismiss = useCallback(() => close(true), [close]);

  useEffect(() => {
    if (Object.is(previousResetKeyRef.current, options.resetKey)) return;
    previousResetKeyRef.current = options.resetKey;
    if (stateRef.current) close(true);
  }, [close, options.resetKey]);

  useEffect(
    () => () => {
      clearAnchorPresentation();
      stateRef.current = null;
    },
    [clearAnchorPresentation],
  );

  return {
    state,
    handlers: {
      onLongPressStart: handleLongPressStart,
      onDrag: handleDrag,
      onRelease: handleRelease,
      onCancel: handleDismiss,
      onDismiss: handleDismiss,
      onSelectNote: handleSelectNote,
      onUseCategory: handleUseCategory,
    },
  };
}
