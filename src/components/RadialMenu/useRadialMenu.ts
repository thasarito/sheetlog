import { useCallback, useEffect, useState } from 'react';
import {
  activateCategoryRadialSpotlight,
  clearCategoryRadialSpotlight,
} from '../categoryRadialSpotlight';
import { resolveQuickNoteColors } from '../../lib/quickNoteColors';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  resolveEqualAreaRadialRelease,
  type RadialMenuBounds,
  type RadialMenuItemData,
  type RadialMenuPoint,
} from './equalAreaSectors';
import type { RadialMenuCategoryPresentation } from './index';

export interface RadialMenuState {
  isOpen: boolean;
  category: string;
  anchorPosition: RadialMenuPoint;
  dragPosition: RadialMenuPoint | null;
  bounds: RadialMenuBounds;
  categoryPresentation: RadialMenuCategoryPresentation;
  menuItems: RadialMenuItemData[];
}

export interface UseRadialMenuOptions<T> {
  getItems: (category: string) => T[];
  getItemId: (item: T) => string;
  getItemIcon: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemColor?: (item: T) => string | undefined;
  getCategoryPresentation?: (category: string) => RadialMenuCategoryPresentation;
  onSelect?: (item: T | null, category: string) => void;
  onDefault?: (category: string) => void;
}

export interface UseRadialMenuReturn {
  state: RadialMenuState | null;
  handlers: {
    onLongPressStart: (
      category: string,
      position: RadialMenuPoint,
      sourceBounds?: RadialMenuBounds,
    ) => void;
    onDrag: (position: RadialMenuPoint) => void;
    onRelease: (position: RadialMenuPoint) => void;
    onCancel: () => void;
  };
  menuItems: RadialMenuItemData[];
}

function getFullscreenBounds(): RadialMenuBounds {
  if (typeof window === 'undefined') {
    return { left: 0, top: 0, width: 375, height: 812 };
  }

  return {
    left: 0,
    top: 0,
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

function readOptionalColor(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('color' in value)) {
    return undefined;
  }
  const color = (value as { color?: unknown }).color;
  return typeof color === 'string' ? color : undefined;
}

export function useRadialMenu<T>(options: UseRadialMenuOptions<T>): UseRadialMenuReturn {
  const {
    getItems,
    getItemId,
    getItemIcon,
    getItemLabel,
    getItemColor,
    getCategoryPresentation,
    onSelect,
  } = options;
  const [state, setState] = useState<RadialMenuState | null>(null);

  useEffect(
    () => () => {
      clearCategoryRadialSpotlight();
    },
    [],
  );

  const handleLongPressStart = useCallback(
    (
      category: string,
      position: RadialMenuPoint,
      _sourceBounds?: RadialMenuBounds,
    ) => {
      const items = getItems(category);
      if (items.length === 0) {
        clearCategoryRadialSpotlight();
        return;
      }

      const categoryPresentation = getCategoryPresentation?.(category) ?? {
        label: category,
        icon: 'Wallet',
        color: 'hsl(var(--primary))',
      };
      const menuItems = resolveQuickNoteColors(
        items.map((item) => ({
          id: getItemId(item),
          icon: getItemIcon(item),
          label: getItemLabel(item),
          color: getItemColor?.(item) ?? readOptionalColor(item),
        })),
      );

      activateCategoryRadialSpotlight(position, categoryPresentation.color);
      setState({
        isOpen: true,
        category,
        anchorPosition: position,
        dragPosition: position,
        bounds: getFullscreenBounds(),
        categoryPresentation,
        menuItems,
      });
    },
    [
      getCategoryPresentation,
      getItemColor,
      getItemIcon,
      getItemId,
      getItemLabel,
      getItems,
    ],
  );

  const handleDrag = useCallback((position: RadialMenuPoint) => {
    setState((previous) =>
      previous ? { ...previous, dragPosition: position } : null,
    );
  }, []);

  const handleRelease = useCallback(
    (position: RadialMenuPoint) => {
      if (!state) return;

      const items = getItems(state.category);
      const layout = createEqualAreaRadialLayout(
        [
          ...state.menuItems,
          {
            id: CANCEL_ITEM_ID,
            icon: 'X',
            label: 'Cancel',
            color: '#ef4444',
          },
        ],
        state.anchorPosition,
        state.bounds,
      );
      const target = resolveEqualAreaRadialRelease(layout, position);

      clearCategoryRadialSpotlight();
      if (target.type === 'cancel' || target.itemId === CANCEL_ITEM_ID) {
        setState(null);
        return;
      }

      const selectedItem =
        items.find((item) => getItemId(item) === target.itemId) ?? null;
      onSelect?.(selectedItem, state.category);
      setState(null);
    },
    [getItemId, getItems, onSelect, state],
  );

  const handleCancel = useCallback(() => {
    clearCategoryRadialSpotlight();
    setState(null);
  }, []);

  return {
    state,
    handlers: {
      onLongPressStart: handleLongPressStart,
      onDrag: handleDrag,
      onRelease: handleRelease,
      onCancel: handleCancel,
    },
    menuItems: state?.menuItems ?? [],
  };
}
