import { useState, useRef, useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import { animated, useSpring } from "@react-spring/web";
import { Trash2 } from "lucide-react";

type SwipeableListItemProps = {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
};

const DELETE_REVEAL_THRESHOLD = -80;
const FULL_SWIPE_THRESHOLD = -150;

export function SwipeableListItem({
  children,
  onDelete,
  disabled = false,
}: SwipeableListItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const isMountedRef = useRef(true);

  // Track mounted state to prevent memory leaks
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [{ x }, api] = useSpring(() => ({
    x: 0,
    config: { tension: 300, friction: 30 },
  }));

  // Safe delete handler that checks mounted state
  function safeDelete() {
    if (isMountedRef.current) {
      onDelete();
    }
  }

  const bind = useDrag(
    ({ down, movement: [mx], cancel }) => {
      if (disabled || isDeleting) {
        cancel?.();
        return;
      }

      // Only allow left swipe (negative x)
      const clampedX = Math.min(0, mx);

      if (down) {
        api.start({ x: clampedX, immediate: true });
      } else {
        // Released
        if (clampedX < FULL_SWIPE_THRESHOLD) {
          // Full swipe - trigger delete
          api.start({ x: -300 });
          setIsDeleting(true);
          triggerHaptic();
          setTimeout(safeDelete, 200);
        } else if (clampedX < DELETE_REVEAL_THRESHOLD) {
          // Partial swipe - snap to reveal delete button
          api.start({ x: DELETE_REVEAL_THRESHOLD });
          triggerHaptic();
        } else {
          // Not enough - snap back
          api.start({ x: 0 });
        }
      }
    },
    {
      axis: "x",
      from: () => [x.get(), 0],
      filterTaps: true,
    }
  );

  function triggerHaptic() {
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  }

  function handleDeleteClick() {
    if (disabled || isDeleting) return;
    api.start({ x: -300 });
    setIsDeleting(true);
    triggerHaptic();
    setTimeout(safeDelete, 200);
  }

  function handleContentClick() {
    // If swiped open, close it on tap
    if (x.get() < 0) {
      api.start({ x: 0 });
    }
  }

  return (
    <div className="relative overflow-hidden">
      {/* Delete button (behind) */}
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={disabled || isDeleting}
          className="flex h-full w-20 items-center justify-center bg-danger text-white transition-opacity disabled:opacity-50"
          aria-label="Delete"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Swipeable content (front) */}
      <animated.div
        {...bind()}
        onClick={handleContentClick}
        style={{
          x,
          touchAction: "pan-y",
        }}
        className={`relative bg-card ${isDeleting ? "opacity-50" : ""}`}
      >
        {children}
      </animated.div>
    </div>
  );
}
