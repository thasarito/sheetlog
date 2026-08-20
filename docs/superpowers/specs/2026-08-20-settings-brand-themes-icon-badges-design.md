# Settings Brand Themes and Icon Badges Design

## Goal

Expand Settings with three additional brand-inspired color presets—Wise, X, and Pinterest—and make standard Settings leading icons use one consistent visual variant: a soft theme-accent background with an accent-colored glyph.

The change extends the centralized theme system introduced in `src/theme/themeConfig.ts`. It does not introduce a parallel palette registry, a new dependency, or per-screen theme overrides.

## Theme Presets

Add three presets after the existing SheetLog, Dracula, and Monokai choices:

- **Wise** — warm neutral surfaces, deep green structure, and a vivid lime accent.
- **X** — restrained black-and-white surfaces with cool supporting colors.
- **Pinterest** — neutral surfaces with a vivid red accent and warm supporting colors.

Each preset supplies both light and dark palettes through `defineEditorTheme`. The existing theme factory derives surfaces, borders, semantic colors, chart colors, and readable foreground pairings. Preset labels and descriptions use “inspired by” language and do not imply official affiliation.

The existing persisted preference format and storage key remain unchanged. Previously stored themes continue to resolve exactly as before, while the new IDs become valid values.

## Settings Icon Variant

Standard Settings leading icons use one shared treatment:

- soft primary/accent background;
- primary/accent glyph color;
- existing compact or prominent dimensions and corner radii;
- no shadow.

A small `SettingsIconBadge` component owns this treatment for focused Settings components. A scoped Settings CSS rule covers leading badges embedded in the large Control Center composition so the change does not require an unrelated rewrite of `SettingsViewContent.tsx`.

The normalized treatment applies to:

- Workspace health;
- Accounts, Categories, Quick Notes, and Data & sync section headers;
- Theme and Appearance;
- Base currency and Big spending cutoff;
- Sync Settings and Transaction history;
- Quick Notes target and configured-note rows.

## Preserved Appearance

User-configurable account and category icons retain their saved background colors because those colors are domain data, not Settings chrome. Action icons, chevrons, drag handles, status text, and destructive controls also retain their semantic roles.

## Accessibility

Every new palette must keep the existing 4.5:1 semantic foreground-pair guarantee. Primary, info, success, warning, and danger accents must remain readable as text against each palette background. Theme selection remains a labelled native select, and icon badges remain decorative wrappers around existing accessible controls.

## Testing

Use test-driven development. Coverage must verify:

- all six theme IDs are registered in stable order;
- Wise, X, and Pinterest expose recognizable primary accents;
- every preset remains token-complete, hexadecimal, and contrast-safe;
- Settings exposes all six theme labels and persists a new preset;
- shared Settings badges expose the common badge marker;
- scoped CSS covers the leading badges that remain embedded in the Control Center;
- custom account/category appearance is not selected by the normalization rule.

Verification consists of focused Vitest coverage, the full test suite, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

## Out of Scope

- Rebranding SheetLog or copying third-party logos.
- Changing account/category saved colors.
- Changing theme preference storage or migration behavior.
- Redesigning Settings layout, controls, animation, or navigation.
- Adding shadows or a new dependency.
