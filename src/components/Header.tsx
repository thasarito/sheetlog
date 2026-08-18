import { Settings } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  DashboardTitleReel,
  type DashboardTitleReelHandle,
} from './DashboardTitleReel';
import { SettingsDrawer } from './SettingsDrawer';
import type { AnalyticsSyncController } from './TransactionFlow/useAnalyticsSync';

type HeaderProps = {
  showSettings?: boolean;
  onToast?: (message: string) => void;
  analyticsSync?: AnalyticsSyncController;
  overlayDashboard?: boolean;
};

export type DashboardHeaderMotionHandle = {
  setHorizontalMotion: (settledIndex: number, progress: number) => void;
  setVerticalProgress: (progress: number) => void;
};

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export const Header = forwardRef<DashboardHeaderMotionHandle, HeaderProps>(function Header({
  showSettings = false,
  onToast,
  analyticsSync,
  overlayDashboard = false,
}, forwardedRef) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
    header.style.pointerEvents = progress > 0.96 ? 'none' : 'auto';
    header.dataset.hideProgress = progress.toFixed(3);
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      setHorizontalMotion(settledIndex, progress) {
        titleReelRef.current?.setHorizontalMotion(settledIndex, progress);
      },
      setVerticalProgress,
    }),
    [setVerticalProgress],
  );

  useLayoutEffect(() => {
    setVerticalProgress(verticalProgressRef.current);
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
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
      className={`${overlayDashboard ? 'absolute inset-x-0 top-0' : 'relative shrink-0'} pointer-events-none h-[68px] w-full`}
    >
      <div
        ref={headerRef}
        data-testid="dashboard-header"
        data-hide-progress="0.000"
        className="pointer-events-auto relative z-30 h-full w-full bg-background/95 [will-change:transform,opacity]"
        style={{ transform: 'translate3d(0, 0.00px, 0)', opacity: 1 }}
      >
        <DashboardTitleReel ref={titleReelRef} />

        {showSettings && (
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Open settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        )}
      </div>

      {showSettings && onToast && analyticsSync && (
        <div className="pointer-events-auto">
          <SettingsDrawer
            open={isDrawerOpen}
            onOpenChange={setIsDrawerOpen}
            onToast={onToast}
            analyticsSync={analyticsSync}
          />
        </div>
      )}
    </header>
  );
});
