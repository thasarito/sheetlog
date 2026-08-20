import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DynamicIcon } from '../DynamicIcon';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  findEqualAreaSector,
  radialPolygonPath,
  type EqualAreaRadialSector,
  type RadialMenuBounds,
  type RadialMenuItemData,
  type RadialMenuPoint,
} from './equalAreaSectors';

export type {
  EqualAreaRadialLayout,
  EqualAreaRadialSector,
  RadialMenuBounds,
  RadialMenuItemData,
  RadialMenuPoint,
} from './equalAreaSectors';
export { CANCEL_ITEM_ID } from './equalAreaSectors';

export interface RadialMenuCategoryPresentation {
  label: string;
  icon: string;
  color: string;
}

export interface RadialMenuProps {
  items: RadialMenuItemData[];
  anchorPosition: RadialMenuPoint | null;
  dragPosition: RadialMenuPoint | null;
  bounds: RadialMenuBounds | null;
  categoryPresentation: RadialMenuCategoryPresentation | null;
  isOpen: boolean;
  onCancel: () => void;
}

type SectorNodeProps = {
  sector: EqualAreaRadialSector;
  isSelected: boolean;
  reducedMotion: boolean;
  index: number;
};

function SectorNode({
  sector,
  isSelected,
  reducedMotion,
  index,
}: SectorNodeProps) {
  const isCancel = sector.id === CANCEL_ITEM_ID;
  const circleClassName = isSelected
    ? isCancel
      ? 'border-danger bg-danger text-danger-foreground'
      : 'border-primary bg-primary text-primary-foreground'
    : isCancel
      ? 'border-danger/70 bg-card text-danger'
      : 'border-border bg-card text-foreground';
  const labelClassName = isSelected
    ? isCancel
      ? 'border-danger/60 text-danger'
      : 'border-primary/60 text-primary'
    : 'border-border/70 text-muted-foreground';

  return (
    <div
      aria-hidden="true"
      data-testid="radial-menu-node"
      data-sector-id={sector.id}
      className="pointer-events-none fixed z-[72]"
      style={{
        left: sector.labelPoint.x,
        top: sector.labelPoint.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <motion.div
        initial={
          reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.82 }
        }
        animate={{ opacity: 1, scale: isSelected ? 1.1 : 1 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.9 }}
        transition={
          reducedMotion
            ? { duration: 0.1 }
            : {
                type: 'spring',
                stiffness: 430,
                damping: 29,
                delay: index * 0.025,
              }
        }
        className="flex flex-col items-center"
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${circleClassName}`}
        >
          {isCancel ? (
            <span className="text-lg font-bold leading-none">×</span>
          ) : (
            <DynamicIcon name={sector.icon} className="h-[18px] w-[18px]" />
          )}
        </div>
        <div
          className={`mt-1.5 max-w-[104px] rounded-md border bg-card/90 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight ${labelClassName}`}
        >
          {sector.label}
        </div>
      </motion.div>
    </div>
  );
}

type LongPressAnchorProps = {
  position: RadialMenuPoint;
  presentation: RadialMenuCategoryPresentation;
  reducedMotion: boolean;
};

function LongPressAnchor({
  position,
  presentation,
  reducedMotion,
}: LongPressAnchorProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="radial-menu-anchor"
      className="pointer-events-none fixed z-[73]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <motion.div
        className="relative flex h-[62px] w-[62px] items-center justify-center"
        initial={
          reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.72 }
        }
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.86 }}
        transition={
          reducedMotion
            ? { duration: 0.1 }
            : { type: 'spring', stiffness: 420, damping: 27 }
        }
      >
        <motion.div
          className="absolute h-[82px] w-[82px] rounded-full border-2"
          style={{
            borderColor: `color-mix(in srgb, ${presentation.color} 55%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${presentation.color} 11%, transparent)`,
          }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reducedMotion
              ? { duration: 0.1 }
              : { type: 'spring', stiffness: 330, damping: 24, delay: 0.04 }
          }
        />
        <div
          className="relative flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 bg-card"
          style={{
            color: presentation.color,
            borderColor: `color-mix(in srgb, ${presentation.color} 68%, hsl(var(--border)))`,
            backgroundColor: `color-mix(in srgb, ${presentation.color} 18%, hsl(var(--card)))`,
          }}
        >
          <DynamicIcon name={presentation.icon} className="h-6 w-6" />
        </div>
      </motion.div>
    </div>
  );
}

export function RadialMenu({
  items,
  anchorPosition,
  dragPosition,
  bounds,
  categoryPresentation,
  isOpen,
  onCancel,
}: RadialMenuProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const itemsWithCancel = useMemo(() => {
    if (items.length === 0) return items;
    return [
      ...items,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel' },
    ];
  }, [items]);
  const layout = useMemo(
    () =>
      anchorPosition && bounds
        ? createEqualAreaRadialLayout(itemsWithCancel, anchorPosition, bounds)
        : null,
    [anchorPosition, bounds, itemsWithCancel],
  );
  const selectedSector = useMemo(
    () => (layout ? findEqualAreaSector(layout, dragPosition) : null),
    [dragPosition, layout],
  );
  const gestureDistance =
    anchorPosition && dragPosition
      ? Math.hypot(
          dragPosition.x - anchorPosition.x,
          dragPosition.y - anchorPosition.y,
        )
      : 0;
  const showGesture = Boolean(
    anchorPosition && dragPosition && gestureDistance > 2,
  );

  return (
    <AnimatePresence>
      {isOpen &&
        anchorPosition &&
        bounds &&
        layout &&
        categoryPresentation &&
        itemsWithCancel.length > 0 && (
          <motion.div
            key="radial-menu-layer"
            className="fixed inset-0 z-[70]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.16 }}
          >
            <motion.button
              type="button"
              aria-label="Cancel quick note menu"
              className="absolute inset-0 h-full w-full touch-none cursor-default border-0 bg-overlay/45 p-0 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.1 : 0.18 }}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                event.preventDefault();
                onCancel();
              }}
              onClick={onCancel}
            />

            <motion.svg
              aria-hidden="true"
              data-testid="radial-menu-sectors"
              className="pointer-events-none fixed inset-0 z-[71] h-full w-full"
              width={bounds.width}
              height={bounds.height}
              viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}
              preserveAspectRatio="none"
            >
              <title>{categoryPresentation.label} quick notes</title>
              <motion.g
                style={{
                  transformOrigin: `${anchorPosition.x}px ${anchorPosition.y}px`,
                }}
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.97 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
              >
                {layout.sectors.map((sector, index) => {
                  const isSelected = sector.id === selectedSector?.id;
                  const isCancel = sector.id === CANCEL_ITEM_ID;
                  const className = isSelected
                    ? isCancel
                      ? 'fill-danger/20 stroke-danger/75'
                      : 'fill-primary/20 stroke-primary/75'
                    : 'fill-card/5 stroke-border/25';

                  return (
                    <motion.g
                      key={sector.id}
                      data-testid="radial-menu-sector"
                      data-sector-id={sector.id}
                      data-selected={isSelected ? 'true' : 'false'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: reducedMotion ? 0.08 : 0.18,
                        delay: reducedMotion ? 0 : index * 0.018,
                      }}
                    >
                      <motion.path
                        data-testid={`radial-menu-sector-${sector.id}`}
                        data-selected={isSelected ? 'true' : 'false'}
                        d={radialPolygonPath(sector.polygon)}
                        className={className}
                        strokeWidth={isSelected ? 2.25 : 1}
                        vectorEffect="non-scaling-stroke"
                      />
                    </motion.g>
                  );
                })}
              </motion.g>

              {showGesture && dragPosition ? (
                <g data-testid="radial-menu-gesture">
                  <motion.line
                    x1={anchorPosition.x}
                    y1={anchorPosition.y}
                    x2={dragPosition.x}
                    y2={dragPosition.y}
                    className="stroke-foreground/65"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray="5 6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                  <motion.circle
                    cx={dragPosition.x}
                    cy={dragPosition.y}
                    r={7}
                    className="fill-foreground stroke-primary"
                    strokeWidth={3}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                </g>
              ) : null}
            </motion.svg>

            {layout.sectors.map((sector, index) => (
              <SectorNode
                key={sector.id}
                sector={sector}
                isSelected={sector.id === selectedSector?.id}
                reducedMotion={reducedMotion}
                index={index}
              />
            ))}

            <LongPressAnchor
              position={anchorPosition}
              presentation={categoryPresentation}
              reducedMotion={reducedMotion}
            />
          </motion.div>
        )}
    </AnimatePresence>
  );
}
