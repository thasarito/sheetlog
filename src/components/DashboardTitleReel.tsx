import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { DASHBOARD_SLIDES } from "./dashboardSlides";

const LABELS = DASHBOARD_SLIDES;
const ITEM_INDEXES = LABELS.map((_, index) => index);
const FADED_OPACITY = 0.34;

export type DashboardTitle = (typeof DASHBOARD_SLIDES)[number];
export type DashboardTitleDirection = -1 | 1;

export type DashboardTitleReelHandle = {
  setHorizontalPosition: (position: number) => void;
  // Temporary compatibility for the existing carousel. The native scroll-snap
  // replacement removes this direction/progress adapter.
  setHorizontalMotion: (
    direction: DashboardTitleDirection,
    progress: number,
  ) => void;
  syncHorizontalSelection: (title: DashboardTitle) => void;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function positionForTitle(title: DashboardTitle): number {
  const position = LABELS.indexOf(title);
  return position >= 0 ? position : 0;
}

function anchorForPosition(
  position: number,
  positions: Map<number, number>,
): number {
  const lastIndex = LABELS.length - 1;
  if (lastIndex <= 0) return positions.get(0) ?? 0;

  if (position <= 0) {
    const first = positions.get(0) ?? 0;
    const second = positions.get(1) ?? first;
    return first + position * (second - first);
  }

  if (position >= lastIndex) {
    const last = positions.get(lastIndex) ?? 0;
    const previous = positions.get(lastIndex - 1) ?? last;
    return last + (position - lastIndex) * (last - previous);
  }

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = positions.get(lowerIndex) ?? 0;
  const upper = positions.get(upperIndex) ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export const DashboardTitleReel = forwardRef<
  DashboardTitleReelHandle,
  object
>(function DashboardTitleReel(_props, forwardedRef) {
  const reelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<number, HTMLSpanElement>());
  const selectedIndexRef = useRef(0);
  const visualPositionRef = useRef(0);

  const renderPosition = useCallback((incomingPosition: number) => {
    const reel = reelRef.current;
    if (!reel) return;

    const selectedIndex = selectedIndexRef.current;
    const position = Number.isFinite(incomingPosition)
      ? incomingPosition
      : selectedIndex;
    const emphasisPosition = clamp(position, 0, LABELS.length - 1);
    const activeIndex = clamp(
      Math.round(emphasisPosition),
      0,
      LABELS.length - 1,
    );

    const gap = clamp(reel.clientWidth * 0.055, 10, 18);
    const widths = new Map<number, number>();
    for (const index of ITEM_INDEXES) {
      const item = itemRefs.current.get(index);
      if (!item) continue;
      item.style.fontWeight = String(
        Math.round(
          520 +
            (1 - Math.min(1, Math.abs(index - emphasisPosition))) * 220,
        ),
      );
      widths.set(index, item.getBoundingClientRect().width);
    }

    const positions = new Map<number, number>([[0, 0]]);
    for (let index = 1; index < LABELS.length; index += 1) {
      positions.set(
        index,
        (positions.get(index - 1) ?? 0) +
          (widths.get(index - 1) ?? 0) +
          gap,
      );
    }

    const trackShift = -anchorForPosition(position, positions);
    const lowerParticipant = Math.floor(emphasisPosition);
    const upperParticipant = Math.ceil(emphasisPosition);

    let visibleCount = 0;
    for (const index of ITEM_INDEXES) {
      const item = itemRefs.current.get(index);
      if (!item) continue;

      const distance = Math.min(1, Math.abs(index - emphasisPosition));
      const x = (positions.get(index) ?? 0) + trackShift;
      const width = widths.get(index) ?? 0;
      const right = x + width;
      const fullyVisible = x >= -0.5 && right <= reel.clientWidth + 0.5;
      const transitionParticipant =
        (index === lowerParticipant || index === upperParticipant) &&
        x < reel.clientWidth &&
        right > 0;
      const visible = fullyVisible || transitionParticipant;

      item.dataset.active = String(index === activeIndex);
      item.dataset.visible = String(visible);
      item.style.opacity = visible
        ? String(1 - distance * (1 - FADED_OPACITY))
        : "0";
      item.style.visibility = visible ? "visible" : "hidden";
      item.style.transform = `translate3d(${x.toFixed(2)}px, -50%, 0)`;
      if (visible) visibleCount += 1;
    }

    const signedProgress = position - selectedIndex;
    reel.dataset.direction =
      signedProgress > 0.001
        ? "forward"
        : signedProgress < -0.001
          ? "backward"
          : "settled";
    reel.dataset.gap = gap.toFixed(2);
    reel.dataset.position = position.toFixed(3);
    reel.dataset.progress = signedProgress.toFixed(3);
    reel.dataset.selectedLabel = LABELS[selectedIndex];
    reel.dataset.visibleCount = String(visibleCount);
  }, []);

  const renderSettledSelection = useCallback(
    (selectedIndex: number) => {
      selectedIndexRef.current = clamp(
        Math.trunc(selectedIndex),
        0,
        LABELS.length - 1,
      );
      visualPositionRef.current = selectedIndexRef.current;
      renderPosition(visualPositionRef.current);
    },
    [renderPosition],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      setHorizontalPosition(position) {
        visualPositionRef.current = position;
        renderPosition(position);
      },
      setHorizontalMotion(direction, progress) {
        const position =
          selectedIndexRef.current + direction * clamp(progress, 0, 1);
        visualPositionRef.current = position;
        renderPosition(position);
      },
      syncHorizontalSelection(title) {
        renderSettledSelection(positionForTitle(title));
      },
    }),
    [renderPosition, renderSettledSelection],
  );

  useLayoutEffect(() => {
    renderPosition(visualPositionRef.current);
    const reel = reelRef.current;
    if (!reel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      renderPosition(visualPositionRef.current),
    );
    observer.observe(reel);
    return () => observer.disconnect();
  }, [renderPosition]);

  return (
    <div
      ref={reelRef}
      data-testid="dashboard-title-reel"
      data-direction="settled"
      data-gap="10.00"
      data-position="0.000"
      data-progress="0.000"
      data-selected-label={LABELS[0]}
      data-visible-count="2"
      data-anchor="left"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-3 right-3 min-w-0 select-none overflow-hidden"
    >
      {LABELS.map((label, index) => (
        <span
          key={label}
          ref={(element) => {
            if (element) itemRefs.current.set(index, element);
            else itemRefs.current.delete(index);
          }}
          data-testid="dashboard-title-reel-item"
          data-index={index}
          data-label={label}
          data-active={String(index === 0)}
          data-visible={String(index < 2)}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 whitespace-nowrap text-[clamp(18px,6vw,27px)] leading-none tracking-[-0.045em] text-foreground [will-change:transform,opacity]"
          style={{
            fontWeight: index === 0 ? 740 : 520,
            opacity: index === 0 ? 1 : index === 1 ? FADED_OPACITY : 0,
            visibility: index < 2 ? "visible" : "hidden",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
});
