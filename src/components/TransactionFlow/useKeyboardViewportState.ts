import { useLayoutEffect, useState } from "react";

export const KEYBOARD_INSET_THRESHOLD = 60;

export type KeyboardViewportState = {
  active: boolean;
  height: number;
  top: number;
};

type KeyboardViewportMeasurements = {
  layoutHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
};

function safeLayoutHeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function inactiveKeyboardState(layoutHeight: number): KeyboardViewportState {
  const height = safeLayoutHeight(layoutHeight);
  return { active: false, height: 0, top: height };
}

export function calculateKeyboardViewportState({
  layoutHeight,
  viewportHeight,
  viewportOffsetTop,
}: KeyboardViewportMeasurements): KeyboardViewportState {
  const stableLayoutHeight = safeLayoutHeight(layoutHeight);
  if (
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(viewportOffsetTop)
  ) {
    return inactiveKeyboardState(stableLayoutHeight);
  }

  const measuredTop = viewportHeight + viewportOffsetTop;
  const keyboardTop = Math.min(
    stableLayoutHeight,
    Math.max(0, measuredTop),
  );
  const keyboardHeight = Math.round(stableLayoutHeight - keyboardTop);
  if (keyboardHeight <= KEYBOARD_INSET_THRESHOLD) {
    return inactiveKeyboardState(stableLayoutHeight);
  }

  return {
    active: true,
    height: keyboardHeight,
    top: stableLayoutHeight - keyboardHeight,
  };
}

function statesMatch(
  current: KeyboardViewportState,
  next: KeyboardViewportState,
): boolean {
  return (
    current.active === next.active &&
    current.height === next.height &&
    current.top === next.top
  );
}

export function useKeyboardViewportState(
  layoutHeight: number,
): KeyboardViewportState {
  const stableLayoutHeight = safeLayoutHeight(layoutHeight);
  const [state, setState] = useState<KeyboardViewportState>(() =>
    inactiveKeyboardState(stableLayoutHeight),
  );

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const reset = () => {
      const next = inactiveKeyboardState(stableLayoutHeight);
      setState((current) => (statesMatch(current, next) ? current : next));
    };

    if (!viewport) {
      reset();
      return;
    }

    const update = () => {
      const next = calculateKeyboardViewportState({
        layoutHeight: stableLayoutHeight,
        viewportHeight: viewport.height,
        viewportOffsetTop: viewport.offsetTop,
      });
      setState((current) => (statesMatch(current, next) ? current : next));
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [stableLayoutHeight]);

  return state;
}
