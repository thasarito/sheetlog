import { useCallback, useEffect, useRef, useState } from 'react';
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

type AnchorPresentationSnapshot = {
  ariaHasPopup: string | null;
  ariaExpanded: string | null;
  borderColor: string;
  backgroundColor: string;
  outline: string;
  outlineOffset: string;
};

function activateAnchorPresentation(
  anchor: CategoryQuickNoteMenuAnchor,
): () => void {
  const { element } = anchor;
  const snapshot: AnchorPresentationSnapshot = {
    ariaHasPopup: element.getAttribute('aria-haspopup'),
    ariaExpanded: element.getAttribute('aria-expanded'),
    borderColor: element.style.borderColor,
    backgroundColor: element.style.backgroundColor,
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
  };

  element.setAttribute('aria-haspopup', 'dialog');
  element.setAttribute('aria-expanded', 'true');
  element.dataset.categoryQuickNoteOpen = 'true';
  element.style.borderColor = 'hsl(var(--primary))';
  element.style.backgroundColor =
    'color-mix(in srgb, hsl(var(--primary)) 12%, hsl(var(--card)))';
  element.style.outline =
    '2px solid color-mix(in srgb, hsl(var(--primary)) 34%, transparent)';
  element.style.outlineOffset = '2px';

  return () => {
    if (snapshot.ariaHasPopup === null) {
      element.removeAttribute('aria-haspopup');
    } else {
      element.setAttribute('aria-haspopup', snapshot.ariaHasPopup);
    }
    if (snapshot.ariaExpanded === null) {
      element.removeAttribute('aria-expanded');
    } else {
      element.setAttribute('aria-expanded', snapshot.ariaExpanded);
    }
    delete element.dataset.categoryQuickNoteOpen;
    element.style.borderColor = snapshot.borderColor;
    element.style.backgroundColor = snapshot.backgroundColor;
    element.style.outline = snapshot.outline;
    element.style.outlineOffset = snapshot.outlineOffset;
  };
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

function triggerReturnHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(6);
  }
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
      anchorCleanupRef.current = activateAnchorPresentation(anchor);
      const next: CategoryQuickNoteMenuState = {
        category,
        presentation:
          optionsRef.current.getCategoryPresentation(category),
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
        if (
          activeTarget?.type === 'category' &&
          previous.activeTarget?.type !== 'category'
        ) {
          triggerReturnHaptic();
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

      const next: CategoryQuickNoteMenuState = {
        ...resolvedState,
        isGestureActive: false,
        dragPosition: null,
        activeTarget: null,
      };
      stateRef.current = next;
      setState(next);
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
      close(false);
      optionsRef.current.onSelectNote(note, category);
    },
    [close],
  );

  const handleUseCategory = useCallback(() => {
    const category = stateRef.current?.category;
    if (!category) return;
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
