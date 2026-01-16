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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onLongPress) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const position = { x: e.clientX, y: e.clientY };
    startPosRef.current = position;
    isLongPressRef.current = false;

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      triggerHaptic();
      onLongPress(category.name, position);
    }, LONG_PRESS_THRESHOLD);
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

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    clearTimer();
    const position = { x: e.clientX, y: e.clientY };

    if (isLongPressRef.current) {
      onRelease?.(position);
      wasLongPressRef.current = true; // Mark that this was a long press release
    }

    isLongPressRef.current = false;
    startPosRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
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
      className="flex flex-col items-center rounded-2xl px-2 py-3 text-center transition touch-none select-none"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={(e) => {
        setIsHovered(false);
        handlePointerCancel(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <motion.span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
          isHovered ? "border-primary ring-2 ring-primary/20" : "border-border"
        }`}
        style={{ backgroundColor: `${color}20` }}
        animate={{ scale: isHovered ? 1.05 : 1 }}
        transition={springTransition}
      >
        <DynamicIcon name={icon} className="h-5 w-5" style={{ color }} />
      </motion.span>
      <motion.span
        className="mt-2 text-[11px] font-semibold leading-snug"
        animate={{ color: isHovered ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
        transition={springTransition}
      >
        {category.name}
      </motion.span>
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
    <div className="grid grid-cols-4 gap-3">
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
