import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COLOR_PALETTE, ICON_MAP, ICON_PICKER_LIST, type IconName } from '../lib/icons';
import { AdvancedColorPicker } from './AdvancedColorPicker';
import { DynamicIcon } from './DynamicIcon';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from './ui/drawer';

type AppearancePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIcon: string | undefined;
  initialColor: string | undefined;
  onSave: (icon: string, color: string) => void;
  defaultIcon?: string;
  defaultColor?: string;
  title?: string;
};

export function AppearancePicker({
  open,
  onOpenChange,
  initialIcon,
  initialColor,
  onSave,
  defaultIcon = 'Wallet',
  defaultColor = '#6366f1',
  title = 'Choose Appearance',
}: AppearancePickerProps) {
  // Draft state (changes as user selects, not committed until Save)
  const [draftIcon, setDraftIcon] = useState<string>(initialIcon ?? defaultIcon);
  const [draftColor, setDraftColor] = useState<string>(initialColor ?? defaultColor);

  // Nested drawer state
  const [advancedColorOpen, setAdvancedColorOpen] = useState(false);

  // Reset draft state when drawer opens with new initial values
  useEffect(() => {
    if (open) {
      setDraftIcon(initialIcon ?? defaultIcon);
      setDraftColor(initialColor ?? defaultColor);
    }
  }, [open, initialIcon, initialColor, defaultIcon, defaultColor]);

  // Check if current color is a preset
  const isPresetColor = COLOR_PALETTE.some((c) => c.value === draftColor);

  function handleSave() {
    onSave(draftIcon, draftColor);
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  function handleAdvancedColorSelect(color: string) {
    setDraftColor(color);
    setAdvancedColorOpen(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[75vh]!">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>

        {/* ─────────────────────────────────────────────── */}
        {/* Preview Section */}
        {/* ─────────────────────────────────────────────── */}
        <div className="flex justify-center py-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl transition-colors"
            style={{ backgroundColor: `${draftColor}20` }}
          >
            <DynamicIcon
              name={draftIcon}
              fallback={defaultIcon}
              className="h-8 w-8"
              style={{ color: draftColor }}
            />
          </div>
        </div>

        {/* ─────────────────────────────────────────────── */}
        {/* Icon Grid (scrollable) */}
        {/* ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Icon</p>
          <div className="grid grid-cols-5 gap-2">
            {ICON_PICKER_LIST.map((iconName) => {
              const Icon = ICON_MAP[iconName as IconName];
              const isSelected = draftIcon === iconName;

              if (!Icon) return null;

              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setDraftIcon(iconName)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 transition ${
                    isSelected ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-surface-2'
                  }`}
                >
                  <Icon className="h-6 w-6" style={{ color: draftColor }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─────────────────────────────────────────────── */}
        {/* Color Section - Horizontal scroll */}
        {/* ─────────────────────────────────────────────── */}
        <div className="border-t border-border pt-4">
          <p className="mb-2 px-4 text-xs font-medium text-muted-foreground">Color</p>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1">
            {/* Custom Color Button */}
            <button type="button" onClick={() => setAdvancedColorOpen(true)} className="shrink-0">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed transition ${
                  !isPresetColor
                    ? 'ring-2 ring-primary ring-offset-2 border-primary'
                    : 'border-border'
                }`}
                style={!isPresetColor ? { backgroundColor: draftColor } : undefined}
              >
                {!isPresetColor ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <Plus className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </button>

            {COLOR_PALETTE.map(({ value }) => {
              const isSelected = draftColor === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDraftColor(value)}
                  className="shrink-0"
                >
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                      isSelected ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: value }}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─────────────────────────────────────────────── */}
        {/* Footer */}
        {/* ─────────────────────────────────────────────── */}
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
            onClick={handleSave}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Save
          </button>
        </DrawerFooter>

        {/* Nested Advanced Color Picker Drawer */}
        <AdvancedColorPicker
          open={advancedColorOpen}
          onOpenChange={setAdvancedColorOpen}
          color={draftColor}
          onSelect={handleAdvancedColorSelect}
        />
      </DrawerContent>
    </Drawer>
  );
}
