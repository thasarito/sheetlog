import { useEffect, useRef, useState } from "react";

const KEYBOARD_INSET_THRESHOLD = 60;
const COMPACT_TRANSACTION_HEIGHT = 680;
const VISUAL_VIEWPORT_OFFSET_PROPERTY =
  "--transaction-visual-viewport-offset";

type VirtualKeyboardLike = { overlaysContent: boolean };
type NavigatorWithVirtualKeyboard = {
  virtualKeyboard?: VirtualKeyboardLike;
};

export function requestVirtualKeyboardOverlay(
  target: NavigatorWithVirtualKeyboard,
) {
  const keyboard = target.virtualKeyboard;
  if (!keyboard) return () => undefined;
  const previousValue = keyboard.overlaysContent;
  keyboard.overlaysContent = true;
  return () => {
    keyboard.overlaysContent = previousValue;
  };
}

function isCoarsePointer() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function isEditableElement(element: Element | null) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function measureAvailableHeight() {
  const rootHeight = document.getElementById("root")?.clientHeight ?? 0;
  return rootHeight > 0 ? rootHeight : window.innerHeight;
}

function finiteValue(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function measureVisualViewportTop(viewport: VisualViewport) {
  return Math.max(
    0,
    finiteValue(viewport.offsetTop),
    finiteValue(viewport.pageTop),
    finiteValue(window.scrollY),
  );
}

function measureKeyboardInset(
  layoutHeight: number,
  viewport: VisualViewport,
) {
  const viewportBottom =
    finiteValue(viewport.height) + finiteValue(viewport.offsetTop);
  return Math.max(0, layoutHeight - viewportBottom);
}

function setVisualViewportOffset(value: number) {
  const normalized = Math.max(0, Math.round(value));
  const root = document.documentElement;
  root.style.setProperty(
    VISUAL_VIEWPORT_OFFSET_PROPERTY,
    `${normalized}px`,
  );
  root.dataset.transactionViewportPanned = normalized > 0 ? "true" : "false";
}

function setCompactTransactionLayout(height: number) {
  document.documentElement.dataset.transactionCompactHeight =
    height < COMPACT_TRANSACTION_HEIGHT ? "true" : "false";
}

export function useStableTransactionHeight() {
  const [height, setHeight] = useState(measureAvailableHeight);
  const heightRef = useRef(height);
  const widthRef = useRef(window.innerWidth);
  const coarsePointerRef = useRef(isCoarsePointer());

  heightRef.current = height;

  useEffect(() => {
    const restoreKeyboardOverlay = requestVirtualKeyboardOverlay(
      navigator as Navigator & NavigatorWithVirtualKeyboard,
    );
    const viewport = window.visualViewport;
    let viewportFrame = 0;
    let keyboardPanSession = false;

    const updateVisualViewportOffset = () => {
      viewportFrame = 0;
      if (!coarsePointerRef.current || !viewport) {
        keyboardPanSession = false;
        setVisualViewportOffset(0);
        return;
      }

      const viewportTop = measureVisualViewportTop(viewport);
      const keyboardInset = measureKeyboardInset(heightRef.current, viewport);
      const viewportContracted =
        heightRef.current - finiteValue(viewport.height) >
        KEYBOARD_INSET_THRESHOLD;
      const keyboardActive =
        keyboardInset > KEYBOARD_INSET_THRESHOLD || viewportContracted;
      const editableFocused = isEditableElement(document.activeElement);

      if (editableFocused && (keyboardActive || viewportTop > 0.5)) {
        keyboardPanSession = true;
      } else if (!keyboardActive && viewportTop <= 0.5) {
        keyboardPanSession = false;
      }

      setVisualViewportOffset(keyboardPanSession ? viewportTop : 0);
    };

    const scheduleVisualViewportOffset = () => {
      if (viewportFrame !== 0) {
        window.cancelAnimationFrame(viewportFrame);
      }
      viewportFrame = window.requestAnimationFrame(updateVisualViewportOffset);
    };

    const commitHeight = () => {
      const nextHeight = measureAvailableHeight();
      heightRef.current = nextHeight;
      setCompactTransactionLayout(nextHeight);
      setHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
      scheduleVisualViewportOffset();
    };

    const handleResize = () => {
      const widthChanged = window.innerWidth !== widthRef.current;
      if (
        coarsePointerRef.current &&
        !widthChanged &&
        isEditableElement(document.activeElement)
      ) {
        scheduleVisualViewportOffset();
        return;
      }
      widthRef.current = window.innerWidth;
      if (widthChanged) keyboardPanSession = false;
      commitHeight();
    };

    setCompactTransactionLayout(heightRef.current);
    scheduleVisualViewportOffset();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", scheduleVisualViewportOffset, {
      passive: true,
    });
    document.addEventListener("focusin", scheduleVisualViewportOffset, true);
    document.addEventListener("focusout", scheduleVisualViewportOffset, true);
    viewport?.addEventListener("resize", scheduleVisualViewportOffset);
    viewport?.addEventListener("scroll", scheduleVisualViewportOffset);

    return () => {
      if (viewportFrame !== 0) {
        window.cancelAnimationFrame(viewportFrame);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", scheduleVisualViewportOffset);
      document.removeEventListener(
        "focusin",
        scheduleVisualViewportOffset,
        true,
      );
      document.removeEventListener(
        "focusout",
        scheduleVisualViewportOffset,
        true,
      );
      viewport?.removeEventListener("resize", scheduleVisualViewportOffset);
      viewport?.removeEventListener("scroll", scheduleVisualViewportOffset);
      document.documentElement.style.removeProperty(
        VISUAL_VIEWPORT_OFFSET_PROPERTY,
      );
      delete document.documentElement.dataset.transactionViewportPanned;
      delete document.documentElement.dataset.transactionCompactHeight;
      restoreKeyboardOverlay();
    };
  }, []);

  return height;
}
