import type React from 'react';
import { Pointer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { IphoneFrameProvider } from './IphoneFrameContext';

// Reference iPhone 14 Pro screen dimensions (inside the frame, after insets)
const REFERENCE_SCREEN_WIDTH = 373; // 393 - 20 (10px inset on each side)
const REFERENCE_SCREEN_HEIGHT = 832; // 852 - 20 (10px inset on each side)

type IphoneFrameRenderProps = {
  screen: HTMLDivElement | null;
  scale: number;
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
  // The "screen" ref is now the drawer portal container inside the scaled wrapper
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const frameRef = useRef<HTMLDivElement>(null);

  const setScreenRef = useCallback((node: HTMLDivElement | null) => {
    setScreen((prev) => (prev === node ? prev : node));
  }, []);

  const [isInteractive, setIsInteractive] = useState(() => !tapToStart);

  // Calculate scale based on frame width
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const frameWidth = frame.offsetWidth;
      // Calculate the screen width (frame width minus insets)
      const screenWidth = frameWidth * (REFERENCE_SCREEN_WIDTH / 393);
      const newScale = screenWidth / REFERENCE_SCREEN_WIDTH;
      setScale(newScale);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(frame);

    return () => resizeObserver.disconnect();
  }, []);

  const resolvedChildren = useMemo(() => {
    return typeof children === 'function' ? children({ screen, scale }) : children;
  }, [children, screen, scale]);

  // iPhone 14 Pro dimensions: 393 x 852 logical pixels
  // Using Tailwind responsive classes for proper scaling at different sizes
  return (
    <div
      ref={frameRef}
      className={cn('relative aspect-[393/852] w-full', className)}
      role="img"
      aria-label="iPhone 17 frame"
      style={{
        '--iphone-scale': scale,
      } as React.CSSProperties}
    >
      {/* Outer frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 border border-border bg-[linear-gradient(145deg,hsl(var(--surface))_0%,hsl(var(--background))_45%,hsl(var(--surface-2))_100%)]"
        style={{ borderRadius: `${Math.round(72 * scale)}px` }}
      />

      {/* Inner bezel */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute border border-border/80 bg-background"
        style={{
          inset: `${Math.round(6 * scale)}px`,
          borderRadius: `${Math.round(66 * scale)}px`,
        }}
      />

      {/* Screen */}
      <div
        data-testid="iphone-frame-screen"
        className={cn(
          'absolute overflow-hidden bg-background',
          screenClassName,
        )}
        style={{
          inset: `${Math.round(10 * scale)}px`,
          borderRadius: `${Math.round(60 * scale)}px`,
        }}
      >
        {/* Content wrapper that scales the children */}
        <IphoneFrameProvider value={{ scale, isInsideFrame: true }}>
          <div
            className="relative h-full w-full origin-top-left"
            style={{
              width: `${REFERENCE_SCREEN_WIDTH}px`,
              height: `${REFERENCE_SCREEN_HEIGHT}px`,
              transform: `scale(${scale})`,
            }}
          >
            {/* Safe area padding - notch area top, home indicator bottom */}
            <div className="h-full w-full pt-[48px] pb-[34px]">
              {resolvedChildren}
            </div>
            {/* Drawer portal container - inside scaled wrapper so drawers scale correctly */}
            <div
              ref={setScreenRef}
              className="pointer-events-none absolute inset-0 z-30 [&>*]:pointer-events-auto"
            />
          </div>
        </IphoneFrameProvider>

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
            <span
              className="flex flex-col items-center gap-3"
              style={{
                maxWidth: `${240 * scale}px`,
                transform: `scale(${scale})`,
              }}
            >
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

      {/* Dynamic Island */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border border-foreground/10 bg-foreground/15 backdrop-blur"
        style={{
          top: `${Math.round(14 * scale)}px`,
          width: `${Math.round(120 * scale)}px`,
          height: `${Math.round(32 * scale)}px`,
        }}
      />
      {/* Camera dot */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[58%] -translate-x-1/2 rounded-full bg-foreground/20"
        style={{
          top: `${Math.round(24 * scale)}px`,
          width: `${Math.round(6 * scale)}px`,
          height: `${Math.round(6 * scale)}px`,
        }}
      />
    </div>
  );
}
