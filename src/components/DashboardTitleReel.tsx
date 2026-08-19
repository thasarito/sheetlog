import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { DASHBOARD_SLIDES } from "./dashboardSlides";

const LABELS = DASHBOARD_SLIDES;
const REEL_OFFSETS = [-2, -1, 0, 1, 2] as const;

export type DashboardTitleReelHandle = {
  setHorizontalMotion: (settledIndex: number, progress: number) => void;
};

type ReelMotion = {
  settledIndex: number;
  progress: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function labelAt(settledIndex: number, offset: number): string {
  const index =
    (settledIndex + offset + LABELS.length * 4) % LABELS.length;
  return LABELS[index];
}

export const DashboardTitleReel = forwardRef<
  DashboardTitleReelHandle,
  object
>(function DashboardTitleReel(_props, forwardedRef) {
  const reelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<number, HTMLSpanElement>());
  const motionRef = useRef<ReelMotion>({ settledIndex: 0, progress: 0 });

  const renderMotion = useCallback(
    ({ settledIndex, progress }: ReelMotion) => {
      const reel = reelRef.current;
      if (!reel) return;

      const boundedProgress = clamp(progress, -1, 1);
      const transition = Math.abs(boundedProgress);

      for (const offset of REEL_OFFSETS) {
        const item = itemRefs.current.get(offset);
        if (!item) continue;
        item.textContent = labelAt(settledIndex, offset);
        item.dataset.label = item.textContent;

        const distance = Math.min(1, Math.abs(offset - boundedProgress));
        let opacity = 0;
        if (boundedProgress >= 0) {
          if (offset === 0) opacity = 1 - transition * 0.66;
          if (offset === 1) opacity = 0.34 + transition * 0.66;
          if (offset === 2) opacity = transition * 0.34;
        } else {
          if (offset === -1) opacity = 0.34 + transition * 0.66;
          if (offset === 0) opacity = 1 - transition * 0.66;
          if (offset === 1) opacity = (1 - transition) * 0.34;
        }

        item.dataset.active = String(distance < 0.001);
        item.style.opacity = String(opacity);
        item.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
        item.style.fontWeight = String(
          Math.round(520 + (1 - distance) * 220),
        );
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
      for (let offset = 1; offset <= 2; offset += 1) {
        positions.set(
          offset,
          (positions.get(offset - 1) ?? 0) +
            (widths.get(offset - 1) ?? 0) +
            gap,
        );
      }
      for (let offset = -1; offset >= -2; offset -= 1) {
        positions.set(
          offset,
          (positions.get(offset + 1) ?? 0) -
            (widths.get(offset) ?? 0) -
            gap,
        );
      }

      const enteringOffset = boundedProgress >= 0 ? 1 : -1;
      const shift = -transition * (positions.get(enteringOffset) ?? 0);
      for (const offset of REEL_OFFSETS) {
        const item = itemRefs.current.get(offset);
        if (!item) continue;
        const x = (positions.get(offset) ?? 0) + shift;
        item.style.transform = `translate3d(${x.toFixed(2)}px, -50%, 0)`;
      }

      reel.dataset.gap = gap.toFixed(2);
      reel.dataset.progress = boundedProgress.toFixed(3);
      reel.dataset.direction =
        boundedProgress > 0.001
          ? "forward"
          : boundedProgress < -0.001
            ? "backward"
            : "settled";
    },
    [],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      setHorizontalMotion(settledIndex, progress) {
        const motion = { settledIndex, progress };
        motionRef.current = motion;
        renderMotion(motion);
      },
    }),
    [renderMotion],
  );

  useLayoutEffect(() => {
    renderMotion(motionRef.current);
    const reel = reelRef.current;
    if (!reel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => renderMotion(motionRef.current));
    observer.observe(reel);
    return () => observer.disconnect();
  }, [renderMotion]);

  return (
    <div
      ref={reelRef}
      data-testid="dashboard-title-reel"
      data-direction="settled"
      data-gap="10.00"
      data-progress="0.000"
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
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 whitespace-nowrap text-[clamp(18px,6vw,27px)] leading-none tracking-[-0.045em] text-foreground [will-change:transform,opacity]"
          style={{
            fontWeight: offset === 0 ? 740 : 520,
            opacity: offset === 0 ? 1 : offset === 1 ? 0.34 : 0,
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
