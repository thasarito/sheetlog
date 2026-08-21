import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { DynamicIcon } from '../DynamicIcon';
import type {
  CategoryQuickNoteMenuBounds,
  CategoryQuickNoteMenuNoteSource,
  CategoryQuickNoteMenuState,
} from './useCategoryQuickNoteMenu';

export { useCategoryQuickNoteMenu } from './useCategoryQuickNoteMenu';
export type {
  CategoryQuickNoteMenuAnchor,
  CategoryQuickNoteMenuBounds,
  CategoryQuickNoteMenuPoint,
  CategoryQuickNoteMenuPresentation,
  CategoryQuickNoteMenuState,
} from './useCategoryQuickNoteMenu';

const VIEWPORT_MARGIN = 12;
const CARD_GAP = 12;
const CARD_WIDTH = 288;

type MenuPlacement = 'above' | 'below';

type MenuPosition = {
  left: number;
  top: number;
  arrowX: number;
  placement: MenuPlacement;
};

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function estimateCardHeight(state: CategoryQuickNoteMenuState): number {
  const headerHeight = 58;
  const customHeight = state.customNotes.length * 48;
  const defaultHeight = state.defaultNotes.length > 0 ? 76 : 0;
  const dividerHeight =
    state.customNotes.length > 0 && state.defaultNotes.length > 0 ? 1 : 0;
  return headerHeight + customHeight + defaultHeight + dividerHeight;
}

function resolveMenuPosition(
  anchor: CategoryQuickNoteMenuBounds,
  cardWidth: number,
  cardHeight: number,
): MenuPosition {
  const viewportWidth =
    typeof window === 'undefined' ? 375 : Math.max(1, window.innerWidth);
  const viewportHeight =
    typeof window === 'undefined' ? 812 : Math.max(1, window.innerHeight);
  const anchorCenter = anchor.left + anchor.width / 2;
  const left = clamp(
    anchorCenter - cardWidth / 2,
    VIEWPORT_MARGIN,
    viewportWidth - cardWidth - VIEWPORT_MARGIN,
  );
  const aboveTop = anchor.top - CARD_GAP - cardHeight;
  const belowTop = anchor.bottom + CARD_GAP;
  const fitsAbove = aboveTop >= VIEWPORT_MARGIN;
  const fitsBelow =
    belowTop + cardHeight <= viewportHeight - VIEWPORT_MARGIN;
  const placement: MenuPlacement =
    fitsAbove || (!fitsBelow && anchor.top > viewportHeight - anchor.bottom)
      ? 'above'
      : 'below';
  const rawTop = placement === 'above' ? aboveTop : belowTop;
  const top = clamp(
    rawTop,
    VIEWPORT_MARGIN,
    viewportHeight - cardHeight - VIEWPORT_MARGIN,
  );
  const arrowX = clamp(
    anchorCenter - left,
    18,
    Math.max(18, cardWidth - 18),
  );
  return { left, top, arrowX, placement };
}

function noteStyle(
  color: string,
  selected: boolean,
): Pick<CSSProperties, 'backgroundColor' | 'borderColor' | 'color'> {
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} ${selected ? 72 : 28}%, hsl(var(--border)))`,
    backgroundColor: `color-mix(in srgb, ${color} ${selected ? 20 : 8}%, hsl(var(--card)))`,
  };
}

type CategoryQuickNoteMenuProps = {
  state: CategoryQuickNoteMenuState | null;
  onDismiss: () => void;
  onSelectNote: (source: CategoryQuickNoteMenuNoteSource, id: string) => void;
  onUseCategory: () => void;
};

export function CategoryQuickNoteMenu({
  state,
  onDismiss,
  onSelectNote,
  onUseCategory,
}: CategoryQuickNoteMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const estimatedWidth =
    typeof window === 'undefined'
      ? CARD_WIDTH
      : Math.max(1, Math.min(CARD_WIDTH, window.innerWidth - 24));
  const estimatedPosition = useMemo(
    () =>
      state
        ? resolveMenuPosition(
            state.anchor.bounds,
            estimatedWidth,
            estimateCardHeight(state),
          )
        : null,
    [estimatedWidth, state],
  );
  const [measuredPosition, setMeasuredPosition] = useState<MenuPosition | null>(
    null,
  );

  const updatePosition = useCallback(() => {
    if (!state || !cardRef.current) return;
    const cardBounds = cardRef.current.getBoundingClientRect();
    const width = cardBounds.width || estimatedWidth;
    const height = cardBounds.height || estimateCardHeight(state);
    setMeasuredPosition(resolveMenuPosition(state.anchor.bounds, width, height));
  }, [estimatedWidth, state]);

  useLayoutEffect(() => {
    setMeasuredPosition(null);
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    if (!state) return;
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [state, updatePosition]);

  useEffect(() => {
    if (!state) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss, state]);

  useEffect(() => {
    if (!state || state.isGestureActive) return;
    queueMicrotask(() => {
      cardRef.current
        ?.querySelector<HTMLButtonElement>('[data-category-menu-autofocus]')
        ?.focus();
    });
  }, [state]);

  const position = measuredPosition ?? estimatedPosition;
  const activeNote = state?.activeTarget?.type === 'note'
    ? state.activeTarget
    : null;
  const categorySelected = state?.activeTarget?.type === 'category';

  const layer =
    state && position ? (
        <motion.div
          key={`category-quick-note-${state.category}`}
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.08 : 0.16 }}
        >
          <button
            type="button"
            aria-label={`Dismiss ${state.presentation.label} quick notes`}
            className="absolute inset-0 h-full w-full cursor-default border-0 bg-overlay/45 p-0 backdrop-blur-[2px]"
            onPointerDown={(event) => {
              event.preventDefault();
              onDismiss();
            }}
            onClick={onDismiss}
          />

          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${state.presentation.label} quick notes`}
            data-placement={position.placement}
            data-gesture-active={state.isGestureActive ? 'true' : 'false'}
            className="fixed z-[72] w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] border border-border bg-card text-card-foreground"
            style={{ left: position.left, top: position.top }}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.96,
                    y: position.placement === 'above' ? 6 : -6,
                  }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.98 }}
            transition={
              reducedMotion
                ? { duration: 0.08 }
                : { type: 'spring', stiffness: 420, damping: 32 }
            }
            onContextMenu={(event) => event.preventDefault()}
          >
            <div
              aria-hidden="true"
              className="absolute h-3 w-3 rotate-45 border border-border bg-card"
              style={{
                left: position.arrowX,
                transform: 'translateX(-50%) rotate(45deg)',
                ...(position.placement === 'above'
                  ? { bottom: -7 }
                  : { top: -7 }),
              }}
            />

            <button
              type="button"
              data-category-menu-autofocus
              aria-label={`Use ${state.presentation.label} category`}
              className={`relative flex w-full items-center gap-3 border-0 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring ${
                categorySelected ? 'bg-primary/12' : 'bg-card'
              }`}
              onClick={onUseCategory}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                style={noteStyle(state.presentation.color, categorySelected)}
              >
                <DynamicIcon
                  name={state.presentation.icon}
                  className="h-[18px] w-[18px]"
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {state.presentation.label}
              </span>
            </button>

            {state.customNotes.length > 0 ? (
              <div className="border-t border-border/70 px-2 py-1.5">
                {state.customNotes.map((note) => {
                  const selected =
                    activeNote?.source === 'custom' && activeNote.id === note.id;
                  const color = note.color ?? state.presentation.color;
                  return (
                    <button
                      key={`custom:${note.id}`}
                      type="button"
                      data-category-quick-note-source="custom"
                      data-category-quick-note-id={note.id}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      style={noteStyle(color, selected)}
                      title={note.label}
                      onClick={() => onSelectNote('custom', note.id)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                        <DynamicIcon name={note.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {note.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {state.defaultNotes.length > 0 ? (
              <div
                className="grid gap-1 border-t border-border/70 px-2 pb-2 pt-1.5"
                style={{
                  gridTemplateColumns: `repeat(${state.defaultNotes.length}, minmax(0, 1fr))`,
                }}
              >
                {state.defaultNotes.map((note) => {
                  const selected =
                    activeNote?.source === 'default' && activeNote.id === note.id;
                  const color = note.color ?? state.presentation.color;
                  return (
                    <button
                      key={`default:${note.id}`}
                      type="button"
                      data-category-quick-note-source="default"
                      data-category-quick-note-id={note.id}
                      className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      style={noteStyle(color, selected)}
                      title={note.label}
                      onClick={() => onSelectNote('default', note.id)}
                    >
                      <DynamicIcon name={note.icon} className="h-[18px] w-[18px]" />
                      <span className="w-full truncate text-[10px] font-semibold leading-tight text-foreground">
                        {note.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </motion.div>
      </motion.div>
    ) : null;

  return typeof document === 'undefined'
    ? layer
    : createPortal(layer, document.body);
}
