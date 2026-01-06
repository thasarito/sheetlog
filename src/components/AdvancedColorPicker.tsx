import { useState, useEffect } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "./ui/drawer";

type AdvancedColorPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  color: string;
  onSelect: (color: string) => void;
};

export function AdvancedColorPicker({
  open,
  onOpenChange,
  color,
  onSelect,
}: AdvancedColorPickerProps) {
  const [draftColor, setDraftColor] = useState(color);

  // Sync draft with parent color when opening
  useEffect(() => {
    if (open) {
      setDraftColor(color);
    }
  }, [open, color]);

  function handleApply() {
    onSelect(draftColor);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-auto!">
        <DrawerHeader>
          <DrawerTitle>Custom Color</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-4">
          {/* Color Picker */}
          <HexColorPicker
            color={draftColor}
            onChange={setDraftColor}
            className="!w-full"
            style={{ height: "200px" }}
          />

          {/* Preview + Hex Input */}
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: draftColor }}
            />
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                #
              </span>
              <HexColorInput
                color={draftColor}
                onChange={setDraftColor}
                className="w-full rounded-lg border border-border bg-surface py-2.5 pl-7 pr-3 text-sm text-foreground uppercase focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-row gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Apply
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
