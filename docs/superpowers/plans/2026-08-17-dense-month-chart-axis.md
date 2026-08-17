# Dense Month Chart Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Month analytics bars visible on mobile and replace truncated dates with a one-row sequence of weekly date anchors and weekday initials in both the carousel and sheet.

**Architecture:** Keep analytics aggregation unchanged. Add the active `AnalyticsRange` to the shared `AnalyticsBarChart` API, let that component own Month-only dense spacing and label generation, and pass the range from the existing slide and drawer callers. Preserve the existing Quarter grouped axis and all other range presentations.

**Tech Stack:** React, TypeScript, date-fns, Tailwind CSS, Vitest/Testing Library, Playwright

---

### Task 1: Specify dense Month rendering at component and integration boundaries

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] **Step 1: Add the failing shared-chart test**

Create 30 daily buckets for June 2026, which begins on Monday, and render the chart with `range="month"`:

```tsx
const juneBuckets: AnalyticsBucket[] = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1;
  return {
    key: `2026-06-${String(day).padStart(2, '0')}`,
    label: String(day),
    accessibleLabel: `June ${day}`,
    amount: day === 1 ? 100 : 1,
    segments: [{ seriesKey: 'category-0', amount: day === 1 ? 100 : 1 }],
    transactionIds: [],
  };
});

render(
  <AnalyticsBarChart
    range="month"
    buckets={juneBuckets}
    series={series}
    currency="THB"
  />,
);

const axis = screen.getByTestId('analytics-month-axis');
expect(axis).toHaveAttribute('aria-hidden', 'true');
expect(
  within(axis)
    .getAllByTestId('analytics-month-axis-label')
    .map((label) => label.textContent),
).toEqual([
  '1', 'T', 'W', 'T', 'F', 'S', 'S',
  '8', 'T', 'W', 'T', 'F', 'S', 'S',
  '15', 'T', 'W', 'T', 'F', 'S', 'S',
  '22', 'T', 'W', 'T', 'F', 'S', 'S',
  '29', 'T',
]);
expect(screen.getByTestId('analytics-chart-plot')).toHaveClass('gap-px');
expect(screen.getByTestId('segment-2026-06-01-category-0').parentElement).toHaveClass(
  'inset-x-0',
);
expect(screen.queryAllByTestId(/^analytics-label-/)).toHaveLength(0);
```

Update existing direct chart renders with the matching explicit range: `week` for the short daily fixtures, `custom` for the 17-day sparse-label fixture, `year` for month buckets, and `quarter` for grouped weekly buckets.

- [ ] **Step 2: Add failing carousel and sheet integration tests**

In `AnalyticsSlide.test.tsx`, render a Month summary with ISO daily bucket keys and assert `analytics-month-axis` contains `1 T W T F S S 8` at the start.

In `AnalyticsDrawer.test.tsx`, add:

```tsx
it('renders the shared dense axis for a complete month', () => {
  renderDrawer({
    range: 'month',
    transactions: [],
    now: new Date(2026, 5, 15, 12),
  });

  const labels = within(screen.getByTestId('analytics-month-axis'))
    .getAllByTestId('analytics-month-axis-label')
    .map((label) => label.textContent);
  expect(labels.slice(0, 8)).toEqual(['1', 'T', 'W', 'T', 'F', 'S', 'S', '8']);
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because `AnalyticsBarChart` has no Month range mode or `analytics-month-axis`, and callers do not pass a range.

- [ ] **Step 4: Commit the failing tests only after recording the RED result**

Do not commit yet; keep the failing tests with Task 2 so the implementation and its regression coverage land together.

### Task 2: Implement shared dense Month bars and axis

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Test: `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`
- Test: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Test: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] **Step 1: Add range-aware Month labeling to the shared chart**

Import `format` and `parseISO` from `date-fns`, import `AnalyticsRange`, and require `range` in `AnalyticsBarChartProps`:

```tsx
import { format, parseISO } from 'date-fns';

type AnalyticsBarChartProps = {
  range: AnalyticsRange;
  buckets: AnalyticsBucket[];
  axisGroups?: AnalyticsAxisGroup[];
  series: AnalyticsSeries[];
  currency: string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onBucketActivate?: (key: string, trigger: HTMLElement) => void;
  className?: string;
};

function monthAxisLabel(bucket: AnalyticsBucket, index: number): string {
  if (index % 7 === 0) return bucket.label;
  return format(parseISO(bucket.key), 'EEEEE');
}
```

Inside the component, define `const isDenseMonth = range === 'month';`.

- [ ] **Step 2: Apply dense spacing without changing other ranges**

Use conditional stack insets:

```tsx
className={cn(
  'absolute flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-[filter,opacity] motion-reduce:transition-none',
  isDenseMonth ? 'inset-x-0' : 'inset-x-1',
  muted && 'grayscale opacity-25',
)}
```

Apply the same `isDenseMonth ? 'inset-x-0' : 'inset-x-1'` choice to negative stacks. Hide ordinary per-bucket labels when `isDenseMonth` or `hasGroupedAxis` is true.

Give both plot branches `data-testid="analytics-chart-plot"` and select gaps with `isDenseMonth ? 'gap-px' : 'gap-1'` while keeping all current focus and interaction classes.

- [ ] **Step 3: Render the aligned single-row Month axis**

After the plot and before the existing Quarter grouped-axis result, render:

```tsx
{isDenseMonth ? (
  <div
    data-testid="analytics-month-axis"
    aria-hidden="true"
    className="mt-1 flex shrink-0 gap-px text-[9px] leading-none text-muted-foreground"
  >
    {buckets.map((bucket, index) => (
      <span
        key={bucket.key}
        data-testid="analytics-month-axis-label"
        className="min-w-0 flex-1 text-center"
      >
        {monthAxisLabel(bucket, index)}
      </span>
    ))}
  </div>
) : hasGroupedAxis ? (
  <div
    data-testid="analytics-grouped-axis"
    aria-hidden="true"
    className="mt-1 flex shrink-0 gap-1 text-[9px] leading-none text-muted-foreground"
  >
    {axisGroups.map((group) => (
      <span
        key={group.key}
        className="flex min-w-0 items-center gap-1"
        style={{ flexBasis: 0, flexGrow: group.bucketCount }}
      >
        <span data-testid="analytics-axis-rule" className="h-px min-w-0 flex-1 bg-border/70" />
        <span>{group.label}</span>
        <span data-testid="analytics-axis-rule" className="h-px min-w-0 flex-1 bg-border/70" />
      </span>
    ))}
  </div>
) : null}
```

The Month label class must not include `truncate`, overflow ellipses, or a shadow.

- [ ] **Step 4: Wire the active range from both surfaces**

In `AnalyticsSlide.tsx`, pass the summary range with the existing chart inputs:

```tsx
<AnalyticsBarChart
  range={summary.range}
  buckets={summary.buckets}
  axisGroups={summary.axisGroups}
  series={summary.series}
  currency={summary.currency}
  onBucketActivate={onBucketSelect}
  className="mt-1 min-h-10 flex-1"
/>
```

In `AnalyticsDrawer.tsx`, pass the same range while retaining selection:

```tsx
<AnalyticsBarChart
  range={summary.range}
  buckets={summary.buckets}
  axisGroups={summary.axisGroups}
  series={summary.series}
  currency={summary.currency}
  selectedKey={selectedBucket}
  onSelect={(key) =>
    setSelectedBucket((current) => (key === null || current === key ? null : key))
  }
  className="h-44"
/>
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: all focused files pass.

- [ ] **Step 6: Commit the component change**

```bash
git add src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "fix: clarify dense month analytics"
```

### Task 3: Verify mobile width and labels in the real carousel and sheet

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Add Month-axis browser assertions**

After switching the compact carousel to Month, derive the expected sequence using the current local month:

```tsx
const monthStart = startOfMonth(analyticsNow);
const expectedMonthAxis = Array.from({ length: getDaysInMonth(analyticsNow) }, (_, index) =>
  index % 7 === 0 ? String(index + 1) : format(addDays(monthStart, index), 'EEEEE'),
);
const compactMonthAxis = analyticsSlide.getByTestId('analytics-month-axis');
await expect(compactMonthAxis.getByTestId('analytics-month-axis-label')).toHaveCount(
  expectedMonthAxis.length,
);
expect(
  await compactMonthAxis
    .getByTestId('analytics-month-axis-label')
    .allTextContents(),
).toEqual(expectedMonthAxis);
expect(await compactMonthAxis.textContent()).not.toContain('…');
```

Measure the parent stack of the first rendered segment and require useful width:

```tsx
await expect
  .poll(() =>
    analyticsSlide
      .locator('[data-testid^="segment-"]')
      .first()
      .evaluate((segment) => segment.parentElement?.getBoundingClientRect().width ?? 0),
  )
  .toBeGreaterThan(6);
```

When the Month analytics sheet is reopened later in the scenario, assert its `analytics-month-axis` is visible and exposes the same number of axis cells.

- [ ] **Step 2: Run the mobile E2E**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: 1 passed.

- [ ] **Step 3: Commit the browser regression coverage**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover dense month analytics"
```

### Task 4: Full verification, rebase, and direct main push

**Files:**
- Verify all files changed by Tasks 1–3

- [ ] **Step 1: Run all local gates**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
git diff --check origin/main...HEAD
rg -n "\\bshadow(?:-|\\b)" src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx
```

Expected: every test passes, lint and TypeScript exit 0, diff check has no output, and the shadow scan has no matches.

- [ ] **Step 2: Rebase onto the latest remote main**

Run:

```bash
git fetch origin main
git rebase origin/main
git status -sb
git rev-list --left-right --count origin/main...HEAD
```

Expected: clean worktree and a divergence count with `0` commits on the `origin/main` side.

- [ ] **Step 3: Re-run verification after the rebase**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: all unit/component tests and the mobile E2E pass; lint and TypeScript exit 0.

- [ ] **Step 4: Push the rebased branch directly to main**

Refresh the remote ref once more and confirm it is still an ancestor before pushing:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
git fetch origin main
git rev-parse HEAD origin/main
```

Expected: push succeeds without force and the two final SHAs are identical.
