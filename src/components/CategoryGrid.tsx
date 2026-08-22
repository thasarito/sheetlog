import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from "../lib/icons";
import { triggerHapticFeedback } from "../lib/transactionHaptics";
import type { CategoryItem, TransactionType } from "../lib/types";
import { DynamicIcon } from "./DynamicIcon";

const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

interface CategoryGridProps {
  categories: CategoryItem[];
  onSelect: (category: string) => void;
  onLongPress?: (category: string, position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onRelease?: (position: { x: number; y: number }) => void;
  onCancel?: () => void;
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
const LONG_PRESS_CLICK_SUPPRESSION_MS = 1000;

type GesturePosition = { x: number; y: number };
type GestureOwner = "touch" | "pointer" | null;
type GestureOutcome = "release" | "cancel" | "abandon";

function findTouch(touches: TouchList, identifier: number): Touch | undefined {
  return Array.from(touches).find((item) => item.identifier === identifier);
}

function touchPosition(touch: Touch): GesturePosition {
  return { x: touch.clientX, y: touch.clientY };
}

interface CategoryButtonProps {
  category: CategoryItem;
  transactionType: TransactionType;
  onSelect: (category: string) => void;
  onLongPress?: (category: string, position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onRelease?: (position: { x: number; y: number }) => void;
  onCancel?: () => void;
}

function CategoryButton({
  category,
  transactionType,
  onSelect,
  onLongPress,
  onDrag,
  onRelease,
  onCancel,
}: CategoryButtonProps) {
  const icon = resolveCategoryIcon(category, transactionType);
  const color = resolveCategoryColor(category, transactionType);
  const displayColor = `color-mix(in srgb, ${color} 30%, hsl(var(--foreground)))`;

  const [isHovered, setIsHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hapticSwitchRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const wasLongPressRef = useRef(false);
  const isCancelledTouchRef = useRef(false);
  const startPosRef = useRef<GesturePosition | null>(null);
  const ownerRef = useRef<GestureOwner>(null);
  const touchIdentifierRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const removeTouchListenersRef = useRef<(() => void) | null>(null);
  const latestRef = useRef({
    categoryName: category.name,
    onLongPress,
    onDrag,
    onRelease,
    onCancel,
  });
  latestRef.current = {
    categoryName: category.name,
    onLongPress,
    onDrag,
    onRelease,
    onCancel,
  };

  const setHapticSwitch = useCallback((element: HTMLInputElement | null) => {
    hapticSwitchRef.current = element;
    element?.setAttribute("switch", "");
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearClickResetTimer = useCallback(() => {
    if (clickResetTimerRef.current) {
      clearTimeout(clickResetTimerRef.current);
      clickResetTimerRef.current = null;
    }
  }, []);

  const removeTouchListeners = useCallback(() => {
    const remove = removeTouchListenersRef.current;
    removeTouchListenersRef.current = null;
    remove?.();
  }, []);

  const scheduleClickReset = useCallback(() => {
    clearClickResetTimer();
    clickResetTimerRef.current = setTimeout(() => {
      wasLongPressRef.current = false;
      clickResetTimerRef.current = null;
    }, LONG_PRESS_CLICK_SUPPRESSION_MS);
  }, [clearClickResetTimer]);

  const finishGesture = useCallback(
    (outcome: GestureOutcome, position?: GesturePosition) => {
      const wasActive = isLongPressRef.current;
      const { onRelease: release, onCancel: cancel } = latestRef.current;

      clearTimer();
      removeTouchListeners();
      isLongPressRef.current = false;
      isCancelledTouchRef.current = false;
      startPosRef.current = null;
      ownerRef.current = null;
      touchIdentifierRef.current = null;
      pointerIdRef.current = null;

      if (!wasActive) return;

      scheduleClickReset();
      if (outcome === "release" && position) {
        release?.(position);
      } else if (outcome === "cancel") {
        cancel?.();
      }
    },
    [clearTimer, removeTouchListeners, scheduleClickReset],
  );

  const cancelTouchUntilTerminal = useCallback(() => {
    const wasActive = isLongPressRef.current;
    clearTimer();
    isLongPressRef.current = false;
    startPosRef.current = null;
    pointerIdRef.current = null;

    if (!isCancelledTouchRef.current && wasActive) {
      latestRef.current.onCancel?.();
    }
    isCancelledTouchRef.current = true;
    return wasLongPressRef.current;
  }, [clearTimer]);

  const beginLongPress = useCallback(
    (
      owner: Exclude<GestureOwner, null>,
      position: GesturePosition,
      pointerTarget?: HTMLElement,
      pointerId?: number,
    ) => {
      clearTimer();
      clearClickResetTimer();
      wasLongPressRef.current = false;
      isLongPressRef.current = false;
      isCancelledTouchRef.current = false;
      ownerRef.current = owner;
      startPosRef.current = position;
      pointerIdRef.current = pointerId ?? null;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (ownerRef.current !== owner || !startPosRef.current) return;

        const { categoryName, onLongPress: activate } = latestRef.current;
        if (!activate) {
          finishGesture("abandon");
          return;
        }

        isLongPressRef.current = true;
        wasLongPressRef.current = true;
        if (
          owner === "pointer" &&
          pointerTarget &&
          pointerId !== undefined &&
          typeof pointerTarget.hasPointerCapture === "function" &&
          typeof pointerTarget.setPointerCapture === "function" &&
          !pointerTarget.hasPointerCapture(pointerId)
        ) {
          pointerTarget.setPointerCapture(pointerId);
        }
        triggerHapticFeedback("impact");
        activate(categoryName, position);
      }, LONG_PRESS_THRESHOLD);
    },
    [clearClickResetTimer, clearTimer, finishGesture],
  );

  useEffect(() => {
    const button = buttonRef.current;
    const hapticSwitch = hapticSwitchRef.current;
    if (!button || !hapticSwitch) return;
    const touchTargets: HTMLElement[] = [button, hapticSwitch];

    const handleTouchStart = (event: TouchEvent) => {
      if (!latestRef.current.onLongPress) return;
      if (event.touches.length !== 1 || event.changedTouches.length !== 1) {
        if (ownerRef.current === "touch") {
          cancelTouchUntilTerminal();
        }
        return;
      }
      if (ownerRef.current !== null) return;

      const initiatingTouch = event.changedTouches[0];
      const identifier = initiatingTouch.identifier;
      const position = touchPosition(initiatingTouch);
      touchIdentifierRef.current = identifier;

      const finishUnexpectedTouch = () => {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
      };

      const finishCancelledTouch = (terminalEvent: TouchEvent) => {
        const shouldSuppressClick = wasLongPressRef.current;
        if (shouldSuppressClick && terminalEvent.cancelable) {
          terminalEvent.preventDefault();
        }
        finishGesture("abandon");
        if (shouldSuppressClick) scheduleClickReset();
      };

      const handleDocumentTouchStart = (touchEvent: TouchEvent) => {
        const activeIdentifier = touchIdentifierRef.current;
        if (ownerRef.current !== "touch" || activeIdentifier === null) return;
        const ownedTouch = findTouch(touchEvent.touches, activeIdentifier);
        const changedOwnedTouch = findTouch(
          touchEvent.changedTouches,
          activeIdentifier,
        );
        if (!ownedTouch) {
          finishUnexpectedTouch();
          return;
        }
        if (touchEvent.touches.length !== 1 || !changedOwnedTouch) {
          const shouldSuppressClick = cancelTouchUntilTerminal();
          if (shouldSuppressClick) touchEvent.preventDefault();
        }
      };

      const handleDocumentTouchMove = (touchEvent: TouchEvent) => {
        const activeIdentifier = touchIdentifierRef.current;
        if (ownerRef.current !== "touch" || activeIdentifier === null) return;
        const ownedTouch = findTouch(touchEvent.touches, activeIdentifier);
        if (!ownedTouch) {
          if (isCancelledTouchRef.current) {
            finishCancelledTouch(touchEvent);
          } else {
            finishUnexpectedTouch();
          }
          return;
        }

        const currentPosition = touchPosition(ownedTouch);
        if (isCancelledTouchRef.current) {
          if (wasLongPressRef.current) touchEvent.preventDefault();
          return;
        }
        if (isLongPressRef.current) {
          touchEvent.preventDefault();
          latestRef.current.onDrag?.(currentPosition);
          return;
        }

        const startPosition = startPosRef.current;
        if (
          startPosition &&
          Math.hypot(
            currentPosition.x - startPosition.x,
            currentPosition.y - startPosition.y,
          ) > MOVEMENT_TOLERANCE
        ) {
          finishGesture("abandon");
        }
      };

      const handleDocumentTouchEnd = (touchEvent: TouchEvent) => {
        const activeIdentifier = touchIdentifierRef.current;
        if (ownerRef.current !== "touch" || activeIdentifier === null) return;
        const endedTouch = findTouch(
          touchEvent.changedTouches,
          activeIdentifier,
        );
        if (isCancelledTouchRef.current) {
          if (endedTouch) finishCancelledTouch(touchEvent);
          return;
        }
        if (!endedTouch) {
          finishUnexpectedTouch();
          return;
        }
        if (isLongPressRef.current && touchEvent.cancelable) {
          touchEvent.preventDefault();
        }
        finishGesture("release", touchPosition(endedTouch));
      };

      const handleDocumentTouchCancel = (touchEvent: TouchEvent) => {
        const activeIdentifier = touchIdentifierRef.current;
        if (ownerRef.current !== "touch" || activeIdentifier === null) return;
        const cancelledTouch = findTouch(
          touchEvent.changedTouches,
          activeIdentifier,
        );
        if (isCancelledTouchRef.current) {
          if (
            cancelledTouch ||
            !findTouch(touchEvent.touches, activeIdentifier)
          ) {
            finishCancelledTouch(touchEvent);
          }
          return;
        }
        if (
          cancelledTouch ||
          !findTouch(touchEvent.touches, activeIdentifier)
        ) {
          finishUnexpectedTouch();
        }
      };

      document.addEventListener("touchstart", handleDocumentTouchStart, {
        passive: false,
      });
      document.addEventListener("touchmove", handleDocumentTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleDocumentTouchEnd, {
        passive: false,
      });
      document.addEventListener("touchcancel", handleDocumentTouchCancel, {
        passive: true,
      });
      removeTouchListenersRef.current = () => {
        document.removeEventListener("touchstart", handleDocumentTouchStart);
        document.removeEventListener("touchmove", handleDocumentTouchMove);
        document.removeEventListener("touchend", handleDocumentTouchEnd);
        document.removeEventListener(
          "touchcancel",
          handleDocumentTouchCancel,
        );
      };

      beginLongPress("touch", position);
    };

    for (const target of touchTargets) {
      target.addEventListener("touchstart", handleTouchStart, { passive: true });
    }
    return () => {
      for (const target of touchTargets) {
        target.removeEventListener("touchstart", handleTouchStart);
      }

      const wasActive = isLongPressRef.current;
      const cancel = latestRef.current.onCancel;
      const pointerId = pointerIdRef.current;
      if (pointerId !== null) {
        for (const target of touchTargets) {
          if (
            typeof target.hasPointerCapture === "function" &&
            typeof target.releasePointerCapture === "function" &&
            target.hasPointerCapture(pointerId)
          ) {
            target.releasePointerCapture(pointerId);
          }
        }
      }

      clearTimer();
      clearClickResetTimer();
      removeTouchListeners();
      isLongPressRef.current = false;
      wasLongPressRef.current = false;
      isCancelledTouchRef.current = false;
      startPosRef.current = null;
      ownerRef.current = null;
      touchIdentifierRef.current = null;
      pointerIdRef.current = null;

      if (wasActive) cancel?.();
    };
  }, [
    beginLongPress,
    cancelTouchUntilTerminal,
    clearClickResetTimer,
    clearTimer,
    finishGesture,
    removeTouchListeners,
    scheduleClickReset,
  ]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (
      event.pointerType === "touch" ||
      !latestRef.current.onLongPress ||
      ownerRef.current !== null
    ) {
      return;
    }

    const position = { x: event.clientX, y: event.clientY };
    beginLongPress(
      "pointer",
      position,
      event.currentTarget,
      event.pointerId,
    );
  };

  const releasePointer = (event: React.PointerEvent<HTMLElement>) => {
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      typeof event.currentTarget.releasePointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (
      event.pointerType === "touch" ||
      ownerRef.current !== "pointer" ||
      pointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    const position = { x: event.clientX, y: event.clientY };

    if (isLongPressRef.current) {
      latestRef.current.onDrag?.(position);
    } else if (startPosRef.current) {
      const dx = position.x - startPosRef.current.x;
      const dy = position.y - startPosRef.current.y;
      if (Math.hypot(dx, dy) > MOVEMENT_TOLERANCE) {
        finishGesture("abandon");
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (
      event.pointerType === "touch" ||
      ownerRef.current !== "pointer" ||
      pointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    releasePointer(event);
    finishGesture("release", { x: event.clientX, y: event.clientY });
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    if (
      event.pointerType === "touch" ||
      ownerRef.current !== "pointer" ||
      pointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    releasePointer(event);
    finishGesture(isLongPressRef.current ? "cancel" : "abandon");
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    setIsHovered(false);
    if (
      event.pointerType === "touch" ||
      ownerRef.current !== "pointer" ||
      pointerIdRef.current !== event.pointerId ||
      isLongPressRef.current
    ) {
      return;
    }

    finishGesture("abandon");
  };

  const handleClick = () => {
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      clearClickResetTimer();
      return;
    }
    triggerHapticFeedback("selection");
    onSelect(category.name);
  };

  return (
    <div className="group relative aspect-square min-w-0">
      <button
        ref={buttonRef}
        type="button"
        className="grid h-full w-full aspect-square min-w-0 grid-rows-2 overflow-hidden rounded-2xl border border-transparent bg-surface-2 p-0 text-center transition [touch-action:pan-x_pan-y] select-none group-hover:border-primary/50 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      >
        <motion.span
          className="flex h-full w-full items-center justify-center"
          animate={{ scale: isHovered ? 1.08 : 1 }}
          transition={springTransition}
        >
          <DynamicIcon
            name={icon}
            className="h-4 w-4 translate-y-2.5 min-[360px]:h-5 min-[360px]:w-5"
            style={{ color: displayColor }}
          />
        </motion.span>
        <span className="flex h-full w-full min-w-0 items-center justify-center px-1.5">
          <span className="line-clamp-2 min-w-0 break-words text-[9px] font-semibold leading-[1.15] text-foreground min-[360px]:text-[10px]">
            {category.name}
          </span>
        </span>
      </button>
      {/* iOS 26.5+ only preserves the system tick for a direct tap on this native switch. */}
      <input
        ref={setHapticSwitch}
        type="checkbox"
        data-category-haptic-switch
        data-haptic-trigger
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        style={{
          clipPath: "inset(0 round 1rem)",
          touchAction: "pan-x pan-y",
          WebkitTapHighlightColor: "transparent",
        }}
        onChange={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

export function CategoryGrid({
  categories,
  onSelect,
  onLongPress,
  onDrag,
  onRelease,
  onCancel,
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
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
