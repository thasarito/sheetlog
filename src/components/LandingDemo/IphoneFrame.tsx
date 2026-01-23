import type React from 'react';
import { Pointer } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type IphoneFrameRenderProps = {
  screen: HTMLDivElement | null;
};

type IphoneFrameProps = {
  children: React.ReactNode | ((props: IphoneFrameRenderProps) => React.ReactNode);
  className?: string;
  screenClassName?: string;
  tapToStart?: boolean;
};

export function IphoneFrame({
  children,
  className,
  screenClassName,
  tapToStart = false,
}: IphoneFrameProps) {
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const setScreenRef = useCallback((node: HTMLDivElement | null) => {
    setScreen((prev) => (prev === node ? prev : node));
  }, []);

  const [isInteractive, setIsInteractive] = useState(() => !tapToStart);

  const resolvedChildren = useMemo(() => {
    return typeof children === 'function' ? children({ screen }) : children;
  }, [children, screen]);

  return (
    <div
      className={cn('relative aspect-[393/852] w-full', className)}
      role="img"
      aria-label="iPhone 17 frame"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[72px] border border-border bg-[linear-gradient(145deg,hsl(var(--surface))_0%,hsl(var(--background))_45%,hsl(var(--surface-2))_100%)]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[6px] rounded-[66px] border border-border/80 bg-background"
      />

      <div
        data-testid="iphone-frame-screen"
        ref={setScreenRef}
        className={cn(
          'absolute inset-[10px] overflow-hidden rounded-[60px] bg-background',
          screenClassName,
        )}
      >
        <div className="h-full w-full pt-[max(env(safe-area-inset-top),44px)] pb-[max(env(safe-area-inset-bottom),34px)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] [@media(max-height:650px)]:pt-0 [@media(max-height:650px)]:pb-0">
          {resolvedChildren}
        </div>
        {tapToStart && !isInteractive ? (
          <button
            type="button"
            aria-label="Activate demo"
            className="absolute inset-0 z-40 flex items-center justify-center bg-background/55 px-6 text-center backdrop-blur-sm"
            onClick={(event) => {
              const frame = (event.currentTarget as HTMLElement).closest<HTMLElement>(
                '[role="img"][aria-label="iPhone 17 frame"]',
              );
              frame?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              setIsInteractive(true);
            }}
          >
            <span className="flex max-w-[240px] flex-col items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
                <Pointer className="h-6 w-6 text-primary" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Tap to activate
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Tap the iPhone screen once before the demo becomes interactive.
                </span>
              </span>
            </span>
          </button>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[14px] left-1/2 h-[32px] w-[120px] -translate-x-1/2 rounded-full border border-foreground/10 bg-foreground/15 backdrop-blur"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[24px] left-[58%] h-[6px] w-[6px] -translate-x-1/2 rounded-full bg-foreground/20"
      />
    </div>
  );
}
