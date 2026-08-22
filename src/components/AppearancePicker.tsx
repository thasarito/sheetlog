import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  COLOR_PALETTE,
  DEFAULT_ACCOUNT_COLOR,
  ICON_MAP,
  ICON_PICKER_LIST,
  type IconName,
} from '../lib/icons';
import { QUICK_NOTE_BRANDS } from '../lib/quickNoteBrands';
import { AdvancedColorPicker } from './AdvancedColorPicker';
import { DynamicIcon } from './DynamicIcon';

export type AppearancePickerSection = 'appearance' | 'icon' | 'color';

type AppearancePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIcon: string | undefined;
  initialColor: string | undefined;
  onSave: (icon: string, color: string) => void;
  defaultIcon?: string;
  defaultColor?: string;
  title?: string;
  section?: AppearancePickerSection;
  includeBrandIcons?: boolean;
};

export function AppearancePicker({
  open,
  onOpenChange,
  initialIcon,
  initialColor,
  onSave,
  defaultIcon = 'Wallet',
  defaultColor = DEFAULT_ACCOUNT_COLOR,
  title = 'Choose Appearance',
  section = 'appearance',
  includeBrandIcons = false,
}: AppearancePickerProps) {
  const [draftIcon, setDraftIcon] = useState<string>(
    initialIcon ?? defaultIcon,
  );
  const [draftColor, setDraftColor] = useState<string>(
    initialColor ?? defaultColor,
  );
  const [advancedColorOpen, setAdvancedColorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftIcon(initialIcon ?? defaultIcon);
      setDraftColor(initialColor ?? defaultColor);
      return;
    }
    setAdvancedColorOpen(false);
  }, [open, initialIcon, initialColor, defaultIcon, defaultColor]);

  const isPresetColor = COLOR_PALETTE.some(
    (option) => option.value === draftColor,
  );
  const showIconPicker = section !== 'color';
  const showColorPicker = section !== 'icon';

  function handleSave() {
    onSave(draftIcon, draftColor);
    onOpenChange(false);
  }

  function handleAdvancedColorSelect(color: string) {
    setDraftColor(color);
    setAdvancedColorOpen(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onOpenChange}
        className="relative z-[80]"
        data-appearance-picker-presentation="dialog"
      >
        <DialogBackdrop className="fixed inset-0 bg-overlay/45 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4 pb-safe pt-safe">
          <DialogPanel
            data-testid="appearance-picker-panel"
            className="flex max-h-[min(78dvh,620px)] w-full max-w-sm flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {title}
              </DialogTitle>
            </div>

            <div className="flex justify-center py-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-colors"
                style={{ backgroundColor: `${draftColor}20` }}
              >
                <DynamicIcon
                  name={draftIcon}
                  fallback={defaultIcon}
                  className="h-7 w-7"
                  style={{ color: draftColor }}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {showIconPicker ? (
                <div>
                  {includeBrandIcons ? (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Brands
                      </p>
                      <div className="grid grid-cols-6 gap-2">
                        {QUICK_NOTE_BRANDS.map((brand) => {
                          const isSelected = draftIcon === brand.name;
                          return (
                            <button
                              key={brand.name}
                              type="button"
                              onClick={() => setDraftIcon(brand.name)}
                              aria-label={`Use ${brand.label} brand icon`}
                              aria-pressed={isSelected}
                              className={`flex aspect-square items-center justify-center rounded-xl border transition ${
                                isSelected
                                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                                  : 'border-border bg-surface hover:bg-surface-2'
                              }`}
                            >
                              <DynamicIcon
                                name={brand.name}
                                className="h-5 w-5"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {includeBrandIcons ? 'General icons' : 'Icon'}
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {ICON_PICKER_LIST.map((iconName) => {
                      const Icon = ICON_MAP[iconName as IconName];
                      const isSelected = draftIcon === iconName;

                      if (!Icon) return null;

                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => setDraftIcon(iconName)}
                          aria-label={`Use ${iconName} icon`}
                          aria-pressed={isSelected}
                          className={`flex aspect-square items-center justify-center rounded-xl border transition ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                              : 'border-border bg-surface hover:bg-surface-2'
                          }`}
                        >
                          <Icon
                            className="h-5 w-5"
                            style={{ color: draftColor }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {showColorPicker ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Color
                  </p>
                  <div className="grid grid-cols-6 gap-3">
                    <button
                      type="button"
                      onClick={() => setAdvancedColorOpen(true)}
                      aria-label="Choose custom color"
                      aria-pressed={!isPresetColor}
                      className="flex aspect-square items-center justify-center rounded-full"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed transition ${
                          !isPresetColor
                            ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-card'
                            : 'border-border'
                        }`}
                        style={
                          !isPresetColor
                            ? { backgroundColor: draftColor }
                            : undefined
                        }
                      >
                        {!isPresetColor ? (
                          <Check className="h-3.5 w-3.5 text-white" />
                        ) : (
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>

                    {COLOR_PALETTE.map(({ value }) => {
                      const isSelected = draftColor === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDraftColor(value)}
                          aria-label={`Use ${value} color`}
                          aria-pressed={isSelected}
                          className="flex aspect-square items-center justify-center rounded-full"
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                              isSelected
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                                : ''
                            }`}
                            style={{ backgroundColor: value }}
                          >
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5 text-white" />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
                onClick={handleSave}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Save
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <AdvancedColorPicker
        open={advancedColorOpen}
        onOpenChange={setAdvancedColorOpen}
        color={draftColor}
        onSelect={handleAdvancedColorSelect}
      />
    </>
  );
}
