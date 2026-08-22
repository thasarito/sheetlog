import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ForwardedRef,
} from "react";
import { attachIosSelectionHaptic } from "../../lib/transactionHaptics";

export type HapticSelectionButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    changesValue?: boolean;
  };

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export const HapticSelectionButton = forwardRef<
  HTMLButtonElement,
  HapticSelectionButtonProps
>(function HapticSelectionButton(
  { changesValue = true, disabled, ...props },
  forwardedRef,
) {
  const elementRef = useRef<HTMLButtonElement | null>(null);

  const setElement = useCallback(
    (element: HTMLButtonElement | null) => {
      elementRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    if (!changesValue || disabled) return;
    return attachIosSelectionHaptic(elementRef.current);
  }, [changesValue, disabled]);

  return <button ref={setElement} disabled={disabled} {...props} />;
});
