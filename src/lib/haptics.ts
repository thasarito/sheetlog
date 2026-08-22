import { hapticTrigger } from "ios-haptics";

export const HAPTIC_FEEDBACK_STORAGE_KEY = "sheetlog.hapticFeedback";
export const HAPTIC_FEEDBACK_CHANGED_EVENT = "sheetlog:haptic-feedback-changed";

export type HapticNavigatorLike = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

type Attachment = {
  cleanup: () => void;
};

const attachments = new Map<HTMLElement, Attachment>();
const subscribers = new Set<() => void>();

function isIosLike(target: HapticNavigatorLike): boolean {
  return (
    /iPad|iPhone|iPod/.test(target.userAgent) ||
    (target.platform === "MacIntel" && target.maxTouchPoints > 1)
  );
}

function iosVersion(target: HapticNavigatorLike): [number, number] | null {
  const match =
    target.userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)[_.](\d+)/) ??
    target.userAgent.match(/Version\/(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function supportsIosSelectionHaptics(
  target: HapticNavigatorLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!target || !isIosLike(target)) return false;

  const version = iosVersion(target);
  if (!version) return true;
  const [major, minor] = version;

  // The native switch-overlay technique used by ios-haptics no longer
  // produces feedback from iOS 26.5 onward. Keep this enhancement inert
  // there rather than adding a transparent control with no tactile benefit.
  return major < 26 || (major === 26 && minor < 5);
}

export function getHapticFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(HAPTIC_FEEDBACK_STORAGE_KEY) !== "false";
}

export const isHapticFeedbackEnabled = getHapticFeedbackEnabled;

export function removeAllSelectionHaptics(): void {
  for (const attachment of [...attachments.values()]) attachment.cleanup();
}

function notifyPreferenceChange(): void {
  for (const subscriber of [...subscribers]) subscriber();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(HAPTIC_FEEDBACK_CHANGED_EVENT, {
        detail: { enabled: getHapticFeedbackEnabled() },
      }),
    );
  }
}

export function setHapticFeedbackEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      HAPTIC_FEEDBACK_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  }
  if (!enabled) removeAllSelectionHaptics();
  notifyPreferenceChange();
}

export function subscribeHapticFeedback(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function hapticInput(element: HTMLElement): HTMLInputElement | null {
  return (
    Array.from(element.children).find(
      (child): child is HTMLInputElement =>
        child instanceof HTMLInputElement &&
        child.hasAttribute("data-haptic-trigger"),
    ) ?? null
  );
}

export function attachSelectionHaptic(
  element: HTMLElement | null | undefined,
): () => void {
  if (!element) return () => undefined;

  attachments.get(element)?.cleanup();
  if (
    !getHapticFeedbackEnabled() ||
    !supportsIosSelectionHaptics() ||
    element.matches(":disabled, [aria-disabled='true']")
  ) {
    return () => undefined;
  }

  const previousInlinePosition = element.style.position;
  const wasStatic = getComputedStyle(element).position === "static";
  hapticTrigger(element);
  const input = hapticInput(element);
  if (!input) return () => undefined;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    input.remove();
    if (wasStatic && element.style.position === "relative") {
      element.style.position = previousInlinePosition;
    }
    if (attachments.get(element)?.cleanup === cleanup) attachments.delete(element);
  };

  attachments.set(element, { cleanup });
  return cleanup;
}

export function triggerVibrationFeedback(duration = 10): boolean {
  if (
    !getHapticFeedbackEnabled() ||
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }
  return navigator.vibrate(duration);
}
