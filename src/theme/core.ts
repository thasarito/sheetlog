import {
  BRAND_COLORS,
  BRAND_CSS_VARIABLES,
  DEFAULT_THEME_PREFERENCE,
  THEME_COLOR_TOKEN_NAMES,
  THEME_CSS_VARIABLES,
  THEMES,
  type HexColor,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeId,
  type ThemeMode,
  type ThemeModePreference,
  type ThemePreference,
} from "./themeConfig";

export type AppliedTheme = {
  theme: ThemeDefinition<ThemeId>;
  preference: ThemePreference;
  resolvedMode: ThemeMode;
  colors: ThemeColors;
};

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function hexToHslChannels(color: HexColor): string {
  const value = color.slice(1);
  if (!/^[\da-f]{6}$/i.test(value)) {
    throw new Error(`Expected a six-digit hex color, received ${color}`);
  }

  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (maximum === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;
  return `${round(hue)} ${round(saturation * 100)}% ${round(lightness * 100)}%`;
}

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(THEMES, value)
  );
}

export function isThemeModePreference(value: unknown): value is ThemeModePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (!value || typeof value !== "object") return DEFAULT_THEME_PREFERENCE;
  const candidate = value as Partial<ThemePreference>;
  return {
    themeId: isThemeId(candidate.themeId)
      ? candidate.themeId
      : DEFAULT_THEME_PREFERENCE.themeId,
    mode: isThemeModePreference(candidate.mode)
      ? candidate.mode
      : DEFAULT_THEME_PREFERENCE.mode,
  };
}

export function parseThemePreference(serialized: string | null): ThemePreference {
  if (!serialized) return DEFAULT_THEME_PREFERENCE;
  try {
    return normalizeThemePreference(JSON.parse(serialized));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function resolveThemeMode(
  preference: ThemeModePreference,
  systemPrefersDark: boolean,
): ThemeMode {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): AppliedTheme {
  const normalized = normalizeThemePreference(preference);
  const theme = THEMES[normalized.themeId] as ThemeDefinition<ThemeId>;
  const resolvedMode = resolveThemeMode(normalized.mode, systemPrefersDark);
  return {
    theme,
    preference: normalized,
    resolvedMode,
    colors: theme.modes[resolvedMode],
  };
}

export function getThemeCssVariables(colors: ThemeColors): Record<`--${string}`, string> {
  const variables: Record<`--${string}`, string> = {};
  for (const token of THEME_COLOR_TOKEN_NAMES) {
    variables[THEME_CSS_VARIABLES[token]] = hexToHslChannels(colors[token]);
  }
  for (const [name, color] of Object.entries(BRAND_COLORS) as [
    keyof typeof BRAND_COLORS,
    HexColor,
  ][]) {
    variables[BRAND_CSS_VARIABLES[name]] = hexToHslChannels(color);
  }
  return variables;
}
