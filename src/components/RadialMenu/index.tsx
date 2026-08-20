import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DynamicIcon } from '../DynamicIcon';
import { RadialMenuSegment } from './RadialMenuItem';

export type RadialMenuPoint = { x: number; y: number };

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
}

const FULL_CIRCLE_ARC: ArcConfig = { startAngle: -90, sweepAngle: 360 };
const IDEAL_RING_RADIUS = 132;
const MIN_RING_RADIUS = 72;
const LABEL_GUTTER = 40;
const GAP_ANGLE = 4;
const MENU_PADDING = 16;
const OUTER_RADIUS = IDEAL_RING_RADIUS + LABEL_GUTTER;
const MIN_DRAG_DISTANCE = IDEAL_RING_RADIUS * 0.4;
const MAX_DRAG_DISTANCE = IDEAL_RING_RADIUS * 1.9;
const CANCEL_ITEM_ID = '__cancel__';

function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 375, height: 812 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function useViewportSize() {
  const [viewport, setViewport] = useState(getViewportSize);

  useEffect(() => {
    const updateViewport = () => setViewport(getViewportSize());
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  return viewport;
}

export function getRadialMenuGeometry(viewport: {
  width: number;
  height: number;
}): RadialMenuGeometry {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const shortestSide = Math.min(width, height);
  const availableOuterRadius = Math.max(1, shortestSide / 2 - MENU_PADDING);
  const minimumRadius = Math.min(MIN_RING_RADIUS, availableOuterRadius);
  const ringRadius = Math.min(
    IDEAL_RING_RADIUS,
    Math.max(minimumRadius, availableOuterRadius - LABEL_GUTTER),
  );
  const outerRadius = Math.max(
    ringRadius,
    Math.min(availableOuterRadius, ringRadius + LABEL_GUTTER),
  );

  return {
    center: { x: width / 2, y: height / 2 },
    ringRadius,
    outerRadius,
    svgSize: outerRadius * 2,
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
  const segmentIndex = Math.floor((normalizedDragAngle - startAngle) / segmentSize);
  return items[Math.min(segmentIndex, items.length - 1)].id;
}

export function calculateAvailableArc(
  anchor: RadialMenuPoint,
  viewport: { width: number; height: number },
  outerRadius: number,
  padding: number = MENU_PADDING,
): ArcConfig {
  const spaceRatio = {
    right: (viewport.width - anchor.x - padding) / outerRadius,
    left: (anchor.x - padding) / outerRadius,
    down: (viewport.height - anchor.y - padding) / outerRadius,
    up: (anchor.y - padding) / outerRadius,
  };

  if (
    spaceRatio.right >= 1 &&
    spaceRatio.left >= 1 &&
    spaceRatio.up >= 1 &&
    spaceRatio.down >= 1
  ) {
    return FULL_CIRCLE_ARC;
  }

  const isValidAngle = (degrees: number): boolean => {
    const radians = (degrees * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return (
      cosine <= spaceRatio.right &&
      cosine >= -spaceRatio.left &&
      sine <= spaceRatio.down &&
      sine >= -spaceRatio.up
    );
  };

  const validAngles = Array.from({ length: 360 }, (_, index) =>
    isValidAngle(index - 180),
  );
  let bestStart = 0;
  let bestLength = 0;

  for (let start = 0; start < validAngles.length; start += 1) {
    if (!validAngles[start]) continue;
    let length = 0;
    for (let offset = 0; offset < validAngles.length; offset += 1) {
      if (!validAngles[(start + offset) % validAngles.length]) break;
      length += 1;
    }
    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
    }
  }

  return {
    startAngle: bestStart - 180,
    sweepAngle: Math.max(bestLength, 45),
  };
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
  categoryPresentation,
  isOpen,
  onCancel,
}: RadialMenuProps) {
  const viewport = useViewportSize();
  const reducedMotion = useReducedMotion() ?? false;
  const geometry = useMemo(
    () => getRadialMenuGeometry(viewport),
    [viewport.height, viewport.width],
  );
  const itemsWithCancel = useMemo(() => {
    if (items.length === 0) return items;
    return [
      ...items,
      { id: CANCEL_ITEM_ID, icon: '×', label: 'Cancel' },
    ];
  }, [items]);
  const projectedDragPosition = useMemo(
    () =>
      anchorPosition
        ? projectDragPositionToCenter(
            anchorPosition,
            dragPosition,
            geometry.center,
          )
        : null,
    [anchorPosition, dragPosition, geometry.center],
  );
  const hoveredItemId = useMemo(
    () =>
      findHoveredItem(
        itemsWithCancel,
        geometry.center,
        projectedDragPosition,
        FULL_CIRCLE_ARC,
        geometry,
      ),
    [geometry, itemsWithCancel, projectedDragPosition],
  );
  const segmentAngle = itemsWithCancel.length
    ? FULL_CIRCLE_ARC.sweepAngle / itemsWithCancel.length
    : 0;
  const svgCenter = geometry.svgSize / 2;
  const centerControlSize = Math.max(58, Math.min(84, geometry.ringRadius * 0.62));
  const entryOffset = anchorPosition
    ? {
        x: anchorPosition.x - geometry.center.x,
        y: anchorPosition.y - geometry.center.y,
      }
    : { x: 0, y: 0 };

  return (
    <AnimatePresence>
      {isOpen &&
        anchorPosition &&
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
              className="absolute inset-0 h-full w-full cursor-default border-0 bg-overlay/40 p-0 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.1 : 0.18 }}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                event.preventDefault();
                onCancel();
              }}
            />

            <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
              <motion.div
                role="menu"
                aria-label={`${categoryPresentation.label} quick notes`}
                data-testid="radial-menu-wheel"
                className="relative isolate"
                style={{ width: geometry.svgSize, height: geometry.svgSize }}
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
                  aria-label={categoryPresentation.label}
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
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.86 }}
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
  CANCEL_ITEM_ID,
  FULL_CIRCLE_ARC,
  MAX_DRAG_DISTANCE,
  MENU_PADDING,
  MIN_DRAG_DISTANCE,
  OUTER_RADIUS,
};
