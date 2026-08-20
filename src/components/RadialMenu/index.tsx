import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DynamicIcon } from '../DynamicIcon';
import { RadialMenuSegment } from './RadialMenuItem';

export type RadialMenuPoint = { x: number; y: number };

export interface RadialMenuBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RadialMenuItemData {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
}

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

export interface ArcConfig {
  startAngle: number;
  sweepAngle: number;
}

export interface RadialMenuSelectionRange {
  minDragDistance: number;
  maxDragDistance: number;
}

export interface RadialMenuGeometry extends RadialMenuSelectionRange {
  center: RadialMenuPoint;
  ringRadius: number;
  outerRadius: number;
  svgSize: number;
  centerControlRadius: number;
}

export type RadialMenuReleaseTarget =
  | { type: 'item'; itemId: string }
  | { type: 'default' }
  | { type: 'cancel' };

const FULL_CIRCLE_ARC: ArcConfig = { startAngle: -90, sweepAngle: 360 };
const IDEAL_RING_RADIUS = 132;
const MIN_RING_RADIUS = 72;
const LABEL_GUTTER = 40;
const GAP_ANGLE = 4;
const CENTERED_MENU_PADDING = 16;
const ABSOLUTE_DRAG_ARM_DISTANCE = 12;
const MIN_DRAG_DISTANCE = 40;
const MAX_DRAG_DISTANCE = 200;
const OUTER_RADIUS = 160;
const MENU_PADDING = 20;
const CANCEL_ITEM_ID = '__cancel__';

type RadialMenuGeometrySource = Pick<RadialMenuBounds, 'width' | 'height'> &
  Partial<Pick<RadialMenuBounds, 'left' | 'top'>>;

export function getRadialMenuGeometry(
  bounds: RadialMenuGeometrySource,
): RadialMenuGeometry {
  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const shortestSide = Math.min(width, height);
  const availableOuterRadius = Math.max(
    1,
    shortestSide / 2 - CENTERED_MENU_PADDING,
  );
  const minimumRadius = Math.min(MIN_RING_RADIUS, availableOuterRadius);
  const ringRadius = Math.min(
    IDEAL_RING_RADIUS,
    Math.max(minimumRadius, availableOuterRadius - LABEL_GUTTER),
  );
  const outerRadius = Math.max(
    ringRadius,
    Math.min(availableOuterRadius, ringRadius + LABEL_GUTTER),
  );
  const centerControlRadius = Math.max(
    29,
    Math.min(42, ringRadius * 0.31),
  );

  return {
    center: { x: left + width / 2, y: top + height / 2 },
    ringRadius,
    outerRadius,
    svgSize: outerRadius * 2,
    centerControlRadius,
    minDragDistance: ringRadius * 0.4,
    maxDragDistance: ringRadius * 1.9,
  };
}

export function projectDragPositionToCenter(
  anchorPosition: RadialMenuPoint,
  dragPosition: RadialMenuPoint | null,
  center: RadialMenuPoint,
): RadialMenuPoint | null {
  if (!dragPosition) return null;
  return {
    x: center.x + dragPosition.x - anchorPosition.x,
    y: center.y + dragPosition.y - anchorPosition.y,
  };
}

export function isRadialMenuDragArmed(
  anchorPosition: RadialMenuPoint,
  dragPosition: RadialMenuPoint | null,
  minimumDistance: number = ABSOLUTE_DRAG_ARM_DISTANCE,
): boolean {
  if (!dragPosition) return false;
  return (
    Math.hypot(
      dragPosition.x - anchorPosition.x,
      dragPosition.y - anchorPosition.y,
    ) >= minimumDistance
  );
}

export function findHoveredItem(
  items: RadialMenuItemData[],
  center: RadialMenuPoint,
  dragPos: RadialMenuPoint | null,
  arcConfig: ArcConfig = FULL_CIRCLE_ARC,
  selectionRange: RadialMenuSelectionRange = {
    minDragDistance: MIN_DRAG_DISTANCE,
    maxDragDistance: MAX_DRAG_DISTANCE,
  },
): string | null {
  if (!dragPos || items.length === 0) return null;

  const dx = dragPos.x - center.x;
  const dy = dragPos.y - center.y;
  const distance = Math.hypot(dx, dy);

  if (
    distance < selectionRange.minDragDistance ||
    distance > selectionRange.maxDragDistance
  ) {
    return null;
  }

  const angleDegrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  const { startAngle, sweepAngle } = arcConfig;
  const endAngle = startAngle + sweepAngle;
  let normalizedDragAngle = angleDegrees;

  while (normalizedDragAngle < startAngle) normalizedDragAngle += 360;
  while (normalizedDragAngle >= startAngle + 360) normalizedDragAngle -= 360;
  if (normalizedDragAngle > endAngle) return null;

  const segmentSize = sweepAngle / items.length;
  const segmentIndex = Math.floor(
    (normalizedDragAngle - startAngle) / segmentSize,
  );
  return items[Math.min(segmentIndex, items.length - 1)].id;
}

export function resolveRadialMenuReleaseTarget(
  items: RadialMenuItemData[],
  geometry: RadialMenuGeometry,
  anchorPosition: RadialMenuPoint,
  releasePosition: RadialMenuPoint | null,
): RadialMenuReleaseTarget {
  if (!isRadialMenuDragArmed(anchorPosition, releasePosition)) {
    return { type: 'cancel' };
  }
  if (!releasePosition) return { type: 'cancel' };

  const distanceFromCenter = Math.hypot(
    releasePosition.x - geometry.center.x,
    releasePosition.y - geometry.center.y,
  );
  if (distanceFromCenter <= geometry.centerControlRadius) {
    return { type: 'default' };
  }

  const itemId = findHoveredItem(
    items,
    geometry.center,
    releasePosition,
    FULL_CIRCLE_ARC,
    geometry,
  );
  return itemId ? { type: 'item', itemId } : { type: 'cancel' };
}

export function calculateAvailableArc(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  outerRadius: number,
  padding: number = 20
): ArcConfig {
  // Calculate available space as ratios relative to outerRadius
  const spaceRatio = {
    right: (viewport.width - anchor.x - padding) / outerRadius,
    left: (anchor.x - padding) / outerRadius,
    down: (viewport.height - anchor.y - padding) / outerRadius,
    up: (anchor.y - padding) / outerRadius,
  };

  // Full circle if all directions have enough space
  if (spaceRatio.right >= 1 && spaceRatio.left >= 1 &&
      spaceRatio.up >= 1 && spaceRatio.down >= 1) {
    return { startAngle: -90, sweepAngle: 360 };
  }

  // Check if a given angle (in degrees) fits within viewport
  // Convention: 0 = right, 90 = down, -90 = up, ±180 = left
  const isValidAngle = (deg: number): boolean => {
    const rad = (deg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    return (
      cosA <= spaceRatio.right &&
      cosA >= -spaceRatio.left &&
      sinA <= spaceRatio.down &&
      sinA >= -spaceRatio.up
    );
  };

  // Sample every degree from -180 to 179
  const STEP = 1;
  const SAMPLES = 360 / STEP;
  const validAngles: boolean[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    const deg = (i * STEP) - 180; // Range: -180 to 179
    validAngles.push(isValidAngle(deg));
  }

  // Find longest contiguous arc of valid angles (circular array)
  let bestStart = 0;
  let bestLength = 0;

  for (let start = 0; start < SAMPLES; start++) {
    if (!validAngles[start]) continue;

    let length = 0;
    for (let i = 0; i < SAMPLES; i++) {
      if (validAngles[(start + i) % SAMPLES]) {
        length++;
      } else {
        break;
      }
    }

    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
    }
  }

  // Convert index back to degrees (-180 to 179)
  const startAngle = (bestStart * STEP) - 180;
  // Ensure minimum sweep angle for usability
  const sweepAngle = Math.max(bestLength * STEP, 45);

  return { startAngle, sweepAngle };
}

function RingTrack({
  radius,
  reducedMotion,
}: {
  radius: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.circle
      cx={0}
      cy={0}
      r={radius}
      fill="none"
      className="stroke-border/55"
      strokeWidth={2}
      strokeDasharray="5 7"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, pathLength: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, pathLength: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? { duration: 0.12 } : { duration: 0.32, ease: 'easeOut' }}
    />
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
  const geometry = useMemo(
    () => (bounds ? getRadialMenuGeometry(bounds) : null),
    [bounds?.height, bounds?.left, bounds?.top, bounds?.width],
  );
  const itemsWithCancel = useMemo(() => {
    if (items.length === 0) return items;
    return [
      ...items,
      { id: CANCEL_ITEM_ID, icon: '×', label: 'Cancel' },
    ];
  }, [items]);
  const dragArmed = Boolean(
    anchorPosition && isRadialMenuDragArmed(anchorPosition, dragPosition),
  );
  const hoveredItemId = useMemo(() => {
    if (!geometry || !dragArmed) return null;
    return findHoveredItem(
      itemsWithCancel,
      geometry.center,
      dragPosition,
      FULL_CIRCLE_ARC,
      geometry,
    );
  }, [dragArmed, dragPosition, geometry, itemsWithCancel]);
  const segmentAngle = itemsWithCancel.length
    ? FULL_CIRCLE_ARC.sweepAngle / itemsWithCancel.length
    : 0;
  const svgCenter = geometry ? geometry.svgSize / 2 : 0;
  const centerControlSize = geometry ? geometry.centerControlRadius * 2 : 0;
  const entryOffset =
    anchorPosition && geometry
      ? {
          x: anchorPosition.x - geometry.center.x,
          y: anchorPosition.y - geometry.center.y,
        }
      : { x: 0, y: 0 };

  return (
    <AnimatePresence>
      {isOpen &&
        anchorPosition &&
        geometry &&
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
              className="absolute inset-0 h-full w-full touch-none cursor-default border-0 bg-overlay/40 p-0 backdrop-blur-[2px]"
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

            <div className="pointer-events-none fixed inset-0">
              <motion.div
                data-testid="radial-menu-wheel"
                className="fixed isolate"
                style={{
                  left: geometry.center.x - svgCenter,
                  top: geometry.center.y - svgCenter,
                  width: geometry.svgSize,
                  height: geometry.svgSize,
                }}
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.72,
                        x: entryOffset.x,
                        y: entryOffset.y,
                      }
                }
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.9, x: 0, y: 0 }
                }
                transition={
                  reducedMotion
                    ? { duration: 0.12 }
                    : {
                        type: 'spring',
                        stiffness: 360,
                        damping: 30,
                        mass: 0.85,
                      }
                }
              >
                <svg
                  width={geometry.svgSize}
                  height={geometry.svgSize}
                  viewBox={`0 0 ${geometry.svgSize} ${geometry.svgSize}`}
                  className="overflow-visible"
                >
                  <title>{categoryPresentation.label} quick notes</title>
                  <g transform={`translate(${svgCenter}, ${svgCenter})`}>
                    <RingTrack
                      radius={geometry.ringRadius}
                      reducedMotion={reducedMotion}
                    />

                    {itemsWithCancel.map((item, index) => {
                      const startAngle =
                        FULL_CIRCLE_ARC.startAngle +
                        index * segmentAngle +
                        GAP_ANGLE / 2;
                      const endAngle =
                        FULL_CIRCLE_ARC.startAngle +
                        (index + 1) * segmentAngle -
                        GAP_ANGLE / 2;
                      return (
                        <RadialMenuSegment
                          key={item.id}
                          icon={item.icon}
                          label={item.label}
                          startAngle={startAngle}
                          endAngle={endAngle}
                          outerRadius={geometry.outerRadius}
                          ringRadius={geometry.ringRadius}
                          isHovered={item.id === hoveredItemId}
                          isCancel={item.id === CANCEL_ITEM_ID}
                          animationDelay={reducedMotion ? 0 : 0.035 * index}
                          reducedMotion={reducedMotion}
                        />
                      );
                    })}
                  </g>
                </svg>

                <motion.div
                  aria-hidden="true"
                  data-testid="radial-menu-center-icon"
                  className="absolute flex items-center justify-center rounded-full border-2 bg-card"
                  style={{
                    left: svgCenter - centerControlSize / 2,
                    top: svgCenter - centerControlSize / 2,
                    width: centerControlSize,
                    height: centerControlSize,
                    color: categoryPresentation.color,
                    borderColor: `color-mix(in srgb, ${categoryPresentation.color} 62%, hsl(var(--border)))`,
                    backgroundColor: `color-mix(in srgb, ${categoryPresentation.color} 18%, hsl(var(--card)))`,
                  }}
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.72 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: reducedMotion ? 1 : 0.86,
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0.1 }
                      : {
                          type: 'spring',
                          stiffness: 420,
                          damping: 27,
                          delay: 0.08,
                        }
                  }
                >
                  <DynamicIcon
                    name={categoryPresentation.icon}
                    style={{
                      width: centerControlSize * 0.43,
                      height: centerControlSize * 0.43,
                    }}
                  />
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        )}
    </AnimatePresence>
  );
}

export {
  ABSOLUTE_DRAG_ARM_DISTANCE,
  CANCEL_ITEM_ID,
  FULL_CIRCLE_ARC,
  MAX_DRAG_DISTANCE,
  MENU_PADDING,
  MIN_DRAG_DISTANCE,
  OUTER_RADIUS,
};
