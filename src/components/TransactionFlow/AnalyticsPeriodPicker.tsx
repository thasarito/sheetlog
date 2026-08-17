import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '../../lib/utils';
import type { AnalyticsPeriodOption } from './analytics';

type AnalyticsPeriodPickerProps = {
  options: AnalyticsPeriodOption[];
  value: number;
  onChange: (offset: number) => void;
  className?: string;
};

const SCROLL_SETTLE_DELAY_MS = 80;

export function AnalyticsPeriodPicker({
  options,
  value,
  onChange,
  className,
}: AnalyticsPeriodPickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticTargetRef = useRef<number | null>(null);
  const touchDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    axis: 'horizontal' | 'vertical' | null;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const selectedIndex = useMemo(() => {
    const index = options.findIndex((option) => option.offset === value);
    return index >= 0 ? index : Math.max(0, options.length - 1);
  }, [options, value]);
  const previous = options[selectedIndex - 1];
  const next = options[selectedIndex + 1];

  const selectIndex = useCallback(
    (index: number) => {
      const option = options[index];
      if (option && option.offset !== value) onChange(option.offset);
    },
    [onChange, options, value],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const option = optionRefs.current[selectedIndex];
    if (!viewport || !option || typeof viewport.scrollTo !== 'function') return;

    const targetLeft = Math.max(
      0,
      Math.min(
        option.offsetLeft - (viewport.clientWidth - option.offsetWidth) / 2,
        Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      ),
    );
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
    programmaticTargetRef.current = targetLeft;
    viewport.scrollTo({ left: targetLeft, behavior: 'auto' });
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
      if (clickResetTimerRef.current !== null) clearTimeout(clickResetTimerRef.current);
    },
    [],
  );

  const scheduleNearestSelection = useCallback(() => {
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const center = viewport.scrollLeft + viewport.clientWidth / 2;
      let nearestIndex = selectedIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;
      optionRefs.current.forEach((option, index) => {
        if (!option) return;
        const optionCenter = option.offsetLeft + option.offsetWidth / 2;
        const distance = Math.abs(optionCenter - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      selectIndex(nearestIndex);
    }, SCROLL_SETTLE_DELAY_MS);
  }, [selectIndex, selectedIndex]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const programmaticTarget = programmaticTargetRef.current;
    if (programmaticTarget !== null) {
      programmaticTargetRef.current = null;
      if (Math.abs(viewport.scrollLeft - programmaticTarget) <= 1) return;
    }
    if (touchDragRef.current?.axis === 'horizontal') return;
    scheduleNearestSelection();
  }, [scheduleNearestSelection]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (clickResetTimerRef.current !== null) clearTimeout(clickResetTimerRef.current);
    programmaticTargetRef.current = null;
    suppressClickRef.current = false;
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    touchDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      axis: null,
    };
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchDragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.axis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return;
      drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }
    if (drag.axis !== 'horizontal') return;

    event.preventDefault();
    suppressClickRef.current = true;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, drag.startScrollLeft - deltaX));
  }, []);

  const finishPointerGesture = useCallback(() => {
    const drag = touchDragRef.current;
    touchDragRef.current = null;
    if (drag?.axis === 'horizontal') scheduleNearestSelection();
    if (clickResetTimerRef.current !== null) clearTimeout(clickResetTimerRef.current);
    clickResetTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [scheduleNearestSelection]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const targetIndex =
        event.key === 'ArrowLeft'
          ? selectedIndex - 1
          : event.key === 'ArrowRight'
            ? selectedIndex + 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? options.length - 1
                : null;
      if (targetIndex === null) return;
      event.preventDefault();
      selectIndex(targetIndex);
    },
    [options.length, selectIndex, selectedIndex],
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
        onClick={() => selectIndex(selectedIndex - 1)}
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
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={finishPointerGesture}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        className="min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [touch-action:pan-y] [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
        }}
      >
        <div className="flex min-w-max px-[calc(50%-4rem)]">
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
                onClick={() => selectIndex(index)}
                className={cn(
                  'h-11 w-32 shrink-0 snap-center rounded-lg px-2 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
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
        onClick={() => selectIndex(selectedIndex + 1)}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
