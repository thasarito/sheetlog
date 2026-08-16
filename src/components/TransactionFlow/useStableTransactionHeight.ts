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

export function useStableTransactionHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  const widthRef = useRef(window.innerWidth);
  const coarsePointerRef = useRef(isCoarsePointer());

  useEffect(() => {
    const restoreKeyboardOverlay = requestVirtualKeyboardOverlay(
      navigator as Navigator & NavigatorWithVirtualKeyboard,
    );

    const handleResize = () => {
      const widthChanged = window.innerWidth !== widthRef.current;
      if (coarsePointerRef.current && !widthChanged) return;
      widthRef.current = window.innerWidth;
      setHeight(window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      restoreKeyboardOverlay();
    };
  }, []);

  return height;
}
