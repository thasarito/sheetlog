export type DashboardCarouselLoopMotionState = {
  lastOffset: number;
  travel: number;
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function unwrapDashboardCarouselLoopDelta(
  delta: number,
  loopSpan: number,
): number {
  const safeDelta = finiteOr(delta, 0);
  const safeLoopSpan = finiteOr(loopSpan, 0);
  if (safeLoopSpan <= 0) return safeDelta;
  return safeDelta - Math.round(safeDelta / safeLoopSpan) * safeLoopSpan;
}

export function advanceDashboardCarouselLoopMotion(
  state: DashboardCarouselLoopMotionState,
  currentOffset: number,
  loopSpan: number,
): DashboardCarouselLoopMotionState {
  const safeCurrentOffset = finiteOr(currentOffset, state.lastOffset);
  const delta = unwrapDashboardCarouselLoopDelta(
    safeCurrentOffset - state.lastOffset,
    loopSpan,
  );
  return {
    lastOffset: safeCurrentOffset,
    travel: state.travel + delta,
  };
}

export function dashboardCarouselProgressFromTravel(
  travel: number,
  viewportWidth: number,
): number {
  const safeTravel = Math.abs(finiteOr(travel, 0));
  const safeViewportWidth = finiteOr(viewportWidth, 0);
  if (safeViewportWidth <= 0) return 0;
  return Math.min(1, safeTravel / safeViewportWidth);
}
