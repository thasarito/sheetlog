import { useLayoutEffect } from "react";

export const KEYBOARD_INSET_THRESHOLD = 60;

type KeyboardAccessoryPlacementInput = {
  windowHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
  drawerTop: number;
};

export type KeyboardAccessoryPlacement = {
  active: boolean;
  keyboardTop: number;
  offset: number;
};

export function calculateKeyboardAccessoryPlacement({
  windowHeight,
  viewportHeight,
  viewportOffsetTop,
  drawerTop,
}: KeyboardAccessoryPlacementInput): KeyboardAccessoryPlacement {
  const safeWindowHeight = Number.isFinite(windowHeight)
    ? Math.max(0, windowHeight)
    : 0;
  if (
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(viewportOffsetTop) ||
    !Number.isFinite(drawerTop)
  ) {
    return { active: false, keyboardTop: safeWindowHeight, offset: 0 };
  }

  const keyboardTop = viewportHeight + viewportOffsetTop;
  const keyboardInset = safeWindowHeight - keyboardTop;
  if (keyboardInset <= KEYBOARD_INSET_THRESHOLD) {
    return { active: false, keyboardTop: safeWindowHeight, offset: 0 };
  }

  return {
    active: true,
    keyboardTop,
    offset: Math.max(0, keyboardTop - drawerTop),
  };
}

type UseKeyboardAccessoryPlacementOptions = {
  drawerElement: HTMLElement | null;
  accessoryHost: HTMLElement | null;
  layoutHeight: number;
};

export function useKeyboardAccessoryPlacement({
  drawerElement,
  accessoryHost,
  layoutHeight,
}: UseKeyboardAccessoryPlacementOptions) {
  useLayoutEffect(() => {
    if (!accessoryHost) return;

    const stableLayoutHeight = Number.isFinite(layoutHeight)
      ? Math.max(0, layoutHeight)
      : window.innerHeight;

    const reset = () => {
      accessoryHost.style.setProperty(
        "--transaction-history-keyboard-offset",
        "0px",
      );
      accessoryHost.dataset.keyboardActive = "false";
      accessoryHost.dataset.keyboardTop = String(stableLayoutHeight);
    };
    reset();

    const viewport = window.visualViewport;
    if (!viewport || !drawerElement) return reset;

    const update = () => {
      const placement = calculateKeyboardAccessoryPlacement({
        windowHeight: stableLayoutHeight,
        viewportHeight: viewport.height,
        viewportOffsetTop: viewport.offsetTop,
        drawerTop: drawerElement.getBoundingClientRect().top,
      });
      accessoryHost.style.setProperty(
        "--transaction-history-keyboard-offset",
        `${placement.offset}px`,
      );
      accessoryHost.dataset.keyboardActive = String(placement.active);
      accessoryHost.dataset.keyboardTop = String(placement.keyboardTop);
    };
    let animationFrame: number | null = null;
    const trackDrawerTransition = () => {
      update();
      animationFrame = window.requestAnimationFrame(trackDrawerTransition);
    };
    const startDrawerTransitionTracking = (event: Event) => {
      if (event.target !== drawerElement || animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(trackDrawerTransition);
    };
    const stopDrawerTransitionTracking = (event: Event) => {
      if (event.target !== drawerElement) return;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      update();
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    drawerElement.addEventListener("transitionrun", startDrawerTransitionTracking);
    drawerElement.addEventListener(
      "transitionstart",
      startDrawerTransitionTracking,
    );
    drawerElement.addEventListener("transitionend", stopDrawerTransitionTracking);
    drawerElement.addEventListener(
      "transitioncancel",
      stopDrawerTransitionTracking,
    );
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(drawerElement);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      observer?.disconnect();
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      drawerElement.removeEventListener(
        "transitionrun",
        startDrawerTransitionTracking,
      );
      drawerElement.removeEventListener(
        "transitionstart",
        startDrawerTransitionTracking,
      );
      drawerElement.removeEventListener(
        "transitionend",
        stopDrawerTransitionTracking,
      );
      drawerElement.removeEventListener(
        "transitioncancel",
        stopDrawerTransitionTracking,
      );
      reset();
    };
  }, [accessoryHost, drawerElement, layoutHeight]);
}
