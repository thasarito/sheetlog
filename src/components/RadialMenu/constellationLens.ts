import {
  rayDistanceToBounds,
  type RadialMenuPoint,
  type RadialMenuSafeBounds,
} from './equalAreaSectors';

export interface ConstellationBoundary {
  control: RadialMenuPoint;
  end: RadialMenuPoint;
  path: string;
}

export interface ConstellationPaintIds {
  spotlight: string;
  trail: string;
}

const CONSTELLATION_ACCENTS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
] as const;

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function createConstellationPaintIds(
  reactId: string,
): ConstellationPaintIds {
  const instanceId = reactId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  return {
    spotlight: `radial-menu-constellation-spotlight-${instanceId}`,
    trail: `radial-menu-constellation-trail-${instanceId}`,
  };
}

export function createConstellationBoundary(
  anchor: RadialMenuPoint,
  angle: number,
  bounds: RadialMenuSafeBounds,
  boundaryIndex: number,
  bendAmount: number = 22,
): ConstellationBoundary {
  const distance = rayDistanceToBounds(anchor, angle, bounds);
  const end = {
    x: anchor.x + Math.cos(angle) * distance,
    y: anchor.y + Math.sin(angle) * distance,
  };
  const bendDirection = boundaryIndex % 2 === 0 ? 1 : -1;
  const bend = bendDirection * Math.max(0, bendAmount);
  const midpoint = {
    x: (anchor.x + end.x) / 2,
    y: (anchor.y + end.y) / 2,
  };
  const control = {
    x: midpoint.x - Math.sin(angle) * bend,
    y: midpoint.y + Math.cos(angle) * bend,
  };

  return {
    control,
    end,
    path: `M ${formatCoordinate(anchor.x)} ${formatCoordinate(anchor.y)} Q ${formatCoordinate(control.x)} ${formatCoordinate(control.y)} ${formatCoordinate(end.x)} ${formatCoordinate(end.y)}`,
  };
}

export function isConstellationBoundaryHighlighted(
  boundaryIndex: number,
  selectedSectorIndex: number | null,
  sectorCount: number,
): boolean {
  if (
    selectedSectorIndex === null ||
    sectorCount <= 0 ||
    boundaryIndex < 0 ||
    boundaryIndex >= sectorCount
  ) {
    return false;
  }

  const previousSectorIndex =
    (boundaryIndex - 1 + sectorCount) % sectorCount;
  return (
    selectedSectorIndex === boundaryIndex ||
    selectedSectorIndex === previousSectorIndex
  );
}

export function getConstellationAccent(
  sectorIndex: number,
  isCancel: boolean,
): string {
  if (isCancel) return 'hsl(var(--danger))';
  const normalizedIndex = Math.abs(Math.trunc(sectorIndex));
  return CONSTELLATION_ACCENTS[
    normalizedIndex % CONSTELLATION_ACCENTS.length
  ];
}
