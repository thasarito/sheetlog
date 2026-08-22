import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { useEffect, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

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

  useEffect(() => {
    if (open) setDraftColor(color);
  }, [open, color]);

  function handleApply() {
    onSelect(draftColor);
  }

  return (
    <Dialog
      open={open}
      onClose={onOpenChange}
      className="relative z-[90]"
      data-advanced-color-presentation="dialog"
    >
      <DialogBackdrop className="fixed inset-0 bg-overlay/55 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-4 pb-safe pt-safe">
        <DialogPanel className="w-full max-w-sm overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
          <div className="px-4 pb-3 pt-4">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Custom Color
            </DialogTitle>
          </div>

          <div className="space-y-4 px-4 pb-4">
            <HexColorPicker
              color={draftColor}
              onChange={setDraftColor}
              className="!w-full"
              style={{ height: '200px' }}
            />

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
                  className="w-full rounded-lg border border-border bg-surface py-2.5 pl-7 pr-3 text-sm uppercase text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
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
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
