export type CategoryRadialSpotlightPoint = { x: number; y: number };

export type CategoryRadialSpotlightBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CategoryRadialSpotlight = {
  bounds: CategoryRadialSpotlightBounds;
  center: CategoryRadialSpotlightPoint;
  radius: number;
  color: string;
};

type ActiveCategoryRadialSpotlight = {
  spotlight: CategoryRadialSpotlight;
  tile: HTMLElement;
  iconRegion: HTMLElement;
  icon: SVGElement;
  halo: HTMLSpanElement;
  tileStyle: string | null;
  iconRegionStyle: string | null;
  iconStyle: string | null;
  tileSourceAttribute: string | null;
  iconSourceAttribute: string | null;
};

let activeSpotlight: ActiveCategoryRadialSpotlight | null = null;

function restoreStyle(element: HTMLElement | SVGElement, value: string | null) {
  if (value === null) {
    element.removeAttribute('style');
  } else {
    element.setAttribute('style', value);
  }
}

function usableRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

export function clearCategoryRadialSpotlight(): void {
  if (!activeSpotlight) return;

  const {
    tile,
    iconRegion,
    icon,
    halo,
    tileStyle,
    iconRegionStyle,
    iconStyle,
    tileSourceAttribute,
    iconSourceAttribute,
  } = activeSpotlight;

  halo.remove();
  restoreStyle(tile, tileStyle);
  restoreStyle(iconRegion, iconRegionStyle);
  restoreStyle(icon, iconStyle);

  if (tileSourceAttribute === null) {
    tile.removeAttribute('data-category-radial-tile-source');
  } else {
    tile.setAttribute('data-category-radial-tile-source', tileSourceAttribute);
  }
  if (iconSourceAttribute === null) {
    iconRegion.removeAttribute('data-category-radial-source');
  } else {
    iconRegion.setAttribute('data-category-radial-source', iconSourceAttribute);
  }

  activeSpotlight = null;
}

export function activateCategoryRadialSpotlight(
  position: CategoryRadialSpotlightPoint,
  color: string,
  targetDocument: Document | undefined =
    typeof document === 'undefined' ? undefined : document,
): CategoryRadialSpotlight | null {
  clearCategoryRadialSpotlight();
  if (!targetDocument?.elementFromPoint) return null;

  const target = targetDocument.elementFromPoint(position.x, position.y);
  const ElementConstructor = targetDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) return null;

  const tile = target.closest('[data-testid="category-grid"] button');
  if (!(tile instanceof HTMLElement)) return null;

  const icon = tile.querySelector('svg');
  if (!(icon instanceof SVGElement)) return null;
  const iconRegion = icon.parentElement;
  if (!(iconRegion instanceof HTMLElement)) return null;

  const iconRegionRect = iconRegion.getBoundingClientRect();
  const iconRectCandidate = icon.getBoundingClientRect();
  const iconRect = usableRect(iconRectCandidate)
    ? iconRectCandidate
    : iconRegionRect;
  if (!usableRect(iconRect)) return null;

  const bounds = {
    left: iconRect.left,
    top: iconRect.top,
    width: iconRect.width,
    height: iconRect.height,
  };
  const center = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  const radius = Math.max(bounds.width, bounds.height) / 2 + 24;

  const halo = targetDocument.createElement('span');
  halo.setAttribute('data-category-radial-halo', 'true');
  halo.setAttribute('aria-hidden', 'true');
  Object.assign(halo.style, {
    position: 'absolute',
    left: `${center.x - iconRegionRect.left}px`,
    top: `${center.y - iconRegionRect.top}px`,
    width: '54px',
    height: '54px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '9999px',
    border: '3px solid hsl(var(--card))',
    backgroundColor: color,
    boxShadow: `0 0 0 9px color-mix(in srgb, ${color} 34%, transparent), 0 12px 32px color-mix(in srgb, ${color} 42%, transparent)`,
    pointerEvents: 'none',
    zIndex: '0',
  });

  const nextSpotlight: ActiveCategoryRadialSpotlight = {
    spotlight: { bounds, center, radius, color },
    tile,
    iconRegion,
    icon,
    halo,
    tileStyle: tile.getAttribute('style'),
    iconRegionStyle: iconRegion.getAttribute('style'),
    iconStyle: icon.getAttribute('style'),
    tileSourceAttribute: tile.getAttribute('data-category-radial-tile-source'),
    iconSourceAttribute: iconRegion.getAttribute('data-category-radial-source'),
  };

  tile.setAttribute('data-category-radial-tile-source', 'true');
  iconRegion.setAttribute('data-category-radial-source', 'true');
  Object.assign(tile.style, {
    position: 'relative',
    zIndex: '80',
    overflow: 'visible',
  });
  Object.assign(iconRegion.style, {
    position: 'relative',
    zIndex: '80',
    overflow: 'visible',
    isolation: 'isolate',
  });
  Object.assign(icon.style, {
    position: 'relative',
    zIndex: '1',
    color: 'white',
    scale: '1.24',
    filter: `drop-shadow(0 5px 12px color-mix(in srgb, ${color} 55%, transparent))`,
    transition: 'scale 160ms ease, color 160ms ease, filter 160ms ease',
  });
  iconRegion.append(halo);

  activeSpotlight = nextSpotlight;
  return nextSpotlight.spotlight;
}

export function getCategoryRadialSpotlight(): CategoryRadialSpotlight | null {
  return activeSpotlight?.spotlight ?? null;
}
