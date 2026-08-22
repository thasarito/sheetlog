import { Monitor, Moon, Palette, Sun, Zap } from "lucide-react";
import { useTheme, type ThemeId, type ThemeModePreference } from "../theme";
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

const WEBKIT_SWITCH_ATTRIBUTE = { switch: "" } as const;

export function ThemeSetting() {
  const { themes, themeId, mode, setThemeId, setMode } = useTheme();

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
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                onClick={() => setMode(option.value)}
                className={
                  selected
                    ? "flex h-7 w-8 items-center justify-center rounded-md bg-background text-foreground"
                    : "flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        <SettingsIconBadge>
          <Zap className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </SettingsIconBadge>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">
            Native haptic test
          </span>
          <span className="block text-[12px] text-muted-foreground">
            Tap the switch itself on iPhone
          </span>
        </span>
        <input
          type="checkbox"
          {...WEBKIT_SWITCH_ATTRIBUTE}
          aria-label="Test native iPhone haptic"
          className="shrink-0"
        />
      </div>
    </div>
  );
}
