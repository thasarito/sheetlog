import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { RadialMenuSegment } from './RadialMenuItem';

export interface RadialMenuItemData {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
}

export interface RadialMenuProps {
  items: RadialMenuItemData[];
  anchorPosition: { x: number; y: number };
  dragPosition: { x: number; y: number } | null;
  isOpen: boolean;
  onSelectItem: (id: string) => void;
  onCancel: () => void;
}

export interface ArcConfig {
  startAngle: number; // Start angle in degrees (where -90 = top)
  sweepAngle: number; // Total arc span in degrees
}

// ===== Interaction Thresholds =====
const MIN_DRAG_DISTANCE = 40; // Minimum distance from center to start selecting
const MAX_DRAG_DISTANCE = 200; // Maximum distance - beyond this, nothing is selected

// ===== Layout Dimensions =====
const RING_RADIUS = 100; // Radius of the ring where nodes sit
const OUTER_RADIUS = 160; // Extended to accommodate labels
const GAP_ANGLE = 4; // Gap between segments in degrees
const SVG_SIZE = OUTER_RADIUS * 2 + 80; // Extra space for labels
const MENU_PADDING = 20; // Padding from viewport edges

// ===== Special IDs =====
const CANCEL_ITEM_ID = '__cancel__';

/**
 * Find which item the drag position selects based on angular sector.
 * Supports partial arcs via arcConfig parameter.
 */
export function findHoveredItem(
  items: RadialMenuItemData[],
  center: { x: number; y: number },
  dragPos: { x: number; y: number } | null,
  arcConfig: ArcConfig = { startAngle: -90, sweepAngle: 360 },
): string | null {
  if (!dragPos || items.length === 0) return null;

  const dx = dragPos.x - center.x;
  const dy = dragPos.y - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < MIN_DRAG_DISTANCE || dist > MAX_DRAG_DISTANCE) return null;

  // Calculate angle in degrees (0 = right, counterclockwise positive in math convention)
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Check if angle is within the available arc
  const { startAngle, sweepAngle } = arcConfig;
  const endAngle = startAngle + sweepAngle;

  // Normalize drag angle to compare with arc range
  let normalizedDragAngle = angleDeg;
  // Adjust to be relative to startAngle
  while (normalizedDragAngle < startAngle) normalizedDragAngle += 360;
  while (normalizedDragAngle >= startAngle + 360) normalizedDragAngle -= 360;

  if (normalizedDragAngle > endAngle) return null; // Outside arc

  // Calculate which segment within the arc
  const segmentSize = sweepAngle / items.length;
  const angleWithinArc = normalizedDragAngle - startAngle;
  const segmentIndex = Math.floor(angleWithinArc / segmentSize);

  return items[Math.min(segmentIndex, items.length - 1)].id;
}

/**
 * Calculate the available arc that fits within the viewport.
 * Uses fine-grained angle sampling (1°) to maximize the usable arc.
 * Returns start angle and sweep angle for rendering partial arcs.
 */
export function calculateAvailableArc(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  outerRadius: number,
  padding: number = 20,
): ArcConfig {
  // Calculate available space as ratios relative to outerRadius
  const spaceRatio = {
    right: (viewport.width - anchor.x - padding) / outerRadius,
    left: (anchor.x - padding) / outerRadius,
    down: (viewport.height - anchor.y - padding) / outerRadius,
    up: (anchor.y - padding) / outerRadius,
  };

  // Full circle if all directions have enough space
  if (spaceRatio.right >= 1 && spaceRatio.left >= 1 && spaceRatio.up >= 1 && spaceRatio.down >= 1) {
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
    const deg = i * STEP - 180; // Range: -180 to 179
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
  const startAngle = bestStart * STEP - 180;
  // Ensure minimum sweep angle for usability
  const sweepAngle = Math.max(bestLength * STEP, 45);

  return { startAngle, sweepAngle };
}

// Ring track component
function RingTrack() {
  return (
    <circle
      cx={0}
      cy={0}
      r={RING_RADIUS}
      fill="none"
      className="stroke-border/40"
      strokeWidth={2}
      strokeDasharray="4 4"
    />
  );
}

export function RadialMenu({
  items,
  anchorPosition,
  dragPosition,
  isOpen,
  onSelectItem,
  onCancel,
}: RadialMenuProps) {
  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 812,
  };

  // Add cancel item when there are items to display
  const itemsWithCancel = useMemo(() => {
    if (items.length === 0) return items;
    const cancelItem: RadialMenuItemData = {
      id: CANCEL_ITEM_ID,
      icon: '\\',
      label: 'Cancel',
    };
    return [...items, cancelItem];
  }, [items]);

  const arcConfig = useMemo(
    () => calculateAvailableArc(anchorPosition, viewport, OUTER_RADIUS, MENU_PADDING),
    [anchorPosition, viewport.width, viewport.height],
  );

  const hoveredItemId = useMemo(
    () => findHoveredItem(itemsWithCancel, anchorPosition, dragPosition, arcConfig),
    [itemsWithCancel, anchorPosition, dragPosition, arcConfig],
  );

  const segmentAngle = arcConfig.sweepAngle / itemsWithCancel.length;
  const center = SVG_SIZE / 2;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-overlay/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onPointerDown={(e) => {
              e.preventDefault();
              onCancel();
            }}
          />

          {/* Tool Wheel */}
          <div className="fixed inset-0 z-50 pointer-events-none">
            <motion.div
              style={{
                position: 'absolute',
                left: anchorPosition.x - center,
                top: anchorPosition.y - center,
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <svg
                width={SVG_SIZE}
                height={SVG_SIZE}
                viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
                style={{ overflow: 'visible' }}
              >
                {/* Center the wheel elements */}
                <g transform={`translate(${center}, ${center})`}>
                  {/* Ring track (dashed circle) */}
                  <RingTrack />

                  {/* Menu segments with nodes */}
                  {itemsWithCancel.map((item, index) => {
                    const startAngle = arcConfig.startAngle + index * segmentAngle + GAP_ANGLE / 2;
                    const endAngle =
                      arcConfig.startAngle + (index + 1) * segmentAngle - GAP_ANGLE / 2;
                    return (
                      <RadialMenuSegment
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        shortcut={item.shortcut}
                        startAngle={startAngle}
                        endAngle={endAngle}
                        innerRadius={50}
                        outerRadius={RING_RADIUS + 30}
                        ringRadius={RING_RADIUS}
                        isHovered={item.id === hoveredItemId}
                        isCancel={item.id === CANCEL_ITEM_ID}
                      />
                    );
                  })}
                </g>
              </svg>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export { MIN_DRAG_DISTANCE, MAX_DRAG_DISTANCE, CANCEL_ITEM_ID, OUTER_RADIUS, MENU_PADDING };
