import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/utils';
import type { AnalyticsPeriodOption } from './analytics';

type AnalyticsPeriodPickerProps = {
  options: AnalyticsPeriodOption[];
  value: number;
  onChange: (offset: number) => void;
  className?: string;
};

type TouchDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  startTranslate: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  axis: 'horizontal' | 'vertical' | null;
};

const AXIS_LOCK_THRESHOLD_PX = 6;
const CENTER_DURATION_MS = 240;
const MOMENTUM_DECAY = 0.95;
const MOMENTUM_MAX_DURATION_MS = 520;
const MOMENTUM_MIN_VELOCITY = 0.02;
const WHEEL_SETTLE_DELAY_MS = 120;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function AnalyticsPeriodPicker({
  options,
  value,
  onChange,
  className,
}: AnalyticsPeriodPickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const translateRef = useRef(0);
  const pendingDragTranslateRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const motionFrameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const clickResetTimerRef = useRef<number | null>(null);
  const touchDragRef = useRef<TouchDrag | null>(null);
  const suppressClickRef = useRef(false);
  const optionsRef = useRef(options);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  optionsRef.current = options;
  valueRef.current = value;
  onChangeRef.current = onChange;

  const selectedIndex = useMemo(() => {
    const index = options.findIndex((option) => option.offset === value);
    return index >= 0 ? index : Math.max(0, options.length - 1);
  }, [options, value]);
  const controlledIndexRef = useRef(selectedIndex);
  controlledIndexRef.current = selectedIndex;
  const pendingIndexRef = useRef(selectedIndex);
  const [navigationIndex, setNavigationIndex] = useState(selectedIndex);
  const previous = options[navigationIndex - 1];
  const next = options[navigationIndex + 1];

  const applyTranslate = useCallback((nextTranslate: number) => {
    translateRef.current = nextTranslate;
    trackRef.current?.style.setProperty(
      'transform',
      `translate3d(${nextTranslate}px, 0, 0)`,
    );
  }, []);

  const centeredTranslate = useCallback((index: number) => {
    const viewport = viewportRef.current;
    const option = optionRefs.current[index];
    if (!viewport || !option) return translateRef.current;
    return viewport.clientWidth / 2 - (option.offsetLeft + option.offsetWidth / 2);
  }, []);

  const getBounds = useCallback(() => {
    if (optionsRef.current.length === 0) return { min: 0, max: 0 };
    return {
      min: centeredTranslate(optionsRef.current.length - 1),
      max: centeredTranslate(0),
    };
  }, [centeredTranslate]);

  const applyEdgeResistance = useCallback(
    (nextTranslate: number) => {
      const { min, max } = getBounds();
      if (nextTranslate > max) return max + (nextTranslate - max) * 0.3;
      if (nextTranslate < min) return min + (nextTranslate - min) * 0.3;
      return nextTranslate;
    },
    [getBounds],
  );

  const cancelMotion = useCallback(() => {
    if (motionFrameRef.current !== null) {
      window.cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }
  }, []);

  const cancelDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragTranslateRef.current = null;
  }, []);

  const flushDragTranslate = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const pendingTranslate = pendingDragTranslateRef.current;
    pendingDragTranslateRef.current = null;
    if (pendingTranslate !== null) applyTranslate(pendingTranslate);
  }, [applyTranslate]);

  const scheduleDragTranslate = useCallback(
    (nextTranslate: number) => {
      pendingDragTranslateRef.current = nextTranslate;
      if (dragFrameRef.current !== null) return;
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const pendingTranslate = pendingDragTranslateRef.current;
        pendingDragTranslateRef.current = null;
        if (pendingTranslate !== null) applyTranslate(pendingTranslate);
      });
    },
    [applyTranslate],
  );

  const clearWheelTimer = useCallback(() => {
    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
  }, []);

  const commitIndex = useCallback((index: number) => {
    const option = optionsRef.current[index];
    if (!option) return;
    pendingIndexRef.current = index;
    setNavigationIndex(index);
    if (option.offset !== valueRef.current) onChangeRef.current(option.offset);
  }, []);

  const centerIndex = useCallback(
    (requestedIndex: number, commit: boolean) => {
      const lastIndex = optionsRef.current.length - 1;
      if (lastIndex < 0) return;
      const index = Math.max(0, Math.min(lastIndex, requestedIndex));
      cancelMotion();
      clearWheelTimer();
      pendingIndexRef.current = index;
      setNavigationIndex(index);

      const from = translateRef.current;
      const to = centeredTranslate(index);
      if (prefersReducedMotion() || Math.abs(to - from) < 0.5) {
        applyTranslate(to);
        if (commit) commitIndex(index);
        return;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - startedAt) / CENTER_DURATION_MS));
        const eased = 1 - (1 - progress) ** 3;
        applyTranslate(from + (to - from) * eased);
        if (progress < 1) {
          motionFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        motionFrameRef.current = null;
        if (commit) commitIndex(index);
      };
      motionFrameRef.current = window.requestAnimationFrame(step);
    },
    [applyTranslate, cancelMotion, centeredTranslate, clearWheelTimer, commitIndex],
  );

  const nearestIndex = useCallback(() => {
    let nearest = controlledIndexRef.current;
    let nearestDistance = Number.POSITIVE_INFINITY;
    optionsRef.current.forEach((_option, index) => {
      const distance = Math.abs(centeredTranslate(index) - translateRef.current);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    return nearest;
  }, [centeredTranslate]);

  const settleNearest = useCallback(() => {
    centerIndex(nearestIndex(), true);
  }, [centerIndex, nearestIndex]);

  const startMomentum = useCallback(
    (initialVelocity: number) => {
      if (prefersReducedMotion()) {
        settleNearest();
        return;
      }
      cancelMotion();
      let velocity = initialVelocity;
      let lastTime = performance.now();
      const startedAt = lastTime;

      const step = (now: number) => {
        const elapsed = Math.max(1, Math.min(32, now - lastTime));
        lastTime = now;
        const { min, max } = getBounds();
        const rawTranslate = translateRef.current + velocity * elapsed;
        const beyondBounds = rawTranslate < min || rawTranslate > max;
        applyTranslate(applyEdgeResistance(rawTranslate));
        velocity *= MOMENTUM_DECAY ** (elapsed / 16);
        if (beyondBounds) velocity *= 0.6;

        if (
          Math.abs(velocity) < MOMENTUM_MIN_VELOCITY ||
          now - startedAt >= MOMENTUM_MAX_DURATION_MS
        ) {
          motionFrameRef.current = null;
          settleNearest();
          return;
        }
        motionFrameRef.current = window.requestAnimationFrame(step);
      };
      motionFrameRef.current = window.requestAnimationFrame(step);
    },
    [applyEdgeResistance, applyTranslate, cancelMotion, getBounds, settleNearest],
  );

  const syncToControlled = useCallback(() => {
    cancelMotion();
    clearWheelTimer();
    cancelDragFrame();
    pendingIndexRef.current = selectedIndex;
    setNavigationIndex(selectedIndex);
    applyTranslate(centeredTranslate(selectedIndex));
  }, [
    applyTranslate,
    cancelDragFrame,
    cancelMotion,
    centeredTranslate,
    clearWheelTimer,
    selectedIndex,
  ]);

  useLayoutEffect(() => {
    optionRefs.current.length = options.length;
    syncToControlled();
  }, [options.length, syncToControlled]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const handleResize = () => {
      if (touchDragRef.current) return;
      syncToControlled();
    };
    window.addEventListener('resize', handleResize);
    const observer = viewport ? new ResizeObserver(handleResize) : null;
    if (viewport) observer?.observe(viewport);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [syncToControlled]);

  useEffect(
    () => () => {
      cancelMotion();
      cancelDragFrame();
      clearWheelTimer();
      if (clickResetTimerRef.current !== null) {
        window.clearTimeout(clickResetTimerRef.current);
      }
    },
    [cancelDragFrame, cancelMotion, clearWheelTimer],
  );

  const navigateToIndex = useCallback(
    (index: number) => {
      touchDragRef.current = null;
      cancelDragFrame();
      centerIndex(index, true);
    },
    [cancelDragFrame, centerIndex],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'touch') return;
      cancelMotion();
      clearWheelTimer();
      cancelDragFrame();
      if (clickResetTimerRef.current !== null) {
        window.clearTimeout(clickResetTimerRef.current);
      }
      suppressClickRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      touchDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTranslate: translateRef.current,
        lastX: event.clientX,
        lastTime: performance.now(),
        velocity: 0,
        axis: null,
      };
    },
    [cancelDragFrame, cancelMotion, clearWheelTimer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = touchDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (drag.axis === null) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_THRESHOLD_PX) return;
        drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
      if (drag.axis !== 'horizontal') return;

      event.preventDefault();
      suppressClickRef.current = true;
      const now = performance.now();
      const elapsed = now - drag.lastTime;
      if (elapsed > 0) {
        const instantVelocity = (event.clientX - drag.lastX) / elapsed;
        drag.velocity = drag.velocity * 0.75 + instantVelocity * 0.25;
        drag.lastX = event.clientX;
        drag.lastTime = now;
      }
      scheduleDragTranslate(applyEdgeResistance(drag.startTranslate + deltaX));
    },
    [applyEdgeResistance, scheduleDragTranslate],
  );

  const finishPointerGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const drag = touchDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      touchDragRef.current = null;
      if (
        typeof event.currentTarget.hasPointerCapture === 'function' &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (cancelled) {
        cancelDragFrame();
        centerIndex(controlledIndexRef.current, false);
      } else if (drag.axis === 'horizontal') {
        flushDragTranslate();
        if (Math.abs(drag.velocity) > MOMENTUM_MIN_VELOCITY) {
          startMomentum(drag.velocity);
        } else {
          settleNearest();
        }
      }

      if (clickResetTimerRef.current !== null) {
        window.clearTimeout(clickResetTimerRef.current);
      }
      clickResetTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    },
    [cancelDragFrame, centerIndex, flushDragTranslate, settleNearest, startMomentum],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const horizontalDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0;
      if (horizontalDelta === 0) return;
      event.preventDefault();
      cancelMotion();
      clearWheelTimer();
      applyTranslate(
        applyEdgeResistance(translateRef.current - horizontalDelta),
      );
      wheelTimerRef.current = window.setTimeout(() => {
        wheelTimerRef.current = null;
        settleNearest();
      }, WHEEL_SETTLE_DELAY_MS);
    },
    [applyEdgeResistance, applyTranslate, cancelMotion, clearWheelTimer, settleNearest],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = pendingIndexRef.current;
      const targetIndex =
        event.key === 'ArrowLeft'
          ? currentIndex - 1
          : event.key === 'ArrowRight'
            ? currentIndex + 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? optionsRef.current.length - 1
                : null;
      if (targetIndex === null) return;
      event.preventDefault();
      navigateToIndex(targetIndex);
    },
    [navigateToIndex],
  );

  if (options.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <button
        type="button"
        aria-label={
          previous ? `Previous period, ${previous.accessibleLabel}` : 'Previous period'
        }
        disabled={!previous}
        onClick={() => navigateToIndex(pendingIndexRef.current - 1)}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        ref={viewportRef}
        data-testid="analytics-period-picker"
        data-home-carousel-swipe-lock="true"
        role="listbox"
        aria-label="Analytics period"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event, false)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        onWheel={handleWheel}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        className="min-w-0 flex-1 overflow-hidden overscroll-x-contain [touch-action:pan-y]"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
        }}
      >
        <div
          ref={trackRef}
          data-testid="analytics-period-track"
          className="flex min-w-max will-change-transform"
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex;
            return (
              <button
                key={option.key}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                data-period-offset={option.offset}
                aria-selected={selected}
                aria-label={option.accessibleLabel}
                onClick={() => navigateToIndex(index)}
                className={cn(
                  'h-11 w-32 shrink-0 rounded-lg px-2 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  selected
                    ? 'font-semibold text-primary'
                    : 'font-medium text-muted-foreground/45 hover:text-muted-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-label={next ? `Next period, ${next.accessibleLabel}` : 'Next period'}
        disabled={!next}
        onClick={() => navigateToIndex(pendingIndexRef.current + 1)}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
