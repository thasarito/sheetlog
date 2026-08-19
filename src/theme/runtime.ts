import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./themeConfig";
import {
  getThemeCssVariables,
  parseThemePreference,
  resolveTheme,
  type AppliedTheme,
} from "./core";

export const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getThemeColorMeta(targetDocument: Document): HTMLMetaElement {
  const existing = targetDocument.querySelector<HTMLMetaElement>(
    'meta[data-sheetlog-theme-color], meta[name="theme-color"]:not([media])',
  );
  if (existing) return existing;

  const meta = targetDocument.createElement("meta");
  meta.name = "theme-color";
  meta.dataset.sheetlogThemeColor = "";
  targetDocument.head.append(meta);
  return meta;
}

export function readThemePreference(storage: Storage | null = null): ThemePreference {
  if (!storage) return DEFAULT_THEME_PREFERENCE;
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: Storage | null = null,
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // A theme must still work when storage is unavailable (private mode, quota, tests).
  }
}

export function getSystemPrefersDark(targetWindow: Window | null = null): boolean {
  return Boolean(targetWindow?.matchMedia(DARK_MODE_MEDIA_QUERY).matches);
}

export function applyThemeToDocument(
  preference: ThemePreference,
  {
    targetDocument = typeof document === "undefined" ? null : document,
    systemPrefersDark = getSystemPrefersDark(
      typeof window === "undefined" ? null : window,
    ),
  }: {
    targetDocument?: Document | null;
    systemPrefersDark?: boolean;
  } = {},
): AppliedTheme {
  const applied = resolveTheme(preference, systemPrefersDark);
  if (!targetDocument) return applied;

  const root = targetDocument.documentElement;
  for (const [property, value] of Object.entries(getThemeCssVariables(applied.colors))) {
    root.style.setProperty(property, value);
  }
  root.dataset.theme = applied.theme.id;
  root.dataset.colorMode = applied.resolvedMode;
  root.dataset.themeReady = "true";
  root.style.colorScheme = applied.resolvedMode;

  getThemeColorMeta(targetDocument).content = applied.colors.background;
  return applied;
}
