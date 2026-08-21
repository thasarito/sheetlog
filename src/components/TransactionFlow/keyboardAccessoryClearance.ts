export const IOS_INPUT_ASSISTANT_CLEARANCE_PX = 48;

export type NavigatorPlatformLike = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

function isIosLike(target: NavigatorPlatformLike): boolean {
  return (
    /iPad|iPhone|iPod/.test(target.userAgent) ||
    (target.platform === "MacIntel" && target.maxTouchPoints > 1)
  );
}

export function keyboardAccessoryOffset(
  active: boolean,
  target: NavigatorPlatformLike = navigator,
): number {
  return active && isIosLike(target)
    ? -IOS_INPUT_ASSISTANT_CLEARANCE_PX
    : 0;
}
