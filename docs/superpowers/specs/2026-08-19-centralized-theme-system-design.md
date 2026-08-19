# Centralized Theme System Design

## Goal

Make every app-owned color originate from one typed configuration, preserve the current SheetLog
appearance by default, and make established palettes such as Dracula and Monokai straightforward to
add without touching components.

## Boundaries

- Semantic application colors, chart series, browser chrome, PWA defaults, fixed Google Sheets brand
  colors, and built-in account/category picker colors are centralized.
- Saved account/category colors remain user data and do not change with the app theme.
- The refactor adds no runtime dependency and no shadows.

## Architecture

`src/theme/themeConfig.ts` is the single edit point. It defines the semantic contract, the SheetLog
preset, editor-palette adapters, Dracula and Monokai, fixed brand colors, and domain color defaults.

The runtime converts ordinary six-digit hex values into HSL channels so current Tailwind utilities
retain opacity modifiers. A generated inline bootstrap runs before React and applies the persisted
preset and color mode. `ThemeProvider` owns live updates, storage synchronization, system-mode
changes, and the browser `theme-color` metadata.

Tailwind's `dark:` variant is redirected to `data-color-mode="dark"`, allowing System, Light, and
Dark overrides without rewriting existing utilities. Editor-palette adapters contrast-correct semantic
accents used as text while keeping canonical syntax colors for chart series. Analytics palette families
become five semantic chart tokens. Landing-page brand literals and Settings status literals become
named tokens.

## User experience

Settings gains a Theme preset selector and a compact System/Light/Dark control. Selection is local to
the browser, applies immediately, persists, and synchronizes across tabs.

## Verification

- Every built-in preset contains the full typed token contract in both modes.
- Runtime tests cover invalid persistence, system resolution, variable application, metadata, and the
  pre-React script.
- Component tests cover preset and mode selection.
- A boundary test prevents raw palette literals from returning to migrated UI/build files.
