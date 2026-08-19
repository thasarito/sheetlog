# Theming SheetLog

All built-in color values live in `src/theme/themeConfig.ts`.

The rest of the app uses semantic Tailwind names such as `bg-background`, `text-foreground`,
`bg-primary`, `text-danger`, and `stroke-chart-2`. Do not add a raw hex, RGB, HSL, or Tailwind
palette color to theme-managed UI. Add or reuse a semantic token instead.

## Add an editor-style preset

`defineEditorTheme` maps a familiar syntax palette to SheetLog's complete UI contract. Add the
preset beside the existing SheetLog, Dracula, and Monokai definitions, then add it to `THEMES`:

```ts
const myTheme = defineEditorTheme({
  id: "my-theme",
  label: "My theme",
  description: "A short description shown in Settings.",
  palettes: {
    light: {
      background: "#FFFFFF",
      foreground: "#111111",
      selection: "#E5E7EB",
      comment: "#6B7280",
      cyan: "#0891B2",
      green: "#15803D",
      orange: "#C2410C",
      pink: "#BE185D",
      purple: "#7E22CE",
      red: "#DC2626",
      yellow: "#A16207",
    },
    dark: {
      background: "#111111",
      foreground: "#F9FAFB",
      selection: "#303030",
      comment: "#9CA3AF",
      cyan: "#67E8F9",
      green: "#86EFAC",
      orange: "#FDBA74",
      pink: "#F9A8D4",
      purple: "#D8B4FE",
      red: "#FCA5A5",
      yellow: "#FDE68A",
    },
  },
});

export const THEMES = {
  sheetlog,
  dracula,
  monokai,
  myTheme,
} as const;
```

No provider, Tailwind, Settings, chart, PWA, or metadata code needs to change. The preset is inferred
as a new `ThemeId`, appears in Settings, persists locally, syncs across tabs, and supports System,
Light, and Dark appearance.

The adapter preserves the supplied syntax colors for chart series. For semantic UI accents that are
also rendered as text (`primary`, `info`, `success`, `warning`, and `danger`), it makes the smallest
foreground-directed adjustment needed to reach 4.5:1 against the theme background.

## Define every semantic token directly

Use `defineTheme` when an editor-palette mapping is too restrictive. TypeScript requires all tokens,
including status foregrounds and five chart series colors, in both light and dark modes.

## Fixed brand and user-data colors

Google Sheets brand colors and the built-in account/category picker palette are also centralized in
`themeConfig.ts`, but they have different behavior:

- Brand colors remain stable across UI themes.
- Account and category colors are user data. Switching the app theme never rewrites saved colors.

## Runtime behavior

The selected preference is stored under `sheetlog-theme-v1`. A generated inline bootstrap applies
CSS variables and `data-color-mode` before React starts, avoiding a theme flash. `ThemeProvider`
then handles live changes, system appearance changes, cross-tab storage events, and browser
`theme-color` metadata.
