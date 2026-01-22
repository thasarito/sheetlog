import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

type ReorderableListItemProps<T> = {
  value: T;
  children: React.ReactNode;
  onDragEnd?: () => void;
  disabled?: boolean;
};

export function ReorderableListItem<T>({
  value,
  children,
  onDragEnd,
  disabled = false,
}: ReorderableListItemProps<T>) {
  const dragControls = useDragControls();

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    // Trigger haptic feedback
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
    dragControls.start(e);
  }

  return (
    <Reorder.Item
      value={value}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      whileDrag={{
        scale: 1.02,
        zIndex: 50,
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className="relative"
    >
      <div className="flex items-stretch">
        {/* Drag handle */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          className={`flex items-center justify-center px-2 text-muted-foreground bg-card border-r border-border ${
            disabled ? "opacity-50" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{ touchAction: "none" }}
          aria-label="Drag to reorder"
          disabled={disabled}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </Reorder.Item>
  );
}
