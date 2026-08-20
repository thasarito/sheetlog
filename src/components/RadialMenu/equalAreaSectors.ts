export type RadialMenuPoint = { x: number; y: number };

export interface RadialMenuBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RadialMenuSafeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RadialMenuItemData {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
}

export interface EqualAreaRadialSector extends RadialMenuItemData {
  startAngle: number;
  endAngle: number;
  polygon: RadialMenuPoint[];
  labelPoint: RadialMenuPoint;
  edgePoint: RadialMenuPoint;
}

export interface EqualAreaRadialLayout {
  anchor: RadialMenuPoint;
  bounds: RadialMenuBounds;
  safeBounds: RadialMenuSafeBounds;
  deadZoneRadius: number;
  nodeHitRadius: number;
  sectors: EqualAreaRadialSector[];
}

export interface EqualAreaRadialOptions {
  padding?: number;
  sampleCount?: number;
  deadZoneRadius?: number;
  nodeHitRadius?: number;
  labelProgress?: number;
  labelEdgeInset?: number;
  maxPolygonSamples?: number;
}

export type EqualAreaRadialReleaseTarget =
  | { type: 'item'; itemId: string }
  | { type: 'cancel' };

export const CANCEL_ITEM_ID = '__cancel__';

const DEFAULT_PADDING = 12;
const DEFAULT_SAMPLE_COUNT = 720;
const DEFAULT_DEAD_ZONE_RADIUS = 24;
const DEFAULT_NODE_HIT_RADIUS = 34;
const DEFAULT_LABEL_PROGRESS = 0.62;
const DEFAULT_LABEL_EDGE_INSET = 24;
const DEFAULT_MAX_POLYGON_SAMPLES = 28;
const DEFAULT_NODE_HORIZONTAL_INSET = 52;
const DEFAULT_NODE_VERTICAL_INSET = 36;
const MIN_LABEL_DISTANCE_AFTER_DEAD_ZONE = 22;
const EPSILON = 1e-7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(angle: number): number {
  let normalizedAngle = angle;
  while (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
  while (normalizedAngle >= Math.PI * 2) normalizedAngle -= Math.PI * 2;
  return normalizedAngle;
}

function sanitizeBounds(bounds: RadialMenuBounds): RadialMenuBounds {
  return {
    left: Number.isFinite(bounds.left) ? bounds.left : 0,
    top: Number.isFinite(bounds.top) ? bounds.top : 0,
    width: Math.max(1, Number.isFinite(bounds.width) ? bounds.width : 1),
    height: Math.max(1, Number.isFinite(bounds.height) ? bounds.height : 1),
  };
}

function createSafeBounds(
  bounds: RadialMenuBounds,
  anchor: RadialMenuPoint,
  padding: number,
): RadialMenuSafeBounds {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  const horizontalPadding = Math.min(Math.max(0, padding), bounds.width / 2);
  const verticalPadding = Math.min(Math.max(0, padding), bounds.height / 2);

  return {
    left: Math.min(anchor.x, bounds.left + horizontalPadding),
    top: Math.min(anchor.y, bounds.top + verticalPadding),
    right: Math.max(anchor.x, right - horizontalPadding),
    bottom: Math.max(anchor.y, bottom - verticalPadding),
  };
}

function pointAlong(
  origin: RadialMenuPoint,
  angle: number,
  distance: number,
): RadialMenuPoint {
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  };
}

function clampLabelPoint(
  point: RadialMenuPoint,
  bounds: RadialMenuBounds,
): RadialMenuPoint {
  const horizontalInset = Math.min(
    DEFAULT_NODE_HORIZONTAL_INSET,
    bounds.width / 2,
  );
  const verticalInset = Math.min(
    DEFAULT_NODE_VERTICAL_INSET,
    bounds.height / 2,
  );

  return {
    x: clamp(
      point.x,
      bounds.left + horizontalInset,
      bounds.left + bounds.width - horizontalInset,
    ),
    y: clamp(
      point.y,
      bounds.top + verticalInset,
      bounds.top + bounds.height - verticalInset,
    ),
  };
}

export function rayDistanceToBounds(
  origin: RadialMenuPoint,
  angle: number,
  bounds: RadialMenuSafeBounds,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let distance = Number.POSITIVE_INFINITY;

  if (dx > EPSILON) {
    distance = Math.min(distance, (bounds.right - origin.x) / dx);
  } else if (dx < -EPSILON) {
    distance = Math.min(distance, (bounds.left - origin.x) / dx);
  }

  if (dy > EPSILON) {
    distance = Math.min(distance, (bounds.bottom - origin.y) / dy);
  } else if (dy < -EPSILON) {
    distance = Math.min(distance, (bounds.top - origin.y) / dy);
  }

  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, distance);
}

function findBoundaryIndex(
  cumulativeArea: number[],
  targetArea: number,
  minimumIndex: number,
): number {
  let low = Math.max(0, minimumIndex);
  let high = cumulativeArea.length - 1;

  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (cumulativeArea[midpoint] < targetArea) {
      low = midpoint + 1;
    } else {
      high = midpoint;
    }
  }

  return low;
}

function chooseLabelRayIndex(
  rays: Array<{ angle: number; radius: number }>,
  cumulativeArea: number[],
  startIndex: number,
  endIndex: number,
  deadZoneRadius: number,
): number {
  const targetArea =
    (cumulativeArea[startIndex] + cumulativeArea[endIndex]) / 2;
  let midpointIndex = findBoundaryIndex(
    cumulativeArea,
    targetArea,
    startIndex,
  );
  midpointIndex = clamp(midpointIndex, startIndex, endIndex);

  if (rays[midpointIndex].radius > deadZoneRadius + 36) {
    return midpointIndex;
  }

  let bestIndex = midpointIndex;
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (rays[index].radius > rays[bestIndex].radius) bestIndex = index;
  }
  return bestIndex;
}

export function createEqualAreaRadialLayout(
  items: RadialMenuItemData[],
  anchor: RadialMenuPoint,
  inputBounds: RadialMenuBounds,
  options: EqualAreaRadialOptions = {},
): EqualAreaRadialLayout {
  const bounds = sanitizeBounds(inputBounds);
  const padding = options.padding ?? DEFAULT_PADDING;
  const sampleCount = Math.max(
    72,
    Math.floor(options.sampleCount ?? DEFAULT_SAMPLE_COUNT),
  );
  const deadZoneRadius = Math.max(
    0,
    options.deadZoneRadius ?? DEFAULT_DEAD_ZONE_RADIUS,
  );
  const nodeHitRadius = Math.max(
    0,
    options.nodeHitRadius ?? DEFAULT_NODE_HIT_RADIUS,
  );
  const labelProgress = clamp(
    options.labelProgress ?? DEFAULT_LABEL_PROGRESS,
    0.25,
    0.9,
  );
  const labelEdgeInset = Math.max(
    0,
    options.labelEdgeInset ?? DEFAULT_LABEL_EDGE_INSET,
  );
  const maxPolygonSamples = Math.max(
    8,
    Math.floor(options.maxPolygonSamples ?? DEFAULT_MAX_POLYGON_SAMPLES),
  );
  const safeBounds = createSafeBounds(bounds, anchor, padding);

  if (items.length === 0) {
    return {
      anchor,
      bounds,
      safeBounds,
      deadZoneRadius,
      nodeHitRadius,
      sectors: [],
    };
  }

  const angularStep = (Math.PI * 2) / sampleCount;
  const rays = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const angle = -Math.PI + index * angularStep;
    return {
      angle,
      radius: rayDistanceToBounds(anchor, angle, safeBounds),
    };
  });

  const cumulativeArea = new Array<number>(sampleCount + 1).fill(0);
  for (let index = 1; index <= sampleCount; index += 1) {
    const previousRadius = rays[index - 1].radius;
    const currentRadius = rays[index].radius;
    cumulativeArea[index] =
      cumulativeArea[index - 1] +
      ((previousRadius * previousRadius + currentRadius * currentRadius) / 2) *
        angularStep;
  }

  const totalAreaWeight = cumulativeArea[sampleCount];
  const boundaries = [0];
  for (let sectorIndex = 1; sectorIndex < items.length; sectorIndex += 1) {
    const targetArea = (totalAreaWeight * sectorIndex) / items.length;
    const previousBoundary = boundaries[boundaries.length - 1];
    const remainingSectors = items.length - sectorIndex;
    const latestAllowedBoundary = sampleCount - remainingSectors;
    const boundary = clamp(
      findBoundaryIndex(cumulativeArea, targetArea, previousBoundary + 1),
      previousBoundary + 1,
      latestAllowedBoundary,
    );
    boundaries.push(boundary);
  }
  boundaries.push(sampleCount);

  const sectors = items.map<EqualAreaRadialSector>((item, sectorIndex) => {
    const startIndex = boundaries[sectorIndex];
    const endIndex = boundaries[sectorIndex + 1];
    const indexSpan = Math.max(1, endIndex - startIndex);
    const polygonStep = Math.max(1, Math.ceil(indexSpan / maxPolygonSamples));
    const outerPoints: RadialMenuPoint[] = [];

    for (
      let rayIndex = startIndex;
      rayIndex <= endIndex;
      rayIndex += polygonStep
    ) {
      outerPoints.push(
        pointAlong(anchor, rays[rayIndex].angle, rays[rayIndex].radius),
      );
    }
    const finalRay = rays[endIndex];
    const finalPoint = pointAlong(anchor, finalRay.angle, finalRay.radius);
    const lastPoint = outerPoints[outerPoints.length - 1];
    if (
      !lastPoint ||
      Math.abs(lastPoint.x - finalPoint.x) > EPSILON ||
      Math.abs(lastPoint.y - finalPoint.y) > EPSILON
    ) {
      outerPoints.push(finalPoint);
    }

    const labelRayIndex = chooseLabelRayIndex(
      rays,
      cumulativeArea,
      startIndex,
      endIndex,
      deadZoneRadius,
    );
    const labelRay = rays[labelRayIndex];
    const maximumLabelRadius = Math.max(0, labelRay.radius - labelEdgeInset);
    const desiredLabelRadius = Math.max(
      deadZoneRadius + MIN_LABEL_DISTANCE_AFTER_DEAD_ZONE,
      labelRay.radius * labelProgress,
    );
    const labelRadius = Math.min(maximumLabelRadius, desiredLabelRadius);
    const safeLabelRadius = Math.max(
      Math.min(labelRay.radius * 0.78, maximumLabelRadius),
      labelRadius,
    );

    return {
      ...item,
      startAngle: rays[startIndex].angle,
      endAngle: rays[endIndex].angle,
      polygon: [anchor, ...outerPoints],
      labelPoint: clampLabelPoint(
        pointAlong(anchor, labelRay.angle, safeLabelRadius),
        bounds,
      ),
      edgePoint: pointAlong(anchor, labelRay.angle, labelRay.radius),
    };
  });

  return {
    anchor,
    bounds,
    safeBounds,
    deadZoneRadius,
    nodeHitRadius,
    sectors,
  };
}

function pointIsInsideBounds(
  point: RadialMenuPoint,
  bounds: RadialMenuBounds,
): boolean {
  return (
    point.x >= bounds.left - EPSILON &&
    point.x <= bounds.left + bounds.width + EPSILON &&
    point.y >= bounds.top - EPSILON &&
    point.y <= bounds.top + bounds.height + EPSILON
  );
}

function findNearestVisibleNode(
  layout: EqualAreaRadialLayout,
  dragPosition: RadialMenuPoint,
): EqualAreaRadialSector | null {
  let nearestSector: EqualAreaRadialSector | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const sector of layout.sectors) {
    const distance = Math.hypot(
      dragPosition.x - sector.labelPoint.x,
      dragPosition.y - sector.labelPoint.y,
    );
    if (
      distance <= layout.nodeHitRadius &&
      distance < nearestDistance
    ) {
      nearestSector = sector;
      nearestDistance = distance;
    }
  }

  return nearestSector;
}

export function findEqualAreaSector(
  layout: EqualAreaRadialLayout,
  dragPosition: RadialMenuPoint | null,
): EqualAreaRadialSector | null {
  if (!dragPosition || layout.sectors.length === 0) return null;
  if (!pointIsInsideBounds(dragPosition, layout.bounds)) return null;

  const dx = dragPosition.x - layout.anchor.x;
  const dy = dragPosition.y - layout.anchor.y;
  if (Math.hypot(dx, dy) < layout.deadZoneRadius) return null;

  const visibleNode = findNearestVisibleNode(layout, dragPosition);
  if (visibleNode) return visibleNode;

  const angle = normalizeAngle(Math.atan2(dy, dx));
  for (const sector of layout.sectors) {
    const startAngle = normalizeAngle(sector.startAngle);
    const endAngle = normalizeAngle(sector.endAngle);
    const isInside =
      startAngle <= endAngle
        ? angle >= startAngle - EPSILON && angle < endAngle - EPSILON
        : angle >= startAngle - EPSILON || angle < endAngle - EPSILON;

    if (isInside) return sector;
  }

  return null;
}

export function resolveEqualAreaRadialRelease(
  layout: EqualAreaRadialLayout,
  releasePosition: RadialMenuPoint | null,
): EqualAreaRadialReleaseTarget {
  const sector = findEqualAreaSector(layout, releasePosition);
  return sector
    ? { type: 'item', itemId: sector.id }
    : { type: 'cancel' };
}

export function radialPolygonPath(points: RadialMenuPoint[]): string {
  if (points.length === 0) return '';
  return `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')} Z`;
}
