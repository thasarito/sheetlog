import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from "../lib/icons";
import type { CategoryItem, TransactionType } from "../lib/types";
import { DynamicIcon } from "./DynamicIcon";

const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

interface CategoryGridProps {
  categories: CategoryItem[];
  onSelect: (category: string) => void;
  onLongPress?: (category: string, position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onRelease?: (position: { x: number; y: number }) => void;
  transactionType?: TransactionType;
}

function resolveCategoryIcon(
  category: CategoryItem,
  type: TransactionType = "expense"
): string {
  return (
    category.icon ||
    SUGGESTED_CATEGORY_ICONS[category.name] ||
    DEFAULT_CATEGORY_ICONS[type]
  );
}

function resolveCategoryColor(
  category: CategoryItem,
  type: TransactionType = "expense"
): string {
  return (
    category.color ||
    SUGGESTED_CATEGORY_COLORS[category.name] ||
    DEFAULT_CATEGORY_COLORS[type]
  );
}

const LONG_PRESS_THRESHOLD = 400;
const MOVEMENT_TOLERANCE = 10;

function triggerHaptic() {
  if ("vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

interface CategoryButtonProps {
  category: CategoryItem;
  transactionType: TransactionType;
  onSelect: (category: string) => void;
  onLongPress?: (category: string, position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onRelease?: (position: { x: number; y: number }) => void;
}

function CategoryButton({
  category,
  transactionType,
  onSelect,
  onLongPress,
  onDrag,
  onRelease,
}: CategoryButtonProps) {
  const icon = resolveCategoryIcon(category, transactionType);
  const color = resolveCategoryColor(category, transactionType);
  const displayColor = `color-mix(in srgb, ${color} 30%, hsl(var(--foreground)))`;

  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const wasLongPressRef = useRef(false); // Track if release was from long press
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!onLongPress) return;

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const position = { x: event.clientX, y: event.clientY };
    startPosRef.current = position;
    isLongPressRef.current = false;

    timerRef.current = setTimeout(() => {
      if (!startPosRef.current) return;
      isLongPressRef.current = true;
      if (!target.hasPointerCapture(pointerId)) {
        target.setPointerCapture(pointerId);
      }
      triggerHaptic();
      onLongPress(category.name, position);
    }, LONG_PRESS_THRESHOLD);
  };

  const releasePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const position = { x: e.clientX, y: e.clientY };

    if (isLongPressRef.current) {
      onDrag?.(position);
    } else if (startPosRef.current) {
      const dx = position.x - startPosRef.current.x;
      const dy = position.y - startPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > MOVEMENT_TOLERANCE) {
        clearTimer();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(e);
    clearTimer();
    const position = { x: e.clientX, y: e.clientY };

    if (isLongPressRef.current) {
      onRelease?.(position);
      wasLongPressRef.current = true; // Mark that this was a long press release
    }

    isLongPressRef.current = false;
    startPosRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(e);
    clearTimer();
    isLongPressRef.current = false;
    startPosRef.current = null;
  };

  const handleClick = () => {
    // Skip if this click is from a long press release
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    onSelect(category.name);
  };

  return (
    <button
      type="button"
      className="grid aspect-square min-w-0 grid-rows-2 overflow-hidden rounded-2xl border border-transparent bg-surface-2 p-0 text-center transition [touch-action:pan-x_pan-y] select-none hover:border-primary/50 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={(event) => {
        setIsHovered(false);
        handlePointerCancel(event);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <motion.span
        className="flex h-full w-full items-center justify-center"
        animate={{ scale: isHovered ? 1.08 : 1 }}
        transition={springTransition}
      >
        <DynamicIcon
          name={icon}
          className="h-4 w-4 min-[360px]:h-5 min-[360px]:w-5"
          style={{ color: displayColor }}
        />
      </motion.span>
      <span className="flex h-full w-full min-w-0 items-center justify-center break-words px-1.5 text-[9px] font-semibold leading-[1.15] text-foreground min-[360px]:text-[10px]">
        {category.name}
      </span>
    </button>
  );
}

export function CategoryGrid({
  categories,
  onSelect,
  onLongPress,
  onDrag,
  onRelease,
  transactionType = "expense",
}: CategoryGridProps) {
  return (
    <div data-testid="category-grid" className="grid grid-cols-4 gap-2">
      {categories.map((category) => (
        <CategoryButton
          key={category.name}
          category={category}
          transactionType={transactionType}
          onSelect={onSelect}
          onLongPress={onLongPress}
          onDrag={onDrag}
          onRelease={onRelease}
        />
      ))}
    </div>
  );
}
