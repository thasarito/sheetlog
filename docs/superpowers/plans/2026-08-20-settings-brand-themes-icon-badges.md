# Settings Brand Themes and Icon Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Wise-, X-, and Pinterest-inspired light/dark theme presets and normalize standard Settings leading icons to one accent badge variant.

**Architecture:** Keep all theme definitions in the existing centralized `themeConfig.ts` registry and use `defineEditorTheme` for generated, contrast-aware tokens. Introduce one small `SettingsIconBadge` presentation component for focused Settings rows, plus narrowly scoped CSS for badges embedded in the large Control Center file. Preserve saved account/category colors and all synchronization behavior.

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS 4, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-20-settings-brand-themes-icon-badges-design.md`

## Global Constraints

- Do not add a dependency.
- Do not use shadows.
- Keep `sheetlog-theme-v1` persistence backward-compatible.
- Keep saved account/category colors unchanged.
- Use the existing theme token system instead of hard-coded UI palette literals.

---

### Task 1: Specify the new themes

**Files:**
- Modify: `src/theme/themeConfig.test.ts`
- Modify: `src/components/ThemeSetting.test.tsx`

**Interfaces:**
- Consumes: `THEMES`, `THEME_LIST`, and the existing `ThemeProvider` API.
- Produces: failing expectations for the `wise`, `x`, and `pinterest` IDs and their Settings labels.

- [ ] **Step 1: Add failing theme-registry expectations**

Expect the stable ID order to be `sheetlog`, `dracula`, `monokai`, `wise`, `x`, `pinterest`; assert recognizable primary accents; include all generated themes in accent-readability coverage.

- [ ] **Step 2: Add a failing Settings selection expectation**

Render `ThemeSetting`, assert all six labels are available, choose `pinterest`, and assert the preference persists.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/theme/themeConfig.test.ts src/components/ThemeSetting.test.tsx
```

Expected: FAIL because the three presets do not exist yet.

### Task 2: Specify the shared Settings icon treatment

**Files:**
- Modify: `src/components/SettingsControlSection.test.tsx`
- Create: `src/components/settingsIconBadges.test.tsx`

**Interfaces:**
- Consumes: current Settings rows and section headers.
- Produces: expectations for `data-settings-icon-badge` and scoped Control Center CSS coverage.

- [ ] **Step 1: Add failing badge-marker assertions**

Assert that standard section, theme, analytics, and history leading badges expose `data-settings-icon-badge`.

- [ ] **Step 2: Add failing scoped-style assertions**

Read `src/styles/globals.css` and assert it contains selectors for Workspace health, Data & sync, and Quick Notes leading badges, while excluding inline account/category color styles.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/components/SettingsControlSection.test.tsx src/components/settingsIconBadges.test.tsx
```

Expected: FAIL because the shared marker and scoped rules do not exist yet.

### Task 3: Implement the presets and icon badges

**Files:**
- Create: `src/components/SettingsIconBadge.tsx`
- Modify: `src/theme/themeConfig.ts`
- Modify: `src/components/ThemeSetting.tsx`
- Modify: `src/components/SettingsControlSection.tsx`
- Modify: `src/components/AnalyticsBaseCurrencySetting.tsx`
- Modify: `src/components/AnalyticsBigSpendingThresholdSetting.tsx`
- Modify: `src/components/AnalyticsSyncSetting.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Produces: `SettingsIconBadge({ children, size })`, with `size` equal to `compact` or `prominent`; theme IDs `wise`, `x`, and `pinterest`.

- [ ] **Step 1: Implement three contrast-aware theme definitions**

Define both light and dark palettes with `defineEditorTheme`, then append the themes to `THEMES` in the tested order.

- [ ] **Step 2: Implement `SettingsIconBadge`**

Render a decorative span with `data-settings-icon-badge`, shared layout classes, and the compact or prominent dimensions already used by Settings.

- [ ] **Step 3: Replace standard focused-row badge wrappers**

Use the component in Theme, Appearance, Settings section headers, Analytics preferences, and Transaction history.

- [ ] **Step 4: Add scoped Control Center badge styles**

Apply a soft `--primary` background and `--primary` foreground to the shared class and the Workspace health, Sync Settings, and Quick Notes embedded leading badges. Keep saved account/category inline colors outside every selector.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/theme/themeConfig.test.ts src/components/ThemeSetting.test.tsx src/components/SettingsControlSection.test.tsx src/components/settingsIconBadges.test.tsx
```

Expected: PASS.

### Task 4: Verify and review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run repository verification**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Inspect the full branch diff**

Confirm no account/category inline color behavior changed, no shadows or dependencies were added, and the three new presets are included in pre-React theme bootstrap automatically through `THEMES`.

- [ ] **Step 3: Open the pull request and mark it ready**

Summarize the presets, icon normalization boundary, and exact verification evidence in the PR body.
