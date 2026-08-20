import { useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getCategoryRadialSpotlight } from '../categoryRadialSpotlight';
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
  const color = sector.color ?? (isCancel ? '#ef4444' : '#3b82f6');
  const circleStyle: CSSProperties = {
    color: isSelected ? 'white' : color,
    borderColor: isSelected
      ? 'rgba(255, 255, 255, 0.9)'
      : `color-mix(in srgb, ${color} 68%, hsl(var(--border)))`,
    backgroundColor: isSelected
      ? color
      : `color-mix(in srgb, ${color} 18%, hsl(var(--card)))`,
    boxShadow: isSelected
      ? `0 0 0 8px color-mix(in srgb, ${color} 24%, transparent)`
      : `0 0 0 5px color-mix(in srgb, ${color} 12%, transparent)`,
  };
  const labelStyle: CSSProperties = {
    borderColor: `color-mix(in srgb, ${color} ${isSelected ? 64 : 32}%, hsl(var(--border)))`,
    color: isSelected ? color : 'hsl(var(--muted-foreground))',
  };

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
          data-testid="radial-menu-node-circle"
          className="flex h-14 w-14 items-center justify-center rounded-full border-[3px]"
          style={circleStyle}
        >
          {isCancel ? (
            <span className="text-[22px] font-bold leading-none">×</span>
          ) : (
            <DynamicIcon name={sector.icon} className="h-[22px] w-[22px]" />
          )}
        </div>
        <div
          className="mt-2 max-w-[120px] rounded-lg border bg-card/90 px-2.5 py-1 text-center text-[11px] font-semibold leading-tight"
          style={labelStyle}
        >
          {sector.label}
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
  const spotlight = isOpen ? getCategoryRadialSpotlight() : null;
  const itemsWithCancel = useMemo(() => {
    if (items.length === 0) return items;
    return [
      ...items,
      {
        id: CANCEL_ITEM_ID,
        icon: 'X',
        label: 'Cancel',
        color: '#ef4444',
      },
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
  const activeColor =
    selectedSector?.color ?? categoryPresentation?.color ?? '#3b82f6';
  const spotlightCenter = spotlight
    ? `${spotlight.center.x},${spotlight.center.y}`
    : undefined;
  const backdropMask = spotlight
    ? `radial-gradient(circle at ${spotlight.center.x}px ${spotlight.center.y}px, transparent 0 ${spotlight.radius}px, rgba(0, 0, 0, 0.42) ${spotlight.radius + 8}px, black ${spotlight.radius + 16}px)`
    : undefined;
  const spotlightMaskId = 'radial-menu-category-spotlight-mask';

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
              data-testid="radial-menu-backdrop"
              data-spotlight-center={spotlightCenter}
              className="absolute inset-0 h-full w-full touch-none cursor-default border-0 bg-overlay/45 p-0 backdrop-blur-[2px]"
              style={
                backdropMask
                  ? {
                      maskImage: backdropMask,
                      WebkitMaskImage: backdropMask,
                      maskRepeat: 'no-repeat',
                      WebkitMaskRepeat: 'no-repeat',
                    }
                  : undefined
              }
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
              {spotlight ? (
                <defs>
                  <mask
                    id={spotlightMaskId}
                    maskUnits="userSpaceOnUse"
                    x={bounds.left}
                    y={bounds.top}
                    width={bounds.width}
                    height={bounds.height}
                  >
                    <rect
                      x={bounds.left}
                      y={bounds.top}
                      width={bounds.width}
                      height={bounds.height}
                      fill="white"
                    />
                    <circle
                      cx={spotlight.center.x}
                      cy={spotlight.center.y}
                      r={spotlight.radius + 7}
                      fill="black"
                    />
                  </mask>
                </defs>
              ) : null}
              <motion.g
                mask={spotlight ? `url(#${spotlightMaskId})` : undefined}
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
                  const color = sector.color ?? (isCancel ? '#ef4444' : '#3b82f6');

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
                        data-sector-color={color}
                        d={radialPolygonPath(sector.polygon)}
                        style={{
                          fill: `color-mix(in srgb, ${color} ${isSelected ? 32 : 14}%, transparent)`,
                          stroke: `color-mix(in srgb, ${color} ${isSelected ? 96 : 42}%, transparent)`,
                          opacity:
                            selectedSector && !isSelected
                              ? 0.64
                              : 1,
                        }}
                        strokeWidth={isSelected ? 2.8 : 1.25}
                        vectorEffect="non-scaling-stroke"
                      />
                    </motion.g>
                  );
                })}
              </motion.g>

              {showGesture && dragPosition ? (
                <g
                  data-testid="radial-menu-gesture"
                  data-active-color={activeColor}
                >
                  <motion.line
                    x1={anchorPosition.x}
                    y1={anchorPosition.y}
                    x2={dragPosition.x}
                    y2={dragPosition.y}
                    style={{
                      stroke: `color-mix(in srgb, ${activeColor} 72%, white)`,
                    }}
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    strokeDasharray="5 6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                  <motion.circle
                    cx={dragPosition.x}
                    cy={dragPosition.y}
                    r={8}
                    fill="hsl(var(--foreground))"
                    style={{ stroke: activeColor }}
                    strokeWidth={4}
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
          </motion.div>
        )}
    </AnimatePresence>
  );
}
