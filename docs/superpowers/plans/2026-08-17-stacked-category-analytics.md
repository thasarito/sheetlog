# Stacked Category Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved analytics prototype into production UI: W/M/Q/C ranges, a top-four-category stacked bar chart, reactive bucket/category drill-down, a half-donut overview, and a Shadcn-style custom date-range picker.

**Architecture:** Keep date aggregation and filter semantics in the pure `analytics.ts` domain module, including stable series assignment and scoped summaries. Keep interaction state in `HomeDashboardCarousel` and `AnalyticsDrawer`; render it through focused chart, range-picker, donut, and category components. The compact home slide remains read-only while the drawer owns bucket/category drill-down.

**Tech Stack:** React 18, TypeScript, date-fns, Radix Popover, React DayPicker, Tailwind CSS, Vitest/Testing Library, Playwright.

---

## Task 1: Extend the analytics domain for custom ranges and stacked series

**Files:**

- Modify: `src/components/TransactionFlow/analytics.ts`
- Modify: `src/components/TransactionFlow/analytics.test.ts`

- [ ] Add failing unit tests for:
  - `custom` periods and an equal-length immediately preceding comparison period.
  - W producing seven daily buckets, M producing one bucket per elapsed day, Q producing seven-day buckets, and C producing daily buckets at 31 days or fewer and weekly buckets above 31 days.
  - top four expense categories being selected once for the whole range, deterministically ordered by amount then name, with remaining categories grouped under `Other`.
  - every bucket exposing a signed segment for every stable series and transaction IDs for all bucket rows, not expenses only.
  - a selected bucket producing scoped expense, income, net, category, and transaction values.
- [ ] Run the focused test and confirm it fails for the missing domain behavior:

  ```bash
  npm test -- src/components/TransactionFlow/analytics.test.ts
  ```

- [ ] Add the domain types and input:

  ```ts
  export type AnalyticsRange = 'week' | 'month' | 'quarter' | 'custom';
  export type AnalyticsSeriesTone = 'emerald' | 'cyan' | 'violet' | 'rose' | 'slate';
  export type AnalyticsSeries = {
    key: string;
    label: string;
    tone: AnalyticsSeriesTone;
    categoryNames: string[];
  };
  export type AnalyticsBucketSegment = { seriesKey: string; amount: number };
  export type AnalyticsScope = {
    expenseTotal: number;
    incomeTotal: number;
    netTotal: number;
    categories: AnalyticsCategory[];
    transactions: TransactionRecord[];
  };
  ```

- [ ] Accept `customPeriod?: DatePeriod` in `buildAnalyticsSummary`, normalize its endpoints to start/end of day, and calculate its comparison by subtracting the inclusive period length.
- [ ] Replace month-to-date weekly and quarter-to-date monthly aggregation with the approved bucket rules. Give each bucket a stable date-derived key, concise visual label, full accessible label, all matching transaction IDs, and one segment per stable series.
- [ ] Build exactly four named series from positive range-level expense-category totals and add `Other` only when additional categories exist. Reuse that series assignment for every bucket so colors never change while drilling down.
- [ ] Export `buildAnalyticsScope(summary, bucketKey?)`; it must return the full range when no bucket is selected and recompute totals/categories/transactions from all rows in the selected bucket when one is selected.
- [ ] Keep transfer rows in scoped transactions while excluding transfers from expense, income, and net totals.
- [ ] Run the focused unit test until green:

  ```bash
  npm test -- src/components/TransactionFlow/analytics.test.ts
  ```

- [ ] Commit:

  ```bash
  git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
  git commit -m "feat: model stacked category analytics"
  ```

## Task 2: Render an accessible stacked chart with selection de-emphasis

**Files:**

- Modify: `src/components/TransactionFlow/AnalyticsBarChart.tsx`
- Create: `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`

- [ ] Add failing component tests asserting:
  - each bucket renders its category segments and accessible amount summary.
  - selecting a bucket calls `onSelect` without adding a selected border, ring, or outline.
  - when one bucket is selected, all other bars receive neutral/grayscale styling while the selected segments retain their series colors.
  - ArrowLeft, ArrowRight, Home, End, and Escape update or clear selection when the chart is interactive.
  - the compact read-only chart does not expose interactive bucket buttons.
- [ ] Run and observe the focused failure:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx
  ```

- [ ] Replace the single-value bars with positive/negative stacked segment rendering around a shared baseline. Use a static tone-to-class map so Tailwind includes every series color.
- [ ] Preserve the selected bar's category colors and apply grayscale/opacity only to non-selected bar stacks. Do not use `ring-*`, `border-*`, or outline styling as the selected indicator; keep focus-visible treatment on the interactive chart container.
- [ ] Implement listbox-style keyboard movement, selection announcement, and Escape-to-clear without adding desktop pointer dragging.
- [ ] Run the focused test until green, then rerun the analytics domain tests:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/analytics.test.ts
  ```

- [ ] Commit:

  ```bash
  git add src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsBarChart.test.tsx
  git commit -m "feat: render selectable stacked analytics chart"
  ```

## Task 3: Add W/M/Q/C and the Shadcn-style range picker

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/TransactionFlow/AnalyticsRangeToggle.tsx`
- Create: `src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx`
- Create: `src/components/TransactionFlow/AnalyticsRangePicker.tsx`
- Create: `src/components/TransactionFlow/AnalyticsRangePicker.test.tsx`
- Modify: `src/styles/globals.css`

- [ ] Add failing tests for a compact right-aligned four-option toggle and for a controlled custom picker that:
  - opens a modal-free Radix popover from a formatted range trigger.
  - renders one range-selection calendar on mobile.
  - reports a complete inclusive range through `onChange`, closes after the second date, and returns focus to its trigger.
  - limits selection to the earliest loaded transaction date through today.
- [ ] Run the focused tests and confirm they fail:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsRangePicker.test.tsx
  ```

- [ ] Install the two direct UI dependencies:

  ```bash
  npm install @radix-ui/react-popover@1.1.23 react-day-picker@10.0.1
  ```

- [ ] Add `C` to `AnalyticsRangeToggle` and change its four equal cells to the same compact toggle-group visual used in the prototype. Keep 44px tap targets and use no shadow classes.
- [ ] Implement `AnalyticsRangePicker` as Shadcn's composition pattern: Radix `Popover` + React DayPicker `mode="range"`, a calendar-icon trigger, one visible month, previous/next controls, selected-range styling, and a concise formatted range label.
- [ ] Add only the minimal DayPicker selectors needed to `globals.css`, using theme variables and no shadows.
- [ ] Run both focused tests until green:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsRangePicker.test.tsx
  ```

- [ ] Commit:

  ```bash
  git add package.json package-lock.json src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsRangePicker.tsx src/components/TransactionFlow/AnalyticsRangePicker.test.tsx src/styles/globals.css
  git commit -m "feat: add custom analytics range picker"
  ```

## Task 4: Add the reactive half-donut and segmented category rows

**Files:**

- Create: `src/components/TransactionFlow/AnalyticsHalfDonut.tsx`
- Create: `src/components/TransactionFlow/AnalyticsHalfDonut.test.tsx`
- Create: `src/components/TransactionFlow/AnalyticsCategories.tsx`
- Create: `src/components/TransactionFlow/AnalyticsCategories.test.tsx`

- [ ] Add failing tests asserting the half-donut exposes the scoped expense total and category breakdown, and category rows:
  - retain the range-level series order and colors.
  - recalculate amounts/shares for the selected bucket.
  - show a 16-segment proportional track.
  - keep zero-value series visible but subdued.
  - toggle category selection, including `Other`.
- [ ] Run the focused tests and confirm they fail:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsHalfDonut.test.tsx src/components/TransactionFlow/AnalyticsCategories.test.tsx
  ```

- [ ] Implement `AnalyticsHalfDonut` with SVG semicircle arcs derived from the scoped category amounts, an accessible text summary, and the formatted expense total centered beneath the arc. Reuse the chart tone map rather than defining divergent colors.
- [ ] Implement `AnalyticsCategories` as buttons with marker, label, amount, percentage, and 16 tiny proportional segments. Selection is represented by the row background/pressed state, not a shadow.
- [ ] Ensure `Other` uses its stable grouped category-name set when filtering transactions.
- [ ] Run the focused tests until green:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsHalfDonut.test.tsx src/components/TransactionFlow/AnalyticsCategories.test.tsx
  ```

- [ ] Commit:

  ```bash
  git add src/components/TransactionFlow/AnalyticsHalfDonut.tsx src/components/TransactionFlow/AnalyticsHalfDonut.test.tsx src/components/TransactionFlow/AnalyticsCategories.tsx src/components/TransactionFlow/AnalyticsCategories.test.tsx
  git commit -m "feat: add reactive analytics overview"
  ```

## Task 5: Integrate the approved drawer flow

**Files:**

- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] Update integration tests first to cover:
  - the stacked chart being the first analytics section and the W/M/Q/C group staying on the header's right.
  - C revealing the range picker.
  - bucket selection updating Overview totals, half-donut, category amounts, and matching transactions.
  - category selection intersecting the selected bucket instead of clearing it.
  - the selected-period chip clearing only the bucket while the global clear action resets both filters.
  - range, custom-period, or currency changes clearing drill-down state.
- [ ] Run the drawer test and confirm the changed expectations fail:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx
  ```

- [ ] Add controlled `customPeriod` and `onCustomPeriodChange` props, then pass them into the domain summary builder.
- [ ] Reorder the loaded drawer to: chart and range controls, custom picker when active, selected-period chip, Overview with half-donut, top categories, then Transactions.
- [ ] Derive the visible scope with `buildAnalyticsScope(summary, selectedBucket)` and feed that same scope to Overview, donut, categories, and transaction filtering.
- [ ] Keep bucket and category filters independent and intersect them only for Transactions. Bar selection must not clear category selection; category selection must not clear the bucket.
- [ ] Keep the currency control compact, preserve loading/offline/error/focus behavior, and add no card borders or shadows around the chart.
- [ ] Run the drawer test until green:

  ```bash
  npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx
  ```

- [ ] Commit:

  ```bash
  git add src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
  git commit -m "feat: add analytics drill-down flow"
  ```

## Task 6: Integrate custom range state with the carousel and compact slide

**Files:**

- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`

- [ ] Add failing tests for:
  - a month-to-date default custom period owned by the carousel and passed consistently to compact/drawer analytics.
  - C selection updating the compact summary and opening the same custom range in the drawer.
  - M rendering daily compact bars and Q rendering weekly compact bars.
  - touch swipe and dot navigation remaining unchanged, with no mouse-drag implementation added.
- [ ] Run the focused tests and confirm failures:

  ```bash
  npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
  ```

- [ ] Store `customPeriod` in `HomeDashboardCarousel`, initialize it to month-to-date for the captured `analyticsNow`, and pass it to every summary build and to `AnalyticsDrawer`.
- [ ] Update compact range/comparison copy for custom ranges and let the existing read-only chart consume stacked buckets. Keep the current full-width, borderless carousel footprint.
- [ ] Run the focused tests until green:

  ```bash
  npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
  ```

- [ ] Commit:

  ```bash
  git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
  git commit -m "feat: connect custom analytics range"
  ```

## Task 7: Verify the mobile flow and capture the PR screenshot

**Files:**

- Modify: `e2e/home-carousel.spec.ts`
- Create: `docs/screenshots/stacked-category-analytics-mobile.png`

- [ ] Extend the E2E fixture with at least five expense categories plus income and transfer rows.
- [ ] Add browser assertions that:
  - the user can swipe between Transactions and Analytics.
  - M exposes daily bucket labels and Q exposes weekly buckets.
  - selecting a bar updates Overview, categories, and Transactions; non-selected bars are de-emphasized and the selected bar has no ring/border class.
  - C opens the range calendar and a completed range updates the analytics period.
- [ ] Run the mobile E2E test and fix only production defects it reveals:

  ```bash
  npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
  ```

- [ ] Start the app on a network-visible host, load the seeded mobile state at 390×844, open Analytics, choose M, select a representative bar, and capture the complete drawer to `docs/screenshots/stacked-category-analytics-mobile.png`.
- [ ] Inspect the screenshot for clipping, legibility, correct gray de-emphasis, no selected border, and the reactive donut/category/transaction state.
- [ ] Commit:

  ```bash
  git add e2e/home-carousel.spec.ts docs/screenshots/stacked-category-analytics-mobile.png
  git commit -m "test: cover stacked analytics mobile flow"
  ```

## Task 8: Final verification and pull request

**Files:**

- Modify if needed: any file already listed above

- [ ] Run the complete verification suite from the worktree and retain the outputs:

  ```bash
  npm test
  npm run lint
  npx tsc --noEmit
  npm run build
  npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
  ```

- [ ] Confirm there are no shadow utilities in changed UI files and no placeholder markers:

  ```bash
  git diff origin/main...HEAD -- '*.tsx' | rg 'shadow|TODO|FIXME|placeholder'
  ```

- [ ] Review the final diff and worktree status, then push `agent/stacked-analytics-chart`.
- [ ] Open a ready-for-review PR describing the range rules, filter interactions, accessibility behavior, and verification results. Embed the committed screenshot with its raw GitHub URL so it renders in the PR body.
- [ ] Confirm the PR URL and screenshot rendering before reporting completion.
