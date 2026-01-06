import React from "react";
import * as LucideIcons from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "./ui/drawer";
import { ICON_PICKER_LIST } from "../lib/icons";

type IconPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | undefined;
  onSelect: (icon: string) => void;
};

export function IconPicker({
  open,
  onOpenChange,
  selected,
  onSelect,
}: IconPickerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70vh]!">
        <DrawerHeader>
          <DrawerTitle>Choose Icon</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="grid grid-cols-5 gap-2">
            {ICON_PICKER_LIST.map((iconName) => {
              const Icon = LucideIcons[
                iconName as keyof typeof LucideIcons
              ] as LucideIcons.LucideIcon;
              const isSelected = selected === iconName;

              if (!Icon) return null;

              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => {
                    onSelect(iconName);
                    onOpenChange(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 transition ${
                    isSelected
                      ? "bg-primary/10 ring-2 ring-primary"
                      : "hover:bg-surface-2"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {iconName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <DrawerFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-2xl bg-surface-2 py-3 text-sm font-semibold"
          >
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
