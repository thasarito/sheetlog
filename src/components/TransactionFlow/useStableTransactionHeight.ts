import { useEffect, useRef, useState } from "react";

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

export function useStableTransactionHeight() {
  const [height, setHeight] = useState(measureAvailableHeight);
  const widthRef = useRef(window.innerWidth);
  const coarsePointerRef = useRef(isCoarsePointer());

  useEffect(() => {
    const restoreKeyboardOverlay = requestVirtualKeyboardOverlay(
      navigator as Navigator & NavigatorWithVirtualKeyboard,
    );

    const handleResize = () => {
      const widthChanged = window.innerWidth !== widthRef.current;
      if (
        coarsePointerRef.current &&
        !widthChanged &&
        isEditableElement(document.activeElement)
      ) {
        return;
      }
      widthRef.current = window.innerWidth;
      setHeight(measureAvailableHeight());
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      restoreKeyboardOverlay();
    };
  }, []);

  return height;
}
