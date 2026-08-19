import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_LIST,
  THEME_STORAGE_KEY,
  type ThemeDefinition,
  type ThemeId,
  type ThemeMode,
  type ThemeModePreference,
  type ThemePreference,
} from "./themeConfig";
import { parseThemePreference } from "./core";
import {
  applyThemeToDocument,
  DARK_MODE_MEDIA_QUERY,
  getSystemPrefersDark,
  readThemePreference,
  writeThemePreference,
} from "./runtime";

type ThemeContextValue = {
  themes: ThemeDefinition<ThemeId>[];
  themeId: ThemeId;
  mode: ThemeModePreference;
  resolvedMode: ThemeMode;
  setThemeId: (themeId: ThemeId) => void;
  setMode: (mode: ThemeModePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getInitialPreference(): ThemePreference {
  return readThemePreference(getBrowserStorage());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const preferenceRef = useRef(preference);
  const [resolvedMode, setResolvedMode] = useState<ThemeMode>(() =>
    preference.mode === "system"
      ? getSystemPrefersDark(typeof window === "undefined" ? null : window)
        ? "dark"
        : "light"
      : preference.mode,
  );

  const applyPreference = useCallback((next: ThemePreference, persist: boolean) => {
    const applied = applyThemeToDocument(next);
    preferenceRef.current = applied.preference;
    setPreferenceState(applied.preference);
    setResolvedMode(applied.resolvedMode);
    if (persist) writeThemePreference(applied.preference, getBrowserStorage());
  }, []);

  useBrowserLayoutEffect(() => {
    const applied = applyThemeToDocument(preference);
    preferenceRef.current = applied.preference;
    setResolvedMode(applied.resolvedMode);
  }, [preference]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(DARK_MODE_MEDIA_QUERY);
    const handleSystemMode = () => {
      if (preference.mode !== "system") return;
      const applied = applyThemeToDocument(preference, {
        systemPrefersDark: media.matches,
      });
      setResolvedMode(applied.resolvedMode);
    };
    media.addEventListener("change", handleSystemMode);
    return () => media.removeEventListener("change", handleSystemMode);
  }, [preference]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      applyPreference(parseThemePreference(event.newValue), false);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [applyPreference]);

  const setThemeId = useCallback(
    (themeId: ThemeId) =>
      applyPreference({ ...preferenceRef.current, themeId }, true),
    [applyPreference],
  );
  const setMode = useCallback(
    (mode: ThemeModePreference) =>
      applyPreference({ ...preferenceRef.current, mode }, true),
    [applyPreference],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      themes: THEME_LIST,
      themeId: preference.themeId,
      mode: preference.mode,
      resolvedMode,
      setThemeId,
      setMode,
    }),
    [preference, resolvedMode, setMode, setThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
