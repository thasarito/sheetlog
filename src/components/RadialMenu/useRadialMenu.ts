import { useCallback, useState } from 'react';
import {
  findHoveredItem,
  calculateAvailableArc,
  CANCEL_ITEM_ID,
  OUTER_RADIUS,
  MENU_PADDING,
  type RadialMenuItemData,
} from './index';

export interface RadialMenuState {
  isOpen: boolean;
  category: string;
  anchorPosition: { x: number; y: number };
  dragPosition: { x: number; y: number } | null;
}

export interface UseRadialMenuOptions<T> {
  getItems: (category: string) => T[];
  getItemId: (item: T) => string;
  getItemIcon: (item: T) => string;
  getItemLabel: (item: T) => string;
  onSelect?: (item: T | null, category: string) => void;
}

export interface UseRadialMenuReturn {
  state: RadialMenuState | null;
  handlers: {
    onLongPressStart: (category: string, position: { x: number; y: number }) => void;
    onDrag: (position: { x: number; y: number }) => void;
    onRelease: (position: { x: number; y: number }) => void;
    onCancel: () => void;
  };
  menuItems: RadialMenuItemData[];
}

export function useRadialMenu<T>(options: UseRadialMenuOptions<T>): UseRadialMenuReturn {
  const { getItems, getItemId, getItemIcon, getItemLabel, onSelect } = options;
  const [state, setState] = useState<RadialMenuState | null>(null);

  const handleLongPressStart = useCallback(
    (category: string, position: { x: number; y: number }) => {
      const items = getItems(category);
      if (items.length > 0) {
        setState({
          isOpen: true,
          category,
          anchorPosition: position,
          dragPosition: position,
        });
      }
    },
    [getItems]
  );

  const handleDrag = useCallback((position: { x: number; y: number }) => {
    setState((prev) => (prev ? { ...prev, dragPosition: position } : null));
  }, []);

  const handleRelease = useCallback(
    (position: { x: number; y: number }) => {
      if (!state) return;

      const items = getItems(state.category);

      const menuItems: RadialMenuItemData[] = [
        ...items.map((item) => ({
          id: getItemId(item),
          icon: getItemIcon(item),
          label: getItemLabel(item),
        })),
        { id: CANCEL_ITEM_ID, icon: '\\', label: 'Cancel' },
      ];

      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const arcConfig = calculateAvailableArc(
        state.anchorPosition,
        viewport,
        OUTER_RADIUS,
        MENU_PADDING
      );

      const selectedId = findHoveredItem(menuItems, state.anchorPosition, position, arcConfig);

      if (selectedId === CANCEL_ITEM_ID) {
        setState(null);
        return;
      }

      const selectedItem = selectedId
        ? items.find((item) => getItemId(item) === selectedId) ?? null
        : null;

      onSelect?.(selectedItem, state.category);
      setState(null);
    },
    [state, getItems, getItemId, getItemIcon, getItemLabel, onSelect]
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
