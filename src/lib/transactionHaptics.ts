/*
 * The iOS selection attachment below is adapted from tijnjh/ios-haptics
 * (https://github.com/tijnjh/ios-haptics), distributed under the MIT License.
 *
 * MIT License
 *
 * Copyright (c) 2025 tijnjh
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type HapticFeedbackKind =
  | "selection"
  | "impact"
  | "success"
  | "warning"
  | "error";

export type HapticNavigatorLike = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

type VibrationTarget = {
  vibrate?: (pattern: number | number[]) => boolean;
};

export type ReceiptHapticSnapshot = {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  syncStatus?: "pending" | "synced" | "error";
  undoOutcome?: "pending" | "error";
};

export const HAPTIC_VIBRATION_PATTERNS = {
  selection: 8,
  impact: 14,
  success: [8, 32, 12],
  warning: [14, 42, 14],
  error: [20, 36, 20],
} satisfies Record<HapticFeedbackKind, number | number[]>;

function currentVibrationTarget(): VibrationTarget | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

export function triggerHapticFeedback(
  kind: HapticFeedbackKind,
  target: VibrationTarget | undefined = currentVibrationTarget(),
): boolean {
  if (isDocumentHidden() || typeof target?.vibrate !== "function") return false;

  try {
    return target.vibrate(HAPTIC_VIBRATION_PATTERNS[kind]);
  } catch {
    return false;
  }
}

export function isIosHapticTarget(
  target: HapticNavigatorLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!target) return false;

  return (
    /iPad|iPhone|iPod/.test(target.userAgent) ||
    (target.platform === "MacIntel" && target.maxTouchPoints > 1)
  );
}

export function attachIosSelectionHaptic(
  element: HTMLElement | null | undefined,
  target: HapticNavigatorLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): () => void {
  if (
    !element ||
    typeof window === "undefined" ||
    !isIosHapticTarget(target) ||
    element.matches(":disabled, [aria-disabled='true']")
  ) {
    return () => undefined;
  }

  const existing = Array.from(element.children).find(
    (child): child is HTMLInputElement =>
      child instanceof HTMLInputElement &&
      child.hasAttribute("data-haptic-trigger"),
  );
  if (existing) return () => undefined;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute("data-haptic-trigger", "");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;

  Object.assign(input.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    margin: "0",
    opacity: "0",
    clipPath: "inset(0 round 999px)",
    touchAction: "manipulation",
  } satisfies Partial<CSSStyleDeclaration>);
  input.style.setProperty("-webkit-tap-highlight-color", "transparent");

  const previousInlinePosition = element.style.position;
  const changedPosition = getComputedStyle(element).position === "static";
  if (changedPosition) element.style.position = "relative";

  element.insertAdjacentElement("beforeend", input);

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    input.remove();
    if (changedPosition && element.style.position === "relative") {
      element.style.position = previousInlinePosition;
    }
  };
}

export function resolveReceiptHapticFeedback(
  previous: ReceiptHapticSnapshot | null,
  next: ReceiptHapticSnapshot,
): HapticFeedbackKind | null {
  if (next.undoOutcome === "error" && previous?.undoOutcome !== "error") {
    return "error";
  }
  if (next.undoOutcome === "pending" && previous?.undoOutcome !== "pending") {
    return "warning";
  }
  if (next.isError && !previous?.isError) return "error";
  if (
    next.isSuccess &&
    next.syncStatus === "error" &&
    (!previous?.isSuccess || previous.syncStatus !== "error")
  ) {
    return "warning";
  }
  if (next.isSuccess && !previous?.isSuccess) return "success";
  return null;
}
