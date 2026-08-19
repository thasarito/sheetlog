import type { DashboardTitleDirection } from "../DashboardTitleReel";

type ResolveDashboardTitleStepsOptions = {
  direction: DashboardTitleDirection | 0;
  stepDirection: DashboardTitleDirection | 0;
  committedSteps: number;
  pendingSelections: number;
  returnedToOrigin: boolean;
};

export function resolveDashboardTitleSteps({
  direction,
  stepDirection,
  committedSteps,
  pendingSelections,
  returnedToOrigin,
}: ResolveDashboardTitleStepsOptions): number {
  if (returnedToOrigin || direction === 0) return 0;
  const netSelectionSteps =
    committedSteps + stepDirection * pendingSelections;
  return direction * Math.max(1, Math.abs(netSelectionSteps));
}
