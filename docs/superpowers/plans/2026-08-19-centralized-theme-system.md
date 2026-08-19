# Centralized Theme System Implementation Plan

1. Add failing tests for complete theme tokens, persisted preference validation, pre-React bootstrap,
   Settings controls, and raw-color boundaries.
2. Introduce the typed theme configuration and editor-palette adapter with SheetLog, Dracula, and
   Monokai presets.
3. Add pure color serialization, DOM runtime application, inline bootstrap generation, and the React
   provider.
4. Redirect Tailwind dark mode to the runtime data attribute and expose semantic info, chart, and
   brand colors.
5. Remove palette ownership from global CSS, PWA metadata, analytics presentation, Settings, landing
   UI, and icon defaults.
6. Add the Settings selector and theming documentation.
7. Run tests, TypeScript, lint, and build; inspect the diff for raw colors and visual-contract gaps.
