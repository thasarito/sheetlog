import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import {
  DashboardTitleReel,
  type DashboardTitleDirection,
  type DashboardTitleReelHandle,
} from "./DashboardTitleReel";

type HeaderProps = {
  overlayDashboard?: boolean;
  [key: string]: unknown;
};

export type DashboardHeaderMotionHandle = {
  resetHorizontalSelection?: () => void;
  setHorizontalMotion: (
    direction: DashboardTitleDirection,
    progress: number,
  ) => void;
  settleHorizontalMotion?: (committedSteps: number) => void;
  setVerticalProgress: (progress: number) => void;
};

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export const Header = forwardRef<DashboardHeaderMotionHandle, HeaderProps>(
  function Header({ overlayDashboard = false }, forwardedRef) {
    const headerRef = useRef<HTMLDivElement>(null);
    const titleReelRef = useRef<DashboardTitleReelHandle>(null);
    const verticalProgressRef = useRef(0);

    const setVerticalProgress = useCallback((incomingProgress: number) => {
      const header = headerRef.current;
      if (!header) return;
      const progress = clampProgress(incomingProgress);
      verticalProgressRef.current = progress;
      const height = header.getBoundingClientRect().height || 68;
      header.style.transform = `translate3d(0, ${(-height * progress).toFixed(2)}px, 0)`;
      header.style.opacity = String(1 - progress);
      header.style.pointerEvents = progress > 0.96 ? "none" : "auto";
      header.dataset.hideProgress = progress.toFixed(3);
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({
        resetHorizontalSelection() {
          titleReelRef.current?.resetHorizontalSelection();
        },
        setHorizontalMotion(direction, progress) {
          titleReelRef.current?.setHorizontalMotion(direction, progress);
        },
        settleHorizontalMotion(committedSteps) {
          titleReelRef.current?.settleHorizontalMotion(committedSteps);
        },
        setVerticalProgress,
      }),
      [setVerticalProgress],
    );

    useLayoutEffect(() => {
      setVerticalProgress(verticalProgressRef.current);
      const header = headerRef.current;
      if (!header || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() =>
        setVerticalProgress(verticalProgressRef.current),
      );
      observer.observe(header);
      return () => observer.disconnect();
    }, [setVerticalProgress]);

    useEffect(() => {
      if (!overlayDashboard) setVerticalProgress(0);
    }, [overlayDashboard, setVerticalProgress]);

    return (
      <header
        className={`${overlayDashboard ? "absolute inset-x-0 top-0" : "relative shrink-0"} pointer-events-none h-[68px] w-full`}
      >
        <div
          ref={headerRef}
          data-testid="dashboard-header"
          data-hide-progress="0.000"
          className="pointer-events-auto relative z-30 h-full w-full bg-background/95 [will-change:transform,opacity]"
          style={{ transform: "translate3d(0, 0.00px, 0)", opacity: 1 }}
        >
          <DashboardTitleReel ref={titleReelRef} />
        </div>
      </header>
    );
  },
);
