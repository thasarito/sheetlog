import {
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DynamicIcon } from '../DynamicIcon';
import {
  createConstellationBoundary,
  getConstellationAccent,
  isConstellationBoundaryHighlighted,
} from './constellationLens';
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
  accentColor: string;
  isSelected: boolean;
  reducedMotion: boolean;
  index: number;
};

function SectorNode({
  sector,
  accentColor,
  isSelected,
  reducedMotion,
  index,
}: SectorNodeProps) {
  const isCancel = sector.id === CANCEL_ITEM_ID;
  const selectedForeground = isCancel
    ? 'hsl(var(--danger-foreground))'
    : 'hsl(var(--background))';
  const iconStyle: CSSProperties = {
    color: isSelected ? selectedForeground : accentColor,
    borderColor: `color-mix(in srgb, ${accentColor} ${isSelected ? 82 : 58}%, hsl(var(--border)))`,
    background: isSelected
      ? accentColor
      : `radial-gradient(circle at 35% 30%, hsl(var(--foreground) / 0.13), transparent 42%), color-mix(in srgb, ${accentColor} 13%, hsl(var(--card)))`,
  };
  const labelStyle: CSSProperties = {
    color: isSelected
      ? 'hsl(var(--foreground))'
      : 'hsl(var(--muted-foreground))',
    backgroundColor: isSelected
      ? `color-mix(in srgb, ${accentColor} 19%, hsl(var(--background) / 0.78))`
      : 'hsl(var(--background) / 0.62)',
  };

  return (
    <div
      aria-hidden="true"
      data-testid="radial-menu-node"
      data-sector-id={sector.id}
      data-selected={isSelected ? 'true' : 'false'}
      data-variant="constellation"
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
        animate={{ opacity: 1, scale: isSelected ? 1.12 : 1 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.9 }}
        transition={
          reducedMotion
            ? { duration: 0.1 }
            : {
                type: 'spring',
                stiffness: 430,
                damping: 29,
                delay: index * 0.03,
              }
        }
        className="flex min-w-[66px] flex-col items-center"
      >
        <div className="relative flex h-[57px] w-[57px] items-center justify-center">
          <motion.div
            aria-hidden="true"
            className="absolute h-[57px] w-[57px] rounded-full border border-dashed"
            style={{
              borderColor: `color-mix(in srgb, ${accentColor} ${isSelected ? 48 : 25}%, transparent)`,
            }}
            animate={{
              opacity: isSelected ? 1 : 0.72,
              scale: isSelected ? 1.04 : 1,
            }}
            transition={{ duration: reducedMotion ? 0.1 : 0.16 }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute h-[53px] w-[53px] rounded-full border"
            style={{
              borderColor: `color-mix(in srgb, ${accentColor} ${isSelected ? 28 : 8}%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${accentColor} ${isSelected ? 12 : 5}%, transparent)`,
            }}
            animate={{ opacity: isSelected ? 1 : 0.72 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.16 }}
          />
          <div
            className="relative flex h-[43px] w-[43px] items-center justify-center rounded-full border-[1.5px]"
            style={iconStyle}
          >
            {isCancel ? (
              <span className="text-lg font-bold leading-none">×</span>
            ) : (
              <DynamicIcon name={sector.icon} className="h-[18px] w-[18px]" />
            )}
          </div>
        </div>
        <div
          className="mt-1.5 max-w-[102px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-none backdrop-blur-[5px]"
          style={labelStyle}
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
      data-variant="constellation"
      className="pointer-events-none fixed z-[73]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <motion.div
        className="relative flex h-[78px] w-[78px] items-center justify-center"
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
          aria-hidden="true"
          className="absolute h-[104px] w-[104px] rounded-full border-[1.5px] border-dashed"
          style={{
            borderColor: `color-mix(in srgb, ${presentation.color} 42%, transparent)`,
          }}
          animate={
            reducedMotion
              ? { opacity: 0.62, scale: 1 }
              : {
                  opacity: [0.44, 0.86, 0.44],
                  scale: [0.94, 1.05, 0.94],
                }
          }
          transition={
            reducedMotion
              ? { duration: 0.1 }
              : {
                  duration: 1.7,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }
          }
        />
        <motion.div
          aria-hidden="true"
          className="absolute h-[72px] w-[72px] rounded-full border"
          style={{
            borderColor: `color-mix(in srgb, ${presentation.color} 24%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${presentation.color} 9%, transparent)`,
          }}
          initial={
            reducedMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.76 }
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reducedMotion
              ? { duration: 0.1 }
              : {
                  type: 'spring',
                  stiffness: 330,
                  damping: 24,
                  delay: 0.04,
                }
          }
        />
        <div
          className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full border-2"
          style={{
            color: presentation.color,
            borderColor: `color-mix(in srgb, ${presentation.color} 68%, hsl(var(--border)))`,
            backgroundColor: `color-mix(in srgb, ${presentation.color} 16%, hsl(var(--card)))`,
          }}
        >
          <DynamicIcon
            name={presentation.icon}
            className="h-[22px] w-[22px]"
          />
        </div>
        <div
          data-testid="radial-menu-anchor-label"
          className="absolute left-1/2 top-full mt-1.5 max-w-[116px] -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-border/50 bg-background/75 px-2 py-1 text-[9px] font-semibold leading-none text-foreground/80 backdrop-blur-[5px]"
        >
          {presentation.label}
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
  const selectedSectorIndex =
    layout && selectedSector
      ? layout.sectors.findIndex((sector) => sector.id === selectedSector.id)
      : null;
  const selectedAccent =
    selectedSectorIndex !== null && selectedSectorIndex >= 0 && selectedSector
      ? getConstellationAccent(
          selectedSectorIndex,
          selectedSector.id === CANCEL_ITEM_ID,
        )
      : categoryPresentation?.color ?? 'hsl(var(--primary))';
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
  const contourBend = bounds
    ? Math.min(24, Math.max(14, Math.min(bounds.width, bounds.height) * 0.04))
    : 22;
  const spotlightRadius = bounds
    ? Math.hypot(bounds.width, bounds.height) * 0.72
    : 640;

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
              className="absolute inset-0 h-full w-full touch-none cursor-default border-0 bg-overlay/40 p-0 backdrop-blur-[1.5px]"
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
              <defs>
                <radialGradient
                  id="radial-menu-constellation-spotlight"
                  gradientUnits="userSpaceOnUse"
                  cx={anchorPosition.x}
                  cy={anchorPosition.y}
                  r={spotlightRadius}
                >
                  <stop
                    offset="0%"
                    stopColor={selectedAccent}
                    stopOpacity={0.035}
                  />
                  <stop
                    offset="42%"
                    stopColor={selectedAccent}
                    stopOpacity={0.17}
                  />
                  <stop
                    offset="100%"
                    stopColor={selectedAccent}
                    stopOpacity={0.025}
                  />
                </radialGradient>
                <linearGradient
                  id="radial-menu-constellation-trail"
                  gradientUnits="userSpaceOnUse"
                  x1={anchorPosition.x}
                  y1={anchorPosition.y}
                  x2={dragPosition?.x ?? anchorPosition.x}
                  y2={dragPosition?.y ?? anchorPosition.y}
                >
                  <stop
                    offset="0%"
                    stopColor={categoryPresentation.color}
                    stopOpacity={0.26}
                  />
                  <stop
                    offset="65%"
                    stopColor={selectedAccent}
                    stopOpacity={0.84}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--foreground))"
                    stopOpacity={1}
                  />
                </linearGradient>
              </defs>

              {selectedSector ? (
                <motion.path
                  data-testid="radial-menu-spotlight"
                  data-sector-id={selectedSector.id}
                  d={radialPolygonPath(selectedSector.polygon)}
                  fill="url(#radial-menu-constellation-spotlight)"
                  stroke={selectedAccent}
                  strokeOpacity={0.34}
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0.08 : 0.16 }}
                />
              ) : null}

              <motion.g
                style={{
                  transformOrigin: `${anchorPosition.x}px ${anchorPosition.y}px`,
                }}
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.985 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
              >
                {layout.sectors.map((sector, index) => {
                  const boundary = createConstellationBoundary(
                    anchorPosition,
                    sector.startAngle,
                    layout.safeBounds,
                    index,
                    contourBend,
                  );
                  const highlighted = isConstellationBoundaryHighlighted(
                    index,
                    selectedSectorIndex,
                    layout.sectors.length,
                  );

                  return (
                    <motion.path
                      key={sector.id}
                      data-testid="radial-menu-contour"
                      data-boundary-index={index}
                      data-highlighted={highlighted ? 'true' : 'false'}
                      d={boundary.path}
                      fill="none"
                      stroke={
                        highlighted
                          ? `color-mix(in srgb, ${selectedAccent} 58%, transparent)`
                          : 'hsl(var(--foreground) / 0.16)'
                      }
                      strokeWidth={highlighted ? 1.5 : 1}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={
                        reducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, pathLength: 0 }
                      }
                      animate={{ opacity: 1, pathLength: 1 }}
                      transition={{
                        duration: reducedMotion ? 0.08 : 0.24,
                        delay: reducedMotion ? 0 : index * 0.018,
                      }}
                    />
                  );
                })}
              </motion.g>

              {showGesture && dragPosition ? (
                <g data-testid="radial-menu-gesture">
                  <motion.line
                    data-testid="radial-menu-gesture-glow"
                    x1={anchorPosition.x}
                    y1={anchorPosition.y}
                    x2={dragPosition.x}
                    y2={dragPosition.y}
                    stroke={selectedAccent}
                    strokeOpacity={0.22}
                    strokeWidth={11}
                    strokeLinecap="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.14 }}
                  />
                  <motion.line
                    data-testid="radial-menu-gesture-core"
                    x1={anchorPosition.x}
                    y1={anchorPosition.y}
                    x2={dragPosition.x}
                    y2={dragPosition.y}
                    stroke="url(#radial-menu-constellation-trail)"
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.14 }}
                  />
                  <motion.circle
                    cx={dragPosition.x}
                    cy={dragPosition.y}
                    r={13}
                    fill={selectedAccent}
                    fillOpacity={0.12}
                    initial={{
                      opacity: 0,
                      scale: reducedMotion ? 1 : 0.72,
                    }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.14 }}
                  />
                  <motion.circle
                    data-testid="radial-menu-gesture-pointer"
                    cx={dragPosition.x}
                    cy={dragPosition.y}
                    r={8}
                    fill="hsl(var(--foreground))"
                    stroke={selectedAccent}
                    strokeWidth={3}
                    initial={{
                      opacity: 0,
                      scale: reducedMotion ? 1 : 0.72,
                    }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.14 }}
                  />
                </g>
              ) : null}
            </motion.svg>

            {layout.sectors.map((sector, index) => (
              <SectorNode
                key={sector.id}
                sector={sector}
                accentColor={getConstellationAccent(
                  index,
                  sector.id === CANCEL_ITEM_ID,
                )}
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
