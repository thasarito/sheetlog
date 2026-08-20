import type { TransactionType } from "../lib/types";

export type HexColor = `#${string}`;
export type ThemeMode = "light" | "dark";
export type ThemeModePreference = ThemeMode | "system";

export const THEME_COLOR_TOKEN_NAMES = [
  "background",
  "foreground",
  "surface",
  "surface2",
  "surface3",
  "card",
  "cardForeground",
  "muted",
  "mutedForeground",
  "primary",
  "primaryForeground",
  "accent",
  "accentForeground",
  "info",
  "infoForeground",
  "success",
  "successForeground",
  "warning",
  "warningForeground",
  "danger",
  "dangerForeground",
  "overlay",
  "border",
  "ring",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKEN_NAMES)[number];
export type ThemeColors = Record<ThemeColorToken, HexColor>;

export const THEME_CSS_VARIABLES: Record<ThemeColorToken, `--${string}`> = {
  background: "--background",
  foreground: "--foreground",
  surface: "--surface",
  surface2: "--surface-2",
  surface3: "--surface-3",
  card: "--card",
  cardForeground: "--card-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  info: "--info",
  infoForeground: "--info-foreground",
  success: "--success",
  successForeground: "--success-foreground",
  warning: "--warning",
  warningForeground: "--warning-foreground",
  danger: "--danger",
  dangerForeground: "--danger-foreground",
  overlay: "--overlay",
  border: "--border",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
};

export const BRAND_COLORS = {
  googleSheets: "#34A853",
  googleSheetsDark: "#0F9D58",
  googleBlue: "#4285F4",
} as const satisfies Record<string, HexColor>;

export const BRAND_CSS_VARIABLES = {
  googleSheets: "--brand-google-sheets",
  googleSheetsDark: "--brand-google-sheets-dark",
  googleBlue: "--brand-google-blue",
} as const satisfies Record<keyof typeof BRAND_COLORS, `--${string}`>;

export type ThemeDefinition<Id extends string = string> = {
  id: Id;
  label: string;
  description: string;
  modes: Record<ThemeMode, ThemeColors>;
};

export type EditorThemePalette = {
  background: HexColor;
  foreground: HexColor;
  selection: HexColor;
  comment: HexColor;
  cyan: HexColor;
  green: HexColor;
  orange: HexColor;
  pink: HexColor;
  purple: HexColor;
  red: HexColor;
  yellow: HexColor;
};

function parseHex(color: HexColor): [number, number, number] {
  const value = color.slice(1);
  if (!/^[\da-f]{6}$/i.test(value)) {
    throw new Error(`Expected a six-digit hex color, received ${color}`);
  }
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(red: number, green: number, blue: number): HexColor {
  const channel = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function mixHex(from: HexColor, to: HexColor, amount: number): HexColor {
  const [fromRed, fromGreen, fromBlue] = parseHex(from);
  const [toRed, toGreen, toBlue] = parseHex(to);
  const weight = Math.max(0, Math.min(1, amount));
  return toHex(
    fromRed + (toRed - fromRed) * weight,
    fromGreen + (toGreen - fromGreen) * weight,
    fromBlue + (toBlue - fromBlue) * weight,
  );
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: HexColor): number {
  const [red, green, blue] = parseHex(color);
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(first: HexColor, second: HexColor): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function bestForeground(background: HexColor, ...candidates: HexColor[]): HexColor {
  return candidates.reduce((best, candidate) =>
    contrastRatio(background, candidate) > contrastRatio(background, best)
      ? candidate
      : best,
  );
}

function ensureContrast(
  background: HexColor,
  preferred: HexColor,
  target: HexColor,
  minimum = 4.5,
): HexColor {
  if (contrastRatio(background, preferred) >= minimum) return preferred;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const amount = (lower + upper) / 2;
    if (contrastRatio(background, mixHex(preferred, target, amount)) >= minimum) {
      upper = amount;
    } else {
      lower = amount;
    }
  }
  return mixHex(preferred, target, upper);
}

export function createEditorThemeMode(
  palette: EditorThemePalette,
  mode: ThemeMode,
): ThemeColors {
  const surface = mixHex(
    palette.background,
    palette.foreground,
    mode === "dark" ? 0.055 : 0.025,
  );
  const surface2 = mixHex(
    palette.background,
    palette.foreground,
    mode === "dark" ? 0.105 : 0.06,
  );
  const surface3 = mixHex(
    palette.background,
    palette.foreground,
    mode === "dark" ? 0.17 : 0.12,
  );
  const border = mixHex(
    palette.background,
    palette.foreground,
    mode === "dark" ? 0.2 : 0.15,
  );
  const semanticForeground = (color: HexColor) =>
    bestForeground(
      color,
      palette.background,
      palette.foreground,
      "#000000",
      "#FFFFFF",
    );
  const mutedForeground = ensureContrast(
    surface2,
    palette.comment,
    palette.foreground,
  );
  const semanticAccent = (color: HexColor) =>
    ensureContrast(palette.background, color, palette.foreground);
  const primary = semanticAccent(palette.purple);
  const info = semanticAccent(palette.cyan);
  const success = semanticAccent(palette.green);
  const warning = semanticAccent(palette.yellow);
  const danger = semanticAccent(palette.red);

  return {
    background: palette.background,
    foreground: palette.foreground,
    surface,
    surface2,
    surface3,
    card: surface,
    cardForeground: palette.foreground,
    muted: surface2,
    mutedForeground,
    primary,
    primaryForeground: semanticForeground(primary),
    accent: palette.selection,
    accentForeground: semanticForeground(palette.selection),
    info,
    infoForeground: semanticForeground(info),
    success,
    successForeground: semanticForeground(success),
    warning,
    warningForeground: semanticForeground(warning),
    danger,
    dangerForeground: semanticForeground(danger),
    overlay: mode === "dark" ? "#000000" : palette.foreground,
    border,
    ring: primary,
    chart1: palette.green,
    chart2: palette.cyan,
    chart3: palette.purple,
    chart4: palette.pink,
    chart5: palette.orange,
  };
}

export function defineTheme<const Id extends string>(
  theme: ThemeDefinition<Id>,
): ThemeDefinition<Id> {
  return theme;
}

export function defineEditorTheme<const Id extends string>({
  id,
  label,
  description,
  palettes,
}: {
  id: Id;
  label: string;
  description: string;
  palettes: Record<ThemeMode, EditorThemePalette>;
}): ThemeDefinition<Id> {
  return defineTheme({
    id,
    label,
    description,
    modes: {
      light: createEditorThemeMode(palettes.light, "light"),
      dark: createEditorThemeMode(palettes.dark, "dark"),
    },
  });
}

const sheetlog = defineTheme({
  id: "sheetlog",
  label: "SheetLog",
  description: "The original neutral palette with an emerald light mode and indigo dark mode.",
  modes: {
    light: {
      background: "#FFFFFF",
      foreground: "#0F1729",
      surface: "#F8FAFC",
      surface2: "#F1F5F9",
      surface3: "#DDE6EE",
      card: "#FFFFFF",
      cardForeground: "#0F1729",
      muted: "#F1F5F9",
      mutedForeground: "#596A80",
      primary: "#10B77F",
      primaryForeground: "#0F1729",
      accent: "#CEF3E8",
      accentForeground: "#064C39",
      info: "#007AFF",
      infoForeground: "#0B1220",
      success: "#10B77F",
      successForeground: "#0F1729",
      warning: "#E7B008",
      warningForeground: "#412006",
      danger: "#EF4343",
      dangerForeground: "#0F1729",
      overlay: "#0F1729",
      border: "#E1E7EF",
      ring: "#10B77F",
      chart1: "#10B981",
      chart2: "#06B6D4",
      chart3: "#8B5CF6",
      chart4: "#F43F5E",
      chart5: "#94A3B8",
    },
    dark: {
      background: "#0F1015",
      foreground: "#F8F8FC",
      surface: "#191B24",
      surface2: "#232634",
      surface3: "#30354A",
      card: "#191B24",
      cardForeground: "#F8F8FC",
      muted: "#232634",
      mutedForeground: "#B1B5C8",
      primary: "#8FA3FF",
      primaryForeground: "#0F1015",
      accent: "#30354A",
      accentForeground: "#F8F8FC",
      info: "#64D2FF",
      infoForeground: "#0F1015",
      success: "#12D393",
      successForeground: "#0F1015",
      warning: "#F7C222",
      warningForeground: "#0F1015",
      danger: "#EF4343",
      dangerForeground: "#0F1015",
      overlay: "#040406",
      border: "#383D51",
      ring: "#8FA3FF",
      chart1: "#34D399",
      chart2: "#22D3EE",
      chart3: "#A78BFA",
      chart4: "#FB7185",
      chart5: "#64748B",
    },
  },
});

const dracula = defineEditorTheme({
  id: "dracula",
  label: "Dracula",
  description: "Dracula in dark mode and its official Alucard companion in light mode.",
  palettes: {
    light: {
      background: "#FFFBEB",
      foreground: "#1F1F1F",
      selection: "#CFCFDE",
      comment: "#6C664B",
      cyan: "#036A96",
      green: "#14710A",
      orange: "#A34D14",
      pink: "#A3144D",
      purple: "#644AC9",
      red: "#CB3A2A",
      yellow: "#846E15",
    },
    dark: {
      background: "#282A36",
      foreground: "#F8F8F2",
      selection: "#44475A",
      comment: "#6272A4",
      cyan: "#8BE9FD",
      green: "#50FA7B",
      orange: "#FFB86C",
      pink: "#FF79C6",
      purple: "#BD93F9",
      red: "#FF5555",
      yellow: "#F1FA8C",
    },
  },
});

const monokai = defineEditorTheme({
  id: "monokai",
  label: "Monokai",
  description: "Classic Monokai in dark mode with a contrast-adjusted light companion.",
  palettes: {
    light: {
      background: "#FCFCFA",
      foreground: "#2D2A2E",
      selection: "#E6E3E6",
      comment: "#727072",
      cyan: "#087E8B",
      green: "#4D7C0F",
      orange: "#B45309",
      pink: "#BE123C",
      purple: "#6D28D9",
      red: "#BE123C",
      yellow: "#8A6100",
    },
    dark: {
      background: "#272822",
      foreground: "#F8F8F2",
      selection: "#49483E",
      comment: "#75715E",
      cyan: "#66D9EF",
      green: "#A6E22E",
      orange: "#FD971F",
      pink: "#F92672",
      purple: "#AE81FF",
      red: "#F92672",
      yellow: "#E6DB74",
    },
  },
});

const wise = defineEditorTheme({
  id: "wise",
  label: "Wise",
  description: "Fresh lime, deep green, and warm neutral surfaces inspired by Wise.",
  palettes: {
    light: {
      background: "#F5F7F3",
      foreground: "#0E0F0C",
      selection: "#DFF7C4",
      comment: "#52614A",
      cyan: "#006A70",
      green: "#2F5711",
      orange: "#A23E00",
      pink: "#9A2E61",
      purple: "#163300",
      red: "#B3261E",
      yellow: "#735C00",
    },
    dark: {
      background: "#0E0F0C",
      foreground: "#F5F7F3",
      selection: "#233315",
      comment: "#ABB7A4",
      cyan: "#5FE1E8",
      green: "#9FE870",
      orange: "#FF9F5A",
      pink: "#FF8BC4",
      purple: "#9FE870",
      red: "#FF7B75",
      yellow: "#E7D85A",
    },
  },
});

const x = defineEditorTheme({
  id: "x",
  label: "X",
  description: "High-contrast monochrome surfaces with cool supporting colors inspired by X.",
  palettes: {
    light: {
      background: "#FFFFFF",
      foreground: "#0F1419",
      selection: "#E7E9EA",
      comment: "#536471",
      cyan: "#0077A8",
      green: "#147A47",
      orange: "#A94B00",
      pink: "#A80F5B",
      purple: "#0F1419",
      red: "#C5162E",
      yellow: "#7A6100",
    },
    dark: {
      background: "#000000",
      foreground: "#F2F2F2",
      selection: "#202327",
      comment: "#8B98A5",
      cyan: "#1D9BF0",
      green: "#00BA7C",
      orange: "#FF7A00",
      pink: "#F91880",
      purple: "#FFFFFF",
      red: "#F4212E",
      yellow: "#FFD400",
    },
  },
});

const pinterest = defineEditorTheme({
  id: "pinterest",
  label: "Pinterest",
  description: "Clean neutral surfaces with a bold red accent inspired by Pinterest.",
  palettes: {
    light: {
      background: "#FFFFFF",
      foreground: "#111111",
      selection: "#FCE8EC",
      comment: "#6B5A5D",
      cyan: "#006C7A",
      green: "#1F6B3B",
      orange: "#A84400",
      pink: "#B0005A",
      purple: "#E60023",
      red: "#E60023",
      yellow: "#7A5D00",
    },
    dark: {
      background: "#111111",
      foreground: "#F5F5F5",
      selection: "#3A171D",
      comment: "#B9A8AB",
      cyan: "#58D6E7",
      green: "#67D58A",
      orange: "#FF9A52",
      pink: "#FF72B6",
      purple: "#FF4D64",
      red: "#FF4D64",
      yellow: "#EFCE5B",
    },
  },
});

export const THEMES = {
  sheetlog,
  dracula,
  monokai,
  wise,
  x,
  pinterest,
} as const;

export type ThemeId = keyof typeof THEMES;

export const THEME_LIST = Object.values(THEMES) as ThemeDefinition<ThemeId>[];
export const DEFAULT_THEME_ID: ThemeId = "sheetlog";
export const DEFAULT_THEME_MODE: ThemeModePreference = "system";
export const THEME_STORAGE_KEY = "sheetlog-theme-v1";

export type ThemePreference = {
  themeId: ThemeId;
  mode: ThemeModePreference;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeId: DEFAULT_THEME_ID,
  mode: DEFAULT_THEME_MODE,
};

// User-selected category/account colors are domain data, not UI theme colors. They
// still live here so every built-in color value has one source of truth.
export const COLOR_PALETTE = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Gray", value: "#6b7280" },
] as const;

export type ColorValue = (typeof COLOR_PALETTE)[number]["value"];

export const DEFAULT_CATEGORY_COLORS: Record<TransactionType, ColorValue> = {
  expense: "#f97316",
  income: "#22c55e",
  transfer: "#3b82f6",
};

export const DEFAULT_ACCOUNT_COLOR: ColorValue = "#6366f1";

export const SUGGESTED_CATEGORY_COLORS: Record<string, ColorValue> = {
  "Food Delivery": "#f59e0b",
  "Dining Out": "#f97316",
  "Groceries & Home Supplies": "#10b981",
  "Coffee & Snacks": "#f59e0b",
  Housing: "#0ea5e9",
  "Utilities & Connectivity": "#3b82f6",
  Transport: "#6366f1",
  Subscriptions: "#8b5cf6",
  Shopping: "#ec4899",
  "Entertainment & Social": "#a855f7",
  Health: "#f43f5e",
  "Gifts & Donations": "#ef4444",
  "Work / Reimbursable": "#06b6d4",
  Travel: "#14b8a6",
  Salary: "#10b981",
  Bonus: "#eab308",
  Gift: "#f43f5e",
  Interest: "#84cc16",
  Savings: "#f59e0b",
  Invest: "#10b981",
  "Credit Card": "#6366f1",
  Other: "#6b7280",
};
