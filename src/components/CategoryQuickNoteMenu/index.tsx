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
import { HapticSelectionButton } from '../ui/HapticSelectionButton';
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
const CARD_GAP = 34;
const CARD_WIDTH = 320;
const CONNECTOR_EDGE_INSET = 38;
const TOP_ROW_SIDE_BIAS = 72;

type MenuPlacement = 'above' | 'below';

type MenuPosition = {
  left: number;
  top: number;
  connectorX: number;
  placement: MenuPlacement;
  width: number;
  height: number;
};

type TetherGeometry = {
  path: string;
  dotX: number;
  dotY: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function estimateCardHeight(state: CategoryQuickNoteMenuState): number {
  const toplineHeight = 32;
  const headerHeight = 58;
  const customHeight = state.customNotes.length * 46;
  const defaultHeight = state.defaultNotes.length > 0 ? 66 : 0;
  const dividerHeight =
    Number(state.customNotes.length > 0) + Number(state.defaultNotes.length > 0);
  return (
    toplineHeight +
    headerHeight +
    customHeight +
    defaultHeight +
    dividerHeight
  );
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
  const aboveTop = anchor.top - CARD_GAP - cardHeight;
  const belowTop = anchor.bottom + CARD_GAP;
  const fitsAbove = aboveTop >= VIEWPORT_MARGIN;
  const fitsBelow =
    belowTop + cardHeight <= viewportHeight - VIEWPORT_MARGIN;
  const placement: MenuPlacement =
    fitsAbove || (!fitsBelow && anchor.top > viewportHeight - anchor.bottom)
      ? 'above'
      : 'below';
  const sideBias =
    placement === 'below'
      ? anchorCenter < viewportWidth / 2
        ? TOP_ROW_SIDE_BIAS
        : -TOP_ROW_SIDE_BIAS
      : 0;
  const left = clamp(
    anchorCenter - cardWidth / 2 + sideBias,
    VIEWPORT_MARGIN,
    viewportWidth - cardWidth - VIEWPORT_MARGIN,
  );
  const rawTop = placement === 'above' ? aboveTop : belowTop;
  const top = clamp(
    rawTop,
    VIEWPORT_MARGIN,
    viewportHeight - cardHeight - VIEWPORT_MARGIN,
  );
  const connectorX = clamp(
    anchorCenter - left,
    CONNECTOR_EDGE_INSET,
    Math.max(CONNECTOR_EDGE_INSET, cardWidth - CONNECTOR_EDGE_INSET),
  );
  return {
    left,
    top,
    connectorX,
    placement,
    width: cardWidth,
    height: cardHeight,
  };
}

function resolveTetherGeometry(
  position: MenuPosition,
  anchor: CategoryQuickNoteMenuBounds,
): TetherGeometry {
  const sourceX = position.left + position.connectorX;
  const sourceY =
    position.placement === 'above'
      ? position.top + position.height
      : position.top;
  const dotX = anchor.left + anchor.width / 2;
  const dotY =
    position.placement === 'above' ? anchor.top + 4 : anchor.bottom - 4;
  const direction = position.placement === 'above' ? 1 : -1;
  const bend = clamp(Math.abs(dotY - sourceY) * 0.45, 18, 30);
  const firstControlY = sourceY + direction * bend;
  const secondControlY = dotY - direction * bend;

  return {
    path: `M ${sourceX} ${sourceY} C ${sourceX} ${firstControlY}, ${dotX} ${secondControlY}, ${dotX} ${dotY}`,
    dotX,
    dotY,
  };
}

function itemAccentStyle(color: string): CSSProperties {
  return { '--category-menu-item-accent': color } as CSSProperties;
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
    const width =
      cardRef.current.offsetWidth || cardBounds.width || estimatedWidth;
    const height =
      cardRef.current.offsetHeight ||
      cardBounds.height ||
      estimateCardHeight(state);
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
  const tether =
    state && position
      ? resolveTetherGeometry(position, state.anchor.bounds)
      : null;
  const activeNote =
    state?.activeTarget?.type === 'note' ? state.activeTarget : null;
  const categorySelected = state?.activeTarget?.type === 'category';

  const layer =
    state && position && tether ? (
      <motion.div
        key={`category-quick-note-${state.category}`}
        className="fixed inset-0 z-[70]"
        style={
          {
            '--category-menu-accent': state.presentation.color,
          } as CSSProperties
        }
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0.08 : 0.16 }}
      >
        <button
          type="button"
          data-testid="category-menu-backdrop"
          aria-label={`Dismiss ${state.presentation.label} quick notes`}
          className="absolute inset-0 h-full w-full cursor-default border-0 bg-overlay/20 p-0 backdrop-blur-[1px]"
          onPointerDown={(event) => {
            event.preventDefault();
            onDismiss();
          }}
          onClick={onDismiss}
        />

        <svg
          data-testid="category-menu-tether"
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[71] h-full w-full overflow-visible"
        >
          <path className="category-menu-tether-path" d={tether.path} />
          <circle
            className="category-menu-tether-dot"
            cx={tether.dotX}
            cy={tether.dotY}
            r="4"
          />
        </svg>

        <motion.div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${state.presentation.label} quick notes`}
          data-placement={position.placement}
          data-gesture-active={state.isGestureActive ? 'true' : 'false'}
          className="category-quick-note-card fixed z-[72] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[20px] border border-border bg-card text-card-foreground"
          style={{ left: position.left, top: position.top }}
          initial={
            reducedMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  scale: 0.97,
                  y: position.placement === 'above' ? 5 : -5,
                }
          }
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
          transition={
            reducedMotion
              ? { duration: 0.08 }
              : { type: 'spring', stiffness: 420, damping: 34 }
          }
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="category-menu-topline flex min-h-8 items-center gap-2 border-b border-border/50 px-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            <span className="category-menu-topline-dot h-1.5 w-1.5 rounded-full" />
            <span>Quick actions</span>
          </div>

          <HapticSelectionButton
            type="button"
            changesValue
            data-category-menu-autofocus
            data-active={categorySelected ? 'true' : 'false'}
            aria-label={`Use ${state.presentation.label} category`}
            className="category-menu-header relative flex min-h-[3.625rem] w-full items-center gap-3 border-0 bg-transparent px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
            onClick={onUseCategory}
          >
            <span className="category-menu-header-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <DynamicIcon
                name={state.presentation.icon}
                className="h-[18px] w-[18px]"
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {state.presentation.label}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
              Use category
            </span>
          </HapticSelectionButton>

          {state.customNotes.length > 0 ? (
            <div className="category-menu-custom-list border-t border-border/50 px-2 py-1">
              {state.customNotes.map((note) => {
                const selected =
                  activeNote?.source === 'custom' && activeNote.id === note.id;
                const color = note.color ?? state.presentation.color;
                return (
                  <HapticSelectionButton
                    key={`custom:${note.id}`}
                    type="button"
                    changesValue
                    data-category-menu-row="custom"
                    data-active={selected ? 'true' : 'false'}
                    data-category-quick-note-source="custom"
                    data-category-quick-note-id={note.id}
                    className="category-menu-custom-row relative flex min-h-11 w-full items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    style={itemAccentStyle(color)}
                    title={note.label}
                    onClick={() => onSelectNote('custom', note.id)}
                  >
                    <span
                      data-category-menu-active-rail
                      className="category-menu-active-rail absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-full"
                    />
                    <span className="category-menu-custom-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]">
                      <DynamicIcon name={note.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {note.label}
                    </span>
                  </HapticSelectionButton>
                );
              })}
            </div>
          ) : null}

          {state.defaultNotes.length > 0 ? (
            <div
              className="category-menu-default-dock grid gap-1 border-t border-border/50 px-2 pb-2 pt-1.5"
              style={{
                gridTemplateColumns: `repeat(${state.defaultNotes.length}, minmax(0, 1fr))`,
              }}
            >
              {state.defaultNotes.map((note) => {
                const selected =
                  activeNote?.source === 'default' && activeNote.id === note.id;
                const color = note.color ?? state.presentation.color;
                return (
                  <HapticSelectionButton
                    key={`default:${note.id}`}
                    type="button"
                    changesValue
                    data-category-menu-default-action="true"
                    data-active={selected ? 'true' : 'false'}
                    data-category-quick-note-source="default"
                    data-category-quick-note-id={note.id}
                    className="category-menu-default-action relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border-0 bg-transparent px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    style={itemAccentStyle(color)}
                    title={note.label}
                    onClick={() => onSelectNote('default', note.id)}
                  >
                    <span className="category-menu-default-icon">
                      <DynamicIcon
                        name={note.icon}
                        className="h-[18px] w-[18px]"
                      />
                    </span>
                    <span className="w-full truncate text-[10px] font-semibold leading-tight">
                      {note.label}
                    </span>
                    <span className="category-menu-default-indicator absolute inset-x-2 bottom-0 h-0.5 rounded-full" />
                  </HapticSelectionButton>
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
