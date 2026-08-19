import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import {
  advanceDashboardCarouselLoopMotion,
  dashboardCarouselProgressFromTravel,
  type DashboardCarouselLoopMotionState,
} from "./dashboardCarouselLoopMotion";
import { DASHBOARD_SLIDES } from "./dashboardSlides";

const LABELS = DASHBOARD_SLIDES;
const MAX_REEL_OFFSET = LABELS.length;
const REEL_OFFSETS = Array.from(
  { length: MAX_REEL_OFFSET * 2 + 1 },
  (_, index) => index - MAX_REEL_OFFSET,
);
const FADED_OPACITY = 0.34;

export type DashboardTitle = (typeof DASHBOARD_SLIDES)[number];
export type DashboardTitleDirection = -1 | 1;

export type DashboardTitleReelHandle = {
  resetHorizontalSelection: () => void;
  setHorizontalMotion: (
    direction: DashboardTitleDirection,
    progress: number,
  ) => void;
  settleHorizontalMotion: (committedSteps: number) => void;
  syncHorizontalSelection: (title: DashboardTitle) => void;
};

type ReelMotion = {
  direction: DashboardTitleDirection | 0;
  progress: number;
};

type VisibleCandidate = {
  offset: number;
  label: string;
  active: boolean;
  distance: number;
  fullyVisible: boolean;
  transitionParticipant: boolean;
  x: number;
};

type CarouselTrackMeasurement = {
  offset: number;
  loopSpan: number;
  viewportWidth: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeIndex(index: number): number {
  return ((index % LABELS.length) + LABELS.length) % LABELS.length;
}

function labelAt(selectedPosition: number, offset: number): string {
  return LABELS[normalizeIndex(selectedPosition + offset)];
}

function positionForTitle(title: DashboardTitle): number {
  const position = LABELS.indexOf(title);
  return position >= 0 ? position : 0;
}

function measureCarouselTrack(
  reel: HTMLElement | null,
): CarouselTrackMeasurement | null {
  if (typeof document === "undefined") return null;
  const scope: ParentNode =
    reel?.closest<HTMLElement>('[data-testid="transaction-canvas"]') ??
    document;
  const viewport = scope.querySelector<HTMLElement>(
    '[data-testid="home-carousel-viewport"]',
  );
  const track = scope.querySelector<HTMLElement>(
    '[data-testid="home-carousel-track"]',
  );
  if (!viewport || !track) return null;

  const viewportRect = viewport.getBoundingClientRect();
  const trackRect = track.getBoundingClientRect();
  const viewportWidth = viewportRect.width;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;

  return {
    offset: trackRect.left - viewportRect.left,
    loopSpan: Math.max(track.scrollWidth, viewportWidth * LABELS.length),
    viewportWidth,
  };
}

function shouldReplaceCandidate(
  candidate: VisibleCandidate,
  current: VisibleCandidate,
): boolean {
  const candidatePriority = [
    candidate.active ? 0 : 1,
    candidate.transitionParticipant ? 0 : 1,
    candidate.fullyVisible ? 0 : 1,
    candidate.distance,
    Math.abs(candidate.x),
  ];
  const currentPriority = [
    current.active ? 0 : 1,
    current.transitionParticipant ? 0 : 1,
    current.fullyVisible ? 0 : 1,
    current.distance,
    Math.abs(current.x),
  ];

  for (const [index, priority] of candidatePriority.entries()) {
    const currentValue = currentPriority[index];
    if (priority === currentValue) continue;
    return priority < currentValue;
  }
  return false;
}

export const DashboardTitleReel = forwardRef<
  DashboardTitleReelHandle,
  object
>(function DashboardTitleReel(_props, forwardedRef) {
  const reelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<number, HTMLSpanElement>());
  const selectedPositionRef = useRef(0);
  const motionRef = useRef<ReelMotion>({ direction: 0, progress: 0 });
  const carouselLoopMotionRef =
    useRef<DashboardCarouselLoopMotionState | null>(null);

  const renderMotion = useCallback(({ direction, progress }: ReelMotion) => {
    const reel = reelRef.current;
    if (!reel) return;

    const boundedProgress = clamp(progress, 0, 1);
    const signedProgress = direction * boundedProgress;
    const transition = Math.abs(signedProgress);
    const selectedPosition = selectedPositionRef.current;

    for (const offset of REEL_OFFSETS) {
      const item = itemRefs.current.get(offset);
      if (!item) continue;
      item.textContent = labelAt(selectedPosition, offset);
      item.dataset.label = item.textContent;

      const distance = Math.min(1, Math.abs(offset - signedProgress));
      item.dataset.active = String(distance < 0.001);
      item.dataset.loopCopy = "false";
      item.style.fontWeight = String(
        Math.round(520 + (1 - distance) * 220),
      );
      item.style.opacity = "0";
      item.style.visibility = "hidden";
      item.dataset.visible = "false";
    }

    const gap = clamp(reel.clientWidth * 0.055, 10, 18);
    const widths = new Map<number, number>();
    for (const offset of REEL_OFFSETS) {
      widths.set(
        offset,
        itemRefs.current.get(offset)?.getBoundingClientRect().width ?? 0,
      );
    }

    const positions = new Map<number, number>([[0, 0]]);
    for (let offset = 1; offset <= MAX_REEL_OFFSET; offset += 1) {
      positions.set(
        offset,
        (positions.get(offset - 1) ?? 0) +
          (widths.get(offset - 1) ?? 0) +
          gap,
      );
    }
    for (let offset = -1; offset >= -MAX_REEL_OFFSET; offset -= 1) {
      positions.set(
        offset,
        (positions.get(offset + 1) ?? 0) -
          (widths.get(offset) ?? 0) -
          gap,
      );
    }

    const enteringOffset = direction === 0 ? 0 : direction;
    const shift =
      direction === 0
        ? 0
        : -transition * (positions.get(enteringOffset) ?? 0);
    const reelWidth = reel.clientWidth;
    const candidates: VisibleCandidate[] = [];

    for (const offset of REEL_OFFSETS) {
      const item = itemRefs.current.get(offset);
      if (!item) continue;
      const x = (positions.get(offset) ?? 0) + shift;
      const width = widths.get(offset) ?? 0;
      const right = x + width;
      const distance = Math.min(1, Math.abs(offset - signedProgress));
      const active = distance < 0.001;
      const fullyVisible = x >= -0.5 && right <= reelWidth + 0.5;
      const intersects = x < reelWidth && right > 0;
      const transitionParticipant =
        transition > 0 && (offset === 0 || offset === enteringOffset);
      const canShow =
        active || fullyVisible || (transitionParticipant && intersects);

      item.style.transform = `translate3d(${x.toFixed(2)}px, -50%, 0)`;
      if (!canShow) continue;

      candidates.push({
        offset,
        label: item.dataset.label ?? item.textContent ?? "",
        active,
        distance,
        fullyVisible,
        transitionParticipant,
        x,
      });
    }

    const visibleCandidates = new Map<number, VisibleCandidate>();
    const addCandidate = (candidate: VisibleCandidate | undefined) => {
      if (candidate) visibleCandidates.set(candidate.offset, candidate);
    };

    if (direction === 0 || transition <= 0.001) {
      const bestByLabel = new Map<string, VisibleCandidate>();
      for (const candidate of candidates) {
        const current = bestByLabel.get(candidate.label);
        if (!current || shouldReplaceCandidate(candidate, current)) {
          bestByLabel.set(candidate.label, candidate);
        }
      }
      for (const candidate of bestByLabel.values()) addCandidate(candidate);
    } else {
      const outgoingLabel = labelAt(selectedPosition, 0);
      addCandidate(candidates.find((candidate) => candidate.offset === 0));
      addCandidate(
        candidates.find((candidate) => candidate.offset === enteringOffset),
      );

      const bestByLabel = new Map<string, VisibleCandidate>();
      for (const candidate of candidates) {
        if (candidate.offset === 0 || candidate.offset === enteringOffset) {
          continue;
        }
        if (candidate.label === outgoingLabel) continue;
        const current = bestByLabel.get(candidate.label);
        if (!current || shouldReplaceCandidate(candidate, current)) {
          bestByLabel.set(candidate.label, candidate);
        }
      }
      for (const candidate of bestByLabel.values()) addCandidate(candidate);
    }

    const enteringLabel =
      direction === 0 ? null : labelAt(selectedPosition, enteringOffset);
    let visibleCount = 0;
    for (const candidate of visibleCandidates.values()) {
      const item = itemRefs.current.get(candidate.offset);
      if (!item) continue;
      let opacity = 1 - candidate.distance * (1 - FADED_OPACITY);
      const passiveEnteringCopy =
        transition > 0 &&
        enteringLabel !== null &&
        candidate.label === enteringLabel &&
        candidate.offset !== enteringOffset;
      if (passiveEnteringCopy) opacity *= 1 - transition;
      if (opacity <= 0.001) continue;

      item.style.opacity = String(opacity);
      item.style.visibility = "visible";
      item.dataset.visible = "true";
      item.dataset.loopCopy = String(passiveEnteringCopy);
      visibleCount += 1;
    }

    reel.dataset.gap = gap.toFixed(2);
    reel.dataset.progress = signedProgress.toFixed(3);
    reel.dataset.selectedLabel = labelAt(selectedPosition, 0);
    reel.dataset.visibleCount = String(visibleCount);
    reel.dataset.direction =
      signedProgress > 0.001
        ? "forward"
        : signedProgress < -0.001
          ? "backward"
          : "settled";
  }, []);

  const captureCarouselTrackBaseline = useCallback(() => {
    const measurement = measureCarouselTrack(reelRef.current);
    carouselLoopMotionRef.current = measurement
      ? { lastOffset: measurement.offset, travel: 0 }
      : null;
  }, []);

  const resolveLoopStableProgress = useCallback(
    (direction: DashboardTitleDirection, incomingProgress: number): number => {
      const fallbackProgress = clamp(incomingProgress, 0, 1);
      const measurement = measureCarouselTrack(reelRef.current);
      if (!measurement) {
        carouselLoopMotionRef.current = null;
        return fallbackProgress;
      }

      const current = carouselLoopMotionRef.current;
      if (!current) {
        carouselLoopMotionRef.current = {
          lastOffset: measurement.offset,
          travel: -direction * fallbackProgress * measurement.viewportWidth,
        };
        return fallbackProgress;
      }

      const next = advanceDashboardCarouselLoopMotion(
        current,
        measurement.offset,
        measurement.loopSpan,
      );
      carouselLoopMotionRef.current = next;
      return dashboardCarouselProgressFromTravel(
        next.travel,
        measurement.viewportWidth,
      );
    },
    [],
  );

  const renderSettledSelection = useCallback(
    (selectedPosition: number) => {
      selectedPositionRef.current = normalizeIndex(selectedPosition);
      const motion: ReelMotion = { direction: 0, progress: 0 };
      motionRef.current = motion;
      renderMotion(motion);
      captureCarouselTrackBaseline();
    },
    [captureCarouselTrackBaseline, renderMotion],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      resetHorizontalSelection() {
        renderSettledSelection(0);
      },
      setHorizontalMotion(direction, progress) {
        const motion = {
          direction,
          progress: resolveLoopStableProgress(direction, progress),
        };
        motionRef.current = motion;
        renderMotion(motion);
      },
      settleHorizontalMotion(committedSteps) {
        const steps = Number.isFinite(committedSteps)
          ? Math.trunc(committedSteps)
          : 0;
        renderSettledSelection(selectedPositionRef.current + steps);
      },
      syncHorizontalSelection(title) {
        renderSettledSelection(positionForTitle(title));
      },
    }),
    [renderMotion, renderSettledSelection, resolveLoopStableProgress],
  );

  useLayoutEffect(() => {
    renderMotion(motionRef.current);
    if (motionRef.current.direction === 0) captureCarouselTrackBaseline();
    const reel = reelRef.current;
    if (!reel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      renderMotion(motionRef.current);
      if (motionRef.current.direction === 0) captureCarouselTrackBaseline();
    });
    observer.observe(reel);
    return () => observer.disconnect();
  }, [captureCarouselTrackBaseline, renderMotion]);

  return (
    <div
      ref={reelRef}
      data-testid="dashboard-title-reel"
      data-direction="settled"
      data-gap="10.00"
      data-progress="0.000"
      data-selected-label={LABELS[0]}
      data-visible-count="2"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-3 right-3 min-w-0 select-none overflow-hidden"
    >
      {REEL_OFFSETS.map((offset) => (
        <span
          key={offset}
          ref={(element) => {
            if (element) itemRefs.current.set(offset, element);
            else itemRefs.current.delete(offset);
          }}
          data-testid="dashboard-title-reel-item"
          data-offset={offset}
          data-label={labelAt(0, offset)}
          data-active={String(offset === 0)}
          data-visible={String(offset === 0 || offset === 1)}
          data-loop-copy="false"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 whitespace-nowrap text-[clamp(18px,6vw,27px)] leading-none tracking-[-0.045em] text-foreground [will-change:transform,opacity]"
          style={{
            fontWeight: offset === 0 ? 740 : 520,
            opacity: offset === 0 ? 1 : offset === 1 ? FADED_OPACITY : 0,
            visibility:
              offset === 0 || offset === 1 ? "visible" : "hidden",
          }}
        >
          {labelAt(0, offset)}
        </span>
      ))}
    </div>
  );
});
