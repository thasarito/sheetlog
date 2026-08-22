import { Monitor, Moon, Palette, Sun, Vibrate } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getHapticFeedbackEnabled,
  setHapticFeedbackEnabled,
  subscribeHapticFeedback,
} from "../lib/haptics";
import { useTheme, type ThemeId, type ThemeModePreference } from "../theme";
import { HapticSelectionButton } from "./ui/HapticSelectionButton";
import { SettingsIconBadge } from "./SettingsIconBadge";

const MODE_OPTIONS: {
  value: ThemeModePreference;
  label: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeSetting() {
  const { themes, themeId, mode, setThemeId, setMode } = useTheme();
  const [hapticFeedbackEnabled, setHapticFeedbackEnabledState] = useState(
    getHapticFeedbackEnabled,
  );

  useEffect(
    () =>
      subscribeHapticFeedback(() =>
        setHapticFeedbackEnabledState(getHapticFeedbackEnabled()),
      ),
    [],
  );

  return (
    <div className="divide-y divide-border/70">
      <label className="flex min-h-14 items-center gap-3 px-4 py-3">
        <SettingsIconBadge>
          <Palette className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </SettingsIconBadge>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">Theme</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {themes.find((theme) => theme.id === themeId)?.description}
          </span>
        </span>
        <select
          aria-label="Theme"
          value={themeId}
          onChange={(event) => setThemeId(event.target.value as ThemeId)}
          className="max-w-32 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-right text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        <SettingsIconBadge>
          {mode === "dark" ? (
            <Moon className="h-[18px] w-[18px]" strokeWidth={2.25} />
          ) : mode === "light" ? (
            <Sun className="h-[18px] w-[18px]" strokeWidth={2.25} />
          ) : (
            <Monitor className="h-[18px] w-[18px]" strokeWidth={2.25} />
          )}
        </SettingsIconBadge>
        <span className="text-[15px] font-medium text-foreground">Appearance</span>
        <div
          role="radiogroup"
          aria-label="Theme appearance"
          className="ml-auto inline-flex rounded-lg bg-surface-2 p-0.5"
        >
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;
            return (
              <HapticSelectionButton
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                changesValue={!selected}
                onClick={() => setMode(option.value)}
                className={
                  selected
                    ? "flex h-7 w-8 items-center justify-center rounded-md bg-background text-foreground"
                    : "flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </HapticSelectionButton>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        <SettingsIconBadge>
          <Vibrate className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </SettingsIconBadge>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">
            Haptic feedback
          </span>
          <span className="block text-[12px] text-muted-foreground">
            Tactile confirmation for direct selections on supported iPhones.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="Haptic feedback"
          aria-checked={hapticFeedbackEnabled}
          onClick={() =>
            setHapticFeedbackEnabled(!hapticFeedbackEnabled)
          }
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
            hapticFeedbackEnabled ? "bg-primary" : "bg-surface-3"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-background transition-transform ${
              hapticFeedbackEnabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
