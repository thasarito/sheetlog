import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import type { DashboardHeaderMotionHandle } from '../Header';
import type { TransactionHistoryDockMotionHandle } from './TransactionHistoryDock';
import {
  clampSignedProgress,
  DASHBOARD_SLIDES,
  directionFrom,
  easeOutCubic,
  headerCollapseProgress,
  HEADER_COLLAPSE_DISTANCE,
  HORIZONTAL_GESTURE_THRESHOLD,
  SETTLE_DURATION_MS,
  shouldCommitSwipe,
  slidePosition,
  type CarouselDirection,
  wrappedSlideIndex,
} from './homeDashboardCarouselMotion';

type HorizontalMotion = {
  active: boolean;
  origin: number;
  direction: CarouselDirection;
  progress: number;
};

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  horizontal: boolean;
  vertical: boolean;
};

type UseHomeDashboardCarouselMotionOptions = {
  headerMotionRef?: RefObject<DashboardHeaderMotionHandle | null>;
};

const CAROUSEL_FOCUS_NODE_NAMES = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function blocksCarouselDrag(target: EventTarget | null): boolean {
  return (
    (target instanceof Element &&
      target.closest('[data-home-carousel-swipe-lock="true"]') !== null) ||
    (target instanceof Element &&
      CAROUSEL_FOCUS_NODE_NAMES.has(target.nodeName))
  );
}

function eventTimestamp(timeStamp: number): number {
  return timeStamp > 0 ? timeStamp : window.performance.now();
}

export function useHomeDashboardCarouselMotion({
  headerMotionRef,
}: UseHomeDashboardCarouselMotionOptions) {
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const transactionDockMotionRef =
    useRef<TransactionHistoryDockMotionHandle | null>(null);
  const activeIndexRef = useRef(0);
  const verticalProgressRef = useRef([0, 0]);
  const horizontalMotionRef = useRef<HorizontalMotion>({
    active: false,
    origin: 0,
    direction: 0,
    progress: 0,
  });
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickResetRef = useRef<number | null>(null);

  const renderHorizontalMotion = useCallback(
    (motion: HorizontalMotion, moving: boolean) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const progress = clampSignedProgress(motion.progress);
      const direction = motion.direction || directionFrom(progress);

      for (const [index, slide] of slideRefs.current.entries()) {
        if (!slide) continue;
        const position = slidePosition(
          index,
          motion.origin,
          progress,
          direction,
        );
        slide.style.transform = `translate3d(${(position * 100).toFixed(3)}%, 0, 0)`;
      }

      headerMotionRef?.current?.setHorizontalMotion(motion.origin, progress);

      const viewportWidth =
        viewport.clientWidth || viewport.getBoundingClientRect().width;
      if (viewportWidth > 0) {
        const transactionPosition = slidePosition(
          1,
          motion.origin,
          progress,
          direction,
        );
        transactionDockMotionRef.current?.setMotion({
          x: transactionPosition * viewportWidth,
          viewportWidth,
          interactive: !moving && motion.origin === 1,
          moving,
        });
      }

      viewport.dataset.inputDirection =
        direction > 0
          ? 'forward'
          : direction < 0
            ? 'backward'
            : 'none';
      viewport.dataset.motionProgress = progress.toFixed(3);
      viewport.dataset.motionStatus = moving ? 'moving' : 'settled';
      viewport.dataset.targetSnap = String(
        direction === 0
          ? motion.origin
          : wrappedSlideIndex(motion.origin + direction),
      );
    },
    [headerMotionRef],
  );

  const commitActiveIndex = useCallback(
    (index: number) => {
      const settledMotion: HorizontalMotion = {
        active: false,
        origin: index,
        direction: 0,
        progress: 0,
      };
      activeIndexRef.current = index;
      horizontalMotionRef.current = settledMotion;
      setActiveIndex(index);
      for (const [slideIndex, slide] of slideRefs.current.entries()) {
        if (slide) slide.inert = slideIndex !== index;
      }
      renderHorizontalMotion(settledMotion, false);
      headerMotionRef?.current?.setVerticalProgress(
        verticalProgressRef.current[index] ?? 0,
      );
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.dataset.selectedSnap = String(index);
        viewport.dataset.targetSnap = String(index);
      }
    },
    [headerMotionRef, renderHorizontalMotion],
  );

  const settleHorizontalMotion = useCallback(
    (origin: number, direction: CarouselDirection, committed: boolean) => {
      const viewport = viewportRef.current;
      if (viewport && committed && direction !== 0) {
        viewport.dataset.lastSettledDirection =
          direction > 0 ? 'forward' : 'backward';
      }
      commitActiveIndex(
        committed && direction !== 0
          ? wrappedSlideIndex(origin + direction)
          : origin,
      );
    },
    [commitActiveIndex],
  );

  const animateHorizontalMotion = useCallback(
    ({
      origin,
      direction,
      from,
      to,
      onComplete,
    }: {
      origin: number;
      direction: CarouselDirection;
      from: number;
      to: number;
      onComplete: () => void;
    }) => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const renderProgress = (progress: number) => {
        const motion: HorizontalMotion = {
          active: true,
          origin,
          direction,
          progress,
        };
        horizontalMotionRef.current = motion;
        renderHorizontalMotion(motion, true);
      };

      if (prefersReducedMotion() || Math.abs(to - from) < 0.001) {
        renderProgress(to);
        onComplete();
        return;
      }

      const startedAt = window.performance.now();
      const duration = Math.max(
        120,
        SETTLE_DURATION_MS * Math.abs(to - from),
      );
      const animate = (timestamp: number) => {
        const elapsed = Math.min(1, (timestamp - startedAt) / duration);
        renderProgress(from + (to - from) * easeOutCubic(elapsed));
        if (elapsed < 1) {
          animationFrameRef.current = window.requestAnimationFrame(animate);
          return;
        }
        animationFrameRef.current = null;
        onComplete();
      };
      animationFrameRef.current = window.requestAnimationFrame(animate);
    },
    [renderHorizontalMotion],
  );

  const releasePointerGesture = useCallback((delayClickReset: boolean) => {
    pointerGestureRef.current = null;
    if (suppressClickResetRef.current !== null) {
      window.clearTimeout(suppressClickResetRef.current);
      suppressClickResetRef.current = null;
    }
    if (!delayClickReset) {
      suppressClickRef.current = false;
      return;
    }
    suppressClickResetRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickResetRef.current = null;
    }, 0);
  }, []);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (
        animationFrameRef.current !== null ||
        pointerGestureRef.current !== null
      ) {
        return;
      }
      const origin = activeIndexRef.current;
      const motion: HorizontalMotion = {
        active: true,
        origin,
        direction,
        progress: 0,
      };
      horizontalMotionRef.current = motion;
      renderHorizontalMotion(motion, true);
      animateHorizontalMotion({
        origin,
        direction,
        from: 0,
        to: direction,
        onComplete: () => settleHorizontalMotion(origin, direction, true),
      });
    },
    [animateHorizontalMotion, renderHorizontalMotion, settleHorizontalMotion],
  );

  useEffect(() => {
    for (const [index, slide] of slideRefs.current.entries()) {
      if (slide) slide.inert = index !== activeIndex;
    }
  }, [activeIndex]);

  useLayoutEffect(() => {
    const renderCurrentMotion = () => {
      const motion = horizontalMotionRef.current;
      renderHorizontalMotion(motion, motion.active);
    };
    renderCurrentMotion();
    const viewport = viewportRef.current;
    const observer =
      viewport && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(renderCurrentMotion)
        : null;
    if (viewport) observer?.observe(viewport);
    window.addEventListener('resize', renderCurrentMotion);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', renderCurrentMotion);
    };
  }, [renderHorizontalMotion]);

  useEffect(() => {
    headerMotionRef?.current?.setVerticalProgress(
      verticalProgressRef.current[activeIndexRef.current] ?? 0,
    );
  }, [headerMotionRef]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (suppressClickResetRef.current !== null) {
        window.clearTimeout(suppressClickResetRef.current);
      }
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== 'touch' ||
      blocksCarouselDrag(event.target) ||
      animationFrameRef.current !== null
    ) {
      pointerGestureRef.current = null;
      suppressClickRef.current = false;
      return;
    }
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: eventTimestamp(event.timeStamp),
      horizontal: false,
      vertical: false,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    const viewport = viewportRef.current;
    if (!gesture || !viewport || gesture.vertical) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const x = Math.abs(deltaX);
    const y = Math.abs(deltaY);

    if (!gesture.horizontal) {
      if (y > HORIZONTAL_GESTURE_THRESHOLD && y >= x) {
        gesture.vertical = true;
        return;
      }
      if (x <= HORIZONTAL_GESTURE_THRESHOLD || x <= y) return;
      gesture.horizontal = true;
      suppressClickRef.current = true;
    }

    event.preventDefault();
    const viewportWidth =
      viewport.clientWidth || viewport.getBoundingClientRect().width;
    if (viewportWidth === 0) return;
    const progress = clampSignedProgress(-deltaX / viewportWidth);
    const direction =
      directionFrom(progress) || horizontalMotionRef.current.direction;
    const motion: HorizontalMotion = {
      active: true,
      origin: activeIndexRef.current,
      direction,
      progress,
    };
    horizontalMotionRef.current = motion;
    renderHorizontalMotion(motion, true);
  };

  const finishPointerGesture = (
    end?: { x: number; y: number; timeStamp: number },
    cancelled = false,
  ) => {
    const gesture = pointerGestureRef.current;
    const viewport = viewportRef.current;
    if (!gesture || !viewport) return;
    if (viewport.hasPointerCapture(gesture.pointerId)) {
      viewport.releasePointerCapture(gesture.pointerId);
    }
    if (end) {
      gesture.lastX = end.x;
      gesture.lastY = end.y;
    }
    if (!gesture.horizontal) {
      releasePointerGesture(false);
      return;
    }

    const viewportWidth =
      viewport.clientWidth || viewport.getBoundingClientRect().width;
    const deltaX = gesture.lastX - gesture.startX;
    const progress =
      viewportWidth === 0
        ? horizontalMotionRef.current.progress
        : clampSignedProgress(-deltaX / viewportWidth);
    const elapsed = Math.max(
      1,
      eventTimestamp(end?.timeStamp ?? window.performance.now()) -
        gesture.startedAt,
    );
    const velocity = -deltaX / elapsed;
    const direction = directionFrom(progress) || directionFrom(velocity);
    const committed = shouldCommitSwipe({ progress, velocity, cancelled });
    const origin = activeIndexRef.current;
    releasePointerGesture(true);
    animateHorizontalMotion({
      origin,
      direction,
      from: progress,
      to: committed ? direction : 0,
      onComplete: () => settleHorizontalMotion(origin, direction, committed),
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishPointerGesture({
      x: event.clientX,
      y: event.clientY,
      timeStamp: event.timeStamp,
    });
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishPointerGesture(
      {
        x: event.clientX,
        y: event.clientY,
        timeStamp: event.timeStamp,
      },
      true,
    );
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
    if (suppressClickResetRef.current !== null) {
      window.clearTimeout(suppressClickResetRef.current);
      suppressClickResetRef.current = null;
    }
  };

  const handleContentScroll = (event: ReactUIEvent<HTMLElement>) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.dataset.dashboardScroll !== 'true'
    ) {
      return;
    }
    const slide = target.closest<HTMLElement>(
      '[data-home-carousel-slide-index]',
    );
    const index = Number(slide?.dataset.homeCarouselSlideIndex);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= DASHBOARD_SLIDES.length
    ) {
      return;
    }
    const progress = headerCollapseProgress(target);
    verticalProgressRef.current[index] = progress;
    const remainingHeaderSpace = HEADER_COLLAPSE_DISTANCE * (1 - progress);
    slide?.style.setProperty(
      '--dashboard-header-space',
      `${Number(remainingHeaderSpace.toFixed(2))}px`,
    );
    if (index === activeIndexRef.current) {
      headerMotionRef?.current?.setVerticalProgress(progress);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.target !== viewportRef.current) return;
    const direction =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    navigate(direction);
  };

  return {
    activeIndex,
    viewportRef,
    slideRefs,
    transactionDockMotionRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClickCapture,
    handleContentScroll,
    handleKeyDown,
  };
}
