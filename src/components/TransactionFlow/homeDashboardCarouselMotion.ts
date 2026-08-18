export type CarouselDirection = -1 | 0 | 1;

export const DASHBOARD_SLIDES = ['Analytics', 'Transactions'] as const;
export const HEADER_COLLAPSE_DISTANCE = 68;
export const HORIZONTAL_GESTURE_THRESHOLD = 8;
export const SETTLE_DURATION_MS = 240;

const SWIPE_COMMIT_PROGRESS = 0.25;
const SWIPE_COMMIT_VELOCITY = 0.5;
const MIN_FLING_PROGRESS = 0.08;

export function clampSignedProgress(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export function directionFrom(value: number): CarouselDirection {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function wrappedSlideIndex(index: number): number {
  return (index + DASHBOARD_SLIDES.length) % DASHBOARD_SLIDES.length;
}

export function slidePosition(
  index: number,
  origin: number,
  progress: number,
  direction: CarouselDirection,
): number {
  if (index === origin) return -progress;
  const settledLane = index > origin ? 1 : -1;
  const motionLane = direction || directionFrom(progress) || settledLane;
  return motionLane - progress;
}

export function shouldCommitSwipe({
  progress,
  velocity,
  cancelled,
}: {
  progress: number;
  velocity: number;
  cancelled: boolean;
}): boolean {
  const direction = directionFrom(progress) || directionFrom(velocity);
  return (
    !cancelled &&
    direction !== 0 &&
    (Math.abs(progress) >= SWIPE_COMMIT_PROGRESS ||
      (Math.abs(progress) >= MIN_FLING_PROGRESS &&
        Math.abs(velocity) >= SWIPE_COMMIT_VELOCITY))
  );
}

export function headerCollapseProgress(element: HTMLElement): number {
  return Math.min(
    1,
    Math.max(0, element.scrollTop / HEADER_COLLAPSE_DISTANCE),
  );
}

export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}
