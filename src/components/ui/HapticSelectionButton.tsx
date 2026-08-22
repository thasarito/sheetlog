import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  type ButtonHTMLAttributes,
} from "react";
import {
  attachSelectionHaptic,
  subscribeHapticFeedback,
} from "../../lib/haptics";

export type HapticSelectionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  haptic?: boolean;
  hapticEnabled?: boolean;
  selectionHaptic?: boolean;
  changesValue?: boolean;
};

function assignRef<T>(
  ref: React.ForwardedRef<T>,
  value: T | null,
): void {
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
  {
    haptic,
    hapticEnabled,
    selectionHaptic,
    changesValue,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const elementRef = useRef<HTMLButtonElement | null>(null);
  const [preferenceRevision, refreshPreference] = useReducer(
    (revision: number) => revision + 1,
    0,
  );
  const requested =
    changesValue ?? selectionHaptic ?? hapticEnabled ?? haptic ?? true;

  const setElement = useCallback(
    (element: HTMLButtonElement | null) => {
      elementRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  useLayoutEffect(
    () => subscribeHapticFeedback(refreshPreference),
    [],
  );

  useLayoutEffect(() => {
    if (!requested || disabled) return;
    return attachSelectionHaptic(elementRef.current);
  }, [disabled, preferenceRevision, requested]);

  return <button ref={setElement} disabled={disabled} {...props} />;
});
