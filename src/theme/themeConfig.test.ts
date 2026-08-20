import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COLOR_TOKEN_NAMES,
  THEME_CSS_VARIABLES,
  THEME_STORAGE_KEY,
  THEME_LIST,
  THEMES,
} from "./themeConfig";
import {
  getThemeCssVariables,
  hexToHslChannels,
  isThemeId,
  parseThemePreference,
  resolveTheme,
} from "./core";
import { createInlineThemeScript } from "./inlineThemeScript";
import { applyThemeToDocument } from "./runtime";

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(first: string, second: string): number {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((index) =>
      Number.parseInt(color.slice(index, index + 2), 16),
    );
    const [red, green, blue] = channels.map(channelToLinear);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

describe("theme configuration", () => {
  it("keeps every preset complete and hex based", () => {
    expect(Object.keys(THEMES)).toEqual([
      "sheetlog",
      "dracula",
      "monokai",
      "wise",
      "x",
      "pinterest",
    ]);

    for (const theme of THEME_LIST) {
      for (const mode of ["light", "dark"] as const) {
        expect(Object.keys(theme.modes[mode])).toEqual(THEME_COLOR_TOKEN_NAMES);
        for (const color of Object.values(theme.modes[mode])) {
          expect(color).toMatch(/^#[\da-f]{6}$/i);
        }
      }
    }
  });

  it("includes canonical Dracula and Monokai dark backgrounds", () => {
    expect(THEMES.dracula.modes.dark.background).toBe("#282A36");
    expect(THEMES.monokai.modes.dark.background).toBe("#272822");
  });

  it("includes recognizable brand-inspired primary accents", () => {
    expect(THEMES.wise.modes.dark.primary).toBe("#9FE870");
    expect(THEMES.x.modes.light.primary).toBe("#0F1419");
    expect(THEMES.x.modes.dark.primary).toBe("#FFFFFF");
    expect(THEMES.pinterest.modes.light.primary).toBe("#E60023");
  });

  it("keeps semantic foreground pairs readable in every preset", () => {
    const pairs = [
      ["background", "foreground"],
      ["card", "cardForeground"],
      ["muted", "mutedForeground"],
      ["primary", "primaryForeground"],
      ["accent", "accentForeground"],
      ["info", "infoForeground"],
      ["success", "successForeground"],
      ["warning", "warningForeground"],
      ["danger", "dangerForeground"],
    ] as const;

    for (const theme of THEME_LIST) {
      for (const mode of ["light", "dark"] as const) {
        for (const [background, foreground] of pairs) {
          expect(
            contrastRatio(
              theme.modes[mode][background],
              theme.modes[mode][foreground],
            ),
            `${theme.id}/${mode} ${background}/${foreground}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps generated-theme semantic accents readable as text", () => {
    const accents = ["primary", "info", "success", "warning", "danger"] as const;

    for (const theme of [
      THEMES.dracula,
      THEMES.monokai,
      THEMES.wise,
      THEMES.x,
      THEMES.pinterest,
    ]) {
      for (const mode of ["light", "dark"] as const) {
        for (const accent of accents) {
          expect(
            contrastRatio(
              theme.modes[mode].background,
              theme.modes[mode][accent],
            ),
            `${theme.id}/${mode} ${accent} on background`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("serializes every theme and brand color for Tailwind alpha utilities", () => {
    const variables = getThemeCssVariables(THEMES.sheetlog.modes.light);

    expect(variables[THEME_CSS_VARIABLES.background]).toBe("0 0% 100%");
    expect(variables[THEME_CSS_VARIABLES.chart5]).toBeDefined();
    expect(variables["--brand-google-sheets"]).toBeDefined();
    expect(Object.keys(variables)).toHaveLength(THEME_COLOR_TOKEN_NAMES.length + 3);
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
  });

  it("falls back safely when persisted preferences are stale", () => {
    expect(parseThemePreference('{"themeId":"missing","mode":"sepia"}')).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
    expect(isThemeId("toString")).toBe(false);
    expect(isThemeId("constructor")).toBe(false);
    expect(
      parseThemePreference('{"themeId":"toString","mode":"dark"}'),
    ).toEqual({ themeId: DEFAULT_THEME_PREFERENCE.themeId, mode: "dark" });
    expect(resolveTheme(DEFAULT_THEME_PREFERENCE, true).resolvedMode).toBe("dark");
  });
});

describe("theme bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-color-mode");
    document.documentElement.removeAttribute("data-theme-ready");
    document.documentElement.removeAttribute("style");
    document.querySelectorAll('meta[name="theme-color"]').forEach((element) => element.remove());
  });

  it("applies variables, browser color scheme, and theme metadata", () => {
    const applied = applyThemeToDocument(
      { themeId: "dracula", mode: "system" },
      { systemPrefersDark: true },
    );

    expect(applied.resolvedMode).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dracula");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      hexToHslChannels("#282A36"),
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#282A36",
    );
  });

  it("runs before React from the same configuration", () => {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ themeId: "monokai", mode: "light" }),
    );

    Function(createInlineThemeScript())();

    expect(document.documentElement).toHaveAttribute("data-theme", "monokai");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "light");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      hexToHslChannels(THEMES.monokai.modes.light.background),
    );
  });

  it("ignores prototype keys in the pre-React preference", () => {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ themeId: "toString", mode: "dark" }),
    );

    Function(createInlineThemeScript())();

    expect(document.documentElement).toHaveAttribute(
      "data-theme",
      DEFAULT_THEME_PREFERENCE.themeId,
    );
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
  });
});
