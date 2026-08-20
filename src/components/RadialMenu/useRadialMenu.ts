import { useCallback, useState } from 'react';
import {
  CANCEL_ITEM_ID,
  findHoveredItem,
  FULL_CIRCLE_ARC,
  getRadialMenuGeometry,
  projectDragPositionToCenter,
  type RadialMenuCategoryPresentation,
  type RadialMenuItemData,
  type RadialMenuPoint,
} from './index';

export interface RadialMenuState {
  isOpen: boolean;
  category: string;
  anchorPosition: RadialMenuPoint;
  dragPosition: RadialMenuPoint | null;
  categoryPresentation: RadialMenuCategoryPresentation;
}

export interface UseRadialMenuOptions<T> {
  getItems: (category: string) => T[];
  getItemId: (item: T) => string;
  getItemIcon: (item: T) => string;
  getItemLabel: (item: T) => string;
  getCategoryPresentation?: (category: string) => RadialMenuCategoryPresentation;
  onSelect?: (item: T | null, category: string) => void;
  onDefault?: (category: string) => void;
}

export interface UseRadialMenuReturn {
  state: RadialMenuState | null;
  handlers: {
    onLongPressStart: (category: string, position: RadialMenuPoint) => void;
    onDrag: (position: RadialMenuPoint) => void;
    onRelease: (position: RadialMenuPoint) => void;
    onCancel: () => void;
  };
  menuItems: RadialMenuItemData[];
}

export function useRadialMenu<T>(options: UseRadialMenuOptions<T>): UseRadialMenuReturn {
  const {
    getItems,
    getItemId,
    getItemIcon,
    getItemLabel,
    getCategoryPresentation,
    onSelect,
    onDefault,
  } = options;
  const [state, setState] = useState<RadialMenuState | null>(null);

  const handleLongPressStart = useCallback(
    (category: string, position: RadialMenuPoint) => {
      const items = getItems(category);
      if (items.length === 0) return;

      setState({
        isOpen: true,
        category,
        anchorPosition: position,
        dragPosition: position,
        categoryPresentation: getCategoryPresentation?.(category) ?? {
          label: category,
          icon: 'Wallet',
          color: 'hsl(var(--primary))',
        },
      });
    },
    [getCategoryPresentation, getItems],
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
      const geometry = getRadialMenuGeometry({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const distance = Math.hypot(
        position.x - state.anchorPosition.x,
        position.y - state.anchorPosition.y,
      );

      if (distance > geometry.maxDragDistance) {
        setState(null);
        return;
      }

      const menuItems: RadialMenuItemData[] = [
        ...items.map((item) => ({
          id: getItemId(item),
          icon: getItemIcon(item),
          label: getItemLabel(item),
        })),
        { id: CANCEL_ITEM_ID, icon: '×', label: 'Cancel' },
      ];
      const projectedPosition = projectDragPositionToCenter(
        state.anchorPosition,
        position,
        geometry.center,
      );
      const selectedId = findHoveredItem(
        menuItems,
        geometry.center,
        projectedPosition,
        FULL_CIRCLE_ARC,
        geometry,
      );

      if (selectedId === CANCEL_ITEM_ID) {
        setState(null);
        return;
      }

      if (selectedId === null) {
        onDefault?.(state.category);
        setState(null);
        return;
      }

      const selectedItem =
        items.find((item) => getItemId(item) === selectedId) ?? null;
      onSelect?.(selectedItem, state.category);
      setState(null);
    },
    [
      getItemIcon,
      getItemId,
      getItemLabel,
      getItems,
      onDefault,
      onSelect,
      state,
    ],
  );

  const handleCancel = useCallback(() => {
    setState(null);
  }, []);

  const menuItems: RadialMenuItemData[] = state
    ? getItems(state.category).map((item) => ({
        id: getItemId(item),
        icon: getItemIcon(item),
        label: getItemLabel(item),
      }))
    : [];

  return {
    state,
    handlers: {
      onLongPressStart: handleLongPressStart,
      onDrag: handleDrag,
      onRelease: handleRelease,
      onCancel: handleCancel,
    },
    menuItems,
  };
}
