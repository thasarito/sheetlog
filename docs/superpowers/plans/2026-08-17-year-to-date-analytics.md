# Year-to-Date Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Y` year-to-date analytics preset with monthly stacked buckets, then rebase and refresh pull request #149.

**Architecture:** Extend the existing `AnalyticsRange` domain model so one shared summary continues to drive the compact slide and detail drawer. Keep range-specific date math and bucket construction in `analytics.ts`; presentation components only add the fifth toggle option and YTD copy. Preserve the existing custom picker, selection, category, and transaction flows unchanged.

**Tech Stack:** React 18, TypeScript, date-fns, Vitest, Testing Library, Playwright, Vite, Git/GitHub

---

## File Map

- `src/components/TransactionFlow/analytics.ts`: YTD boundaries, prior-year comparison, and monthly buckets.
- `src/components/TransactionFlow/analytics.test.ts`: domain regression tests for YTD periods, buckets, and comparison copy.
- `src/components/TransactionFlow/AnalyticsRangeToggle.tsx`: ordered `W M Q Y C` segmented control.
- `src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx`: fifth-option selection contract.
- `src/components/TransactionFlow/AnalyticsSlide.tsx`: compact YTD headline copy.
- `src/components/TransactionFlow/AnalyticsSlide.test.tsx`: compact YTD rendering and selection.
- `src/components/TransactionFlow/AnalyticsDrawer.tsx`: accessible YTD range name.
- `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`: YTD status and range-change behavior.
- `src/components/TransactionFlow/AnalyticsBarChart.tsx`: keep every monthly label visible.
- `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`: monthly-label regression coverage.
- `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`: shared YTD summary integration.
- `e2e/home-carousel.spec.ts`: mobile YTD selection and monthly-bucket coverage.
- `output/playwright/stacked-category-analytics-mobile.png`: refreshed PR screenshot showing `Y`.

### Task 1: Rebase the clean feature branch

**Files:** Existing commits only; resolve overlapping files without discarding either side.

- [ ] **Step 1: Confirm clean state and fetched base**

Run:

```bash
git status --short --branch
git rev-parse origin/main
```

Expected: no working-tree changes and `origin/main` resolves to the fetched commit.

- [ ] **Step 2: Rebase onto the requested base**

Run:

```bash
git rebase origin/main
```

Expected: the analytics commits are replayed onto `origin/main`; if a conflict occurs, preserve the new mainline transaction UI and the analytics carousel behavior, stage each resolved file, and continue with `GIT_EDITOR=true git rebase --continue`.

- [ ] **Step 3: Verify ancestry and branch scope**

Run:

```bash
git merge-base --is-ancestor origin/main HEAD
git status --short
```

Expected: both commands succeed and the worktree is clean.

### Task 2: Add YTD period math and monthly buckets

**Files:**
- Modify: `src/components/TransactionFlow/analytics.test.ts`
- Modify: `src/components/TransactionFlow/analytics.ts`

- [ ] **Step 1: Write failing domain tests**

Add assertions equivalent to:

```ts
expect(getAnalyticsPeriods('year', new Date(2026, 7, 17, 12))).toEqual({
  current: {
    start: new Date(2026, 0, 1),
    end: new Date(2026, 7, 17, 23, 59, 59, 999),
  },
  comparison: {
    start: new Date(2025, 0, 1),
    end: new Date(2025, 7, 17, 23, 59, 59, 999),
  },
});

const summary = buildAnalyticsSummary({
  transactions: [],
  range: 'year',
  currency: 'THB',
  now: new Date(2026, 7, 17, 12),
});
expect(summary.buckets).toHaveLength(8);
expect(summary.buckets.map(({ key, label }) => ({ key, label }))).toEqual([
  { key: '2026-01-month', label: 'Jan' },
  { key: '2026-02-month', label: 'Feb' },
  { key: '2026-03-month', label: 'Mar' },
  { key: '2026-04-month', label: 'Apr' },
  { key: '2026-05-month', label: 'May' },
  { key: '2026-06-month', label: 'Jun' },
  { key: '2026-07-month', label: 'Jul' },
  { key: '2026-08-month', label: 'Aug' },
]);
expect(summary.buckets[0].accessibleLabel).toBe('January 1 through January 31');
expect(summary.buckets.at(-1)?.accessibleLabel).toBe('August 1 through August 17');
expect(getComparisonText({ direction: 'above', percentage: 8 }, 'year')).toBe(
  '8% above the same elapsed days last year',
);
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts
```

Expected: FAIL because `year` is not an `AnalyticsRange` and no monthly buckets exist.

- [ ] **Step 3: Implement the minimal domain extension**

Extend the range and period branch:

```ts
export type AnalyticsRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

if (range === 'year') {
  const currentStart = startOfYear(now);
  const comparisonStart = startOfYear(subYears(now, 1));
  const elapsedDays = differenceInCalendarDays(currentEnd, currentStart);
  return {
    current: { start: currentStart, end: currentEnd },
    comparison: {
      start: comparisonStart,
      end: minDate(endOfYear(comparisonStart), endOfDay(addDays(comparisonStart, elapsedDays))),
    },
  };
}
```

Before the existing weekly fallback in `buildBuckets`, add:

```ts
if (range === 'year') {
  const elapsedMonths = differenceInCalendarMonths(current.end, current.start) + 1;
  return Array.from({ length: elapsedMonths }, (_, index) => {
    const start = startOfMonth(addMonths(current.start, index));
    const end = minDate(current.end, endOfMonth(start));
    return makeBucket(
      `${format(start, 'yyyy-MM')}-month`,
      format(start, 'MMM'),
      `${format(start, 'MMMM d')} through ${format(end, 'MMMM d')}`,
      { start, end },
      rows,
      series,
    );
  });
}
```

Add `addMonths`, `differenceInCalendarMonths`, `endOfYear`, `startOfYear`, and `subYears` imports, and return `the same elapsed days last year` from `getComparisonText` for `year`.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts
```

Expected: all analytics domain tests pass.

- [ ] **Step 5: Commit the domain change**

```bash
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
git commit -m "feat: add year-to-date analytics range"
```

### Task 3: Expose the fifth range in both analytics surfaces

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsRangeToggle.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`

- [ ] **Step 1: Write failing presentation tests**

Assert the group uses five columns, `Year, year to date` calls `onChange('year', trigger)`, the compact slide shows `spent · year to date`, and the drawer live status reads `Year, year to date · Expenses …`.

```ts
expect(screen.getByRole('group', { name: 'Analytics range' })).toHaveClass('grid-cols-5');
await user.click(screen.getByRole('button', { name: 'Year, year to date' }));
expect(onChange).toHaveBeenCalledWith('year', expect.any(HTMLButtonElement));
expect(screen.getByText('spent · year to date')).toBeInTheDocument();
expect(status).toHaveTextContent('Year, year to date · Expenses ฿200');
```

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because the fifth option and YTD labels are absent.

- [ ] **Step 3: Implement the minimal presentation changes**

Use this ordered option list and five-column width:

```ts
const OPTIONS = [
  { value: 'week', short: 'W', label: 'Week, last 7 days' },
  { value: 'month', short: 'M', label: 'Month, month to date' },
  { value: 'quarter', short: 'Q', label: 'Quarter, quarter to date' },
  { value: 'year', short: 'Y', label: 'Year, year to date' },
  { value: 'custom', short: 'C', label: 'Custom date range' },
] satisfies Array<{ value: AnalyticsRange; short: string; label: string }>;
```

Change the fieldset sizing to `w-44 grid-cols-5`. Add explicit `year` branches returning `spent · year to date` in `AnalyticsSlide.tsx` and `Year, year to date` in `AnalyticsDrawer.tsx`; leave custom-picker behavior restricted to `custom`.

- [ ] **Step 4: Run the component tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: all selected component tests pass.

- [ ] **Step 5: Commit the presentation change**

```bash
git add src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "feat: expose year-to-date analytics"
```

### Task 4: Preserve monthly labels and verify integration

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Write failing chart and carousel integration tests**

Create 12 buckets with keys ending in `-month` and assert all month labels render. Extend the carousel mock with a Y button and assert its summary starts January 1 and every bucket key ends in `-month`.

```ts
expect(screen.getAllByTestId(/^analytics-label-/)).toHaveLength(12);
await user.click(screen.getByRole('button', { name: 'Test year range' }));
const yearSummary = analyticsSlideCalls.at(-1)?.summary;
expect(yearSummary?.range).toBe('year');
expect(yearSummary?.periods.current.start.getMonth()).toBe(0);
expect(yearSummary?.buckets.every((bucket) => bucket.key.endsWith('-month'))).toBe(true);
```

- [ ] **Step 2: Run focused integration tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: FAIL because dense monthly bucket labels are currently thinned and the mock exposes no Y action.

- [ ] **Step 3: Implement the monthly label rule and mock interaction**

In `showLabel`, keep monthly labels visible before daily/weekly thinning:

```ts
if (bucket.key.endsWith('-month')) return true;
```

Add a test-only mock button that calls `props.onRangeChange('year')`; no production carousel branching is necessary because the existing generic `AnalyticsRange` state rebuilds the shared summary.

- [ ] **Step 4: Run focused integration tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: all focused integration tests pass.

- [ ] **Step 5: Extend Mobile Chrome coverage**

In `e2e/home-carousel.spec.ts`, click `Year, year to date`, assert `aria-pressed="true"`, and assert the listbox has `differenceInCalendarMonths(new Date(), startOfYear(new Date())) + 1` options before continuing to C.

- [ ] **Step 6: Run the targeted E2E test**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
```

Expected: one Mobile Chrome test passes.

- [ ] **Step 7: Commit integration coverage**

```bash
git add src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx e2e/home-carousel.spec.ts
git commit -m "test: cover year-to-date analytics flow"
```

### Task 5: Refresh evidence and update PR #149

**Files:**
- Modify: `output/playwright/stacked-category-analytics-mobile.png`

- [ ] **Step 1: Refresh and inspect the mobile screenshot**

Use the running Tailscale preview at `http://100.69.2.40:5175/app`, open Analytics, select Y, open View all, and capture the 393×851 viewport to `output/playwright/stacked-category-analytics-mobile.png`. Inspect it to confirm `W M Q Y C` fits on the right without overflow and no shadow appears.

- [ ] **Step 2: Commit the refreshed evidence**

```bash
git add output/playwright/stacked-category-analytics-mobile.png
git commit -m "docs: refresh year-to-date analytics screenshot"
```

- [ ] **Step 3: Run full verification from the rebased HEAD**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
git diff --check origin/main...HEAD
```

Expected: every command exits zero, all unit tests pass, and the Mobile Chrome test reports one pass.

- [ ] **Step 4: Update the existing remote branch safely**

Run:

```bash
git push --force-with-lease origin agent/stacked-analytics-chart
```

Expected: GitHub updates PR #149 while protecting against unexpected remote branch movement.

- [ ] **Step 5: Refresh the PR description and verify preview links**

Update PR #149 to mention YTD monthly buckets and replace the screenshot URL with the new immutable HEAD SHA. Verify the PR, both raw screenshots, and `http://100.69.2.40:5175/app` return successfully.
