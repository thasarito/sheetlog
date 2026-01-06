import React, { useState } from "react";
import { Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "./ui/drawer";
import { COLOR_PALETTE } from "../lib/icons";

type ColorPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | undefined;
  onSelect: (color: string) => void;
};

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

export function ColorPicker({
  open,
  onOpenChange,
  selected,
  onSelect,
}: ColorPickerProps) {
  const [customHex, setCustomHex] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  function handlePresetSelect(color: string) {
    onSelect(color);
    onOpenChange(false);
  }

  function handleCustomSubmit() {
    const hex = customHex.startsWith("#") ? customHex : `#${customHex}`;
    if (isValidHex(hex)) {
      onSelect(hex);
      onOpenChange(false);
      setCustomHex("");
      setShowCustomInput(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-auto!">
        <DrawerHeader>
          <DrawerTitle>Choose Color</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4">
          {/* Preset colors grid */}
          <div className="grid grid-cols-4 gap-3">
            {COLOR_PALETTE.map(({ name, value }) => {
              const isSelected = selected === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handlePresetSelect(value)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                      isSelected ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    style={{ backgroundColor: value }}
                  >
                    {isSelected && <Check className="h-5 w-5 text-white" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom hex input */}
          <div className="mt-4 border-t border-border pt-4">
            {!showCustomInput ? (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2"
              >
                Custom Color (Hex)
              </button>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    #
                  </span>
                  <input
                    type="text"
                    value={customHex.replace("#", "")}
                    onChange={(e) =>
                      setCustomHex(e.target.value.replace("#", ""))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCustomSubmit();
                      if (e.key === "Escape") {
                        setShowCustomInput(false);
                        setCustomHex("");
                      }
                    }}
                    placeholder="FF5733"
                    maxLength={6}
                    autoFocus
                    className="w-full rounded-lg border border-border bg-surface py-2.5 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  disabled={!isValidHex(`#${customHex.replace("#", "")}`)}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              setShowCustomInput(false);
              setCustomHex("");
            }}
            className="w-full rounded-2xl bg-surface-2 py-3 text-sm font-semibold"
          >
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
