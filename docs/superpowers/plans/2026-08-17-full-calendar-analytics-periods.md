# Full-Calendar Analytics Periods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make W/M/Q/Y analytics use complete calendar periods in both views, add the grouped `—— month ——` Quarter axis, and remove the transfer-exclusion helper copy.

**Architecture:** Keep calendar calculations and Quarter axis metadata in the pure analytics model. Pass that metadata through the existing shared summary into `AnalyticsBarChart`, so carousel and sheet render one implementation. Preserve the existing TanStack query, custom-range, conversion, period-navigation, and drill-down paths.

**Tech Stack:** React 18, TypeScript, date-fns, Tailwind CSS, TanStack Query, Vitest, Testing Library, Biome.

---

## File Map

- `analytics.ts` and `analytics.test.ts` own and verify period math, bucket generation, comparison copy, and Quarter axis metadata.
- `AnalyticsBarChart.tsx` and its test own the shared Option A month-axis rendering.
- `AnalyticsSlide.tsx` and its test wire the axis into the carousel and show concrete period copy.
- `AnalyticsDrawer.tsx` and its test wire the axis into the sheet, announce full dates, and remove helper copy without changing calculations.
- `AnalyticsRangeToggle.tsx` and its test remove rolling/to-date accessible names.
- `e2e/home-carousel.spec.ts` keeps the mobile acceptance flow aligned with the new control names and removed helper copy.

### Task 1: Model complete calendar periods

**Files:**
- Modify: `src/components/TransactionFlow/analytics.test.ts`
- Modify: `src/components/TransactionFlow/analytics.ts`

- [ ] **Step 1: Write failing full-boundary tests**

Replace the W/M/Q/Y boundary cases with exact full-period expectations while retaining the custom-range case:

```ts
expect(getAnalyticsPeriods('week', new Date(2026, 7, 17, 12))).toEqual({
  current: {
    start: new Date(2026, 7, 17),
    end: new Date(2026, 7, 23, 23, 59, 59, 999),
  },
  comparison: {
    start: new Date(2026, 7, 10),
    end: new Date(2026, 7, 16, 23, 59, 59, 999),
  },
});

expect(getAnalyticsPeriods('month', new Date(2026, 2, 15, 12))).toEqual({
  current: {
    start: new Date(2026, 2, 1),
    end: new Date(2026, 2, 31, 23, 59, 59, 999),
  },
  comparison: {
    start: new Date(2026, 1, 1),
    end: new Date(2026, 1, 28, 23, 59, 59, 999),
  },
});

expect(getAnalyticsPeriods('quarter', new Date(2026, 4, 15, 12))).toEqual({
  current: {
    start: new Date(2026, 3, 1),
    end: new Date(2026, 5, 30, 23, 59, 59, 999),
  },
  comparison: {
    start: new Date(2026, 0, 1),
    end: new Date(2026, 2, 31, 23, 59, 59, 999),
  },
});

expect(getAnalyticsPeriods('year', new Date(2026, 7, 17, 12))).toEqual({
  current: {
    start: new Date(2026, 0, 1),
    end: new Date(2026, 11, 31, 23, 59, 59, 999),
  },
  comparison: {
    start: new Date(2025, 0, 1),
    end: new Date(2025, 11, 31, 23, 59, 59, 999),
  },
});
```

Add an offset test proving the prior Week is August 10–16 and its comparison is August 3–9.

- [ ] **Step 2: Write failing option, bucket, future-row, and group tests**

Assert current accessible labels end on August 31, September 30, and December 31. Add a Monday-aligned option case:

```ts
const weekOptions = buildAnalyticsPeriodOptions(
  'week',
  [transaction({ id: 'old', date: '2026-08-09T12:00:00', amount: 10 })],
  new Date(2026, 7, 17, 12),
);
expect(weekOptions.map(({ offset, label }) => ({ offset, label }))).toEqual([
  { offset: -2, label: 'Aug 3–9' },
  { offset: -1, label: 'Aug 10–16' },
  { offset: 0, label: 'Aug 17–23' },
]);
```

Use complete current bucket counts:

```ts
describe.each<[AnalyticsRange, number]>([
  ['week', 7],
  ['month', 31],
  ['quarter', 14],
  ['year', 12],
])('buildAnalyticsSummary(%s)', (range, expectedBuckets) => {
  it('returns buckets for the complete calendar period', () => {
    const summary = buildAnalyticsSummary({
      transactions: [],
      range,
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });
    expect(summary.buckets).toHaveLength(expectedBuckets);
  });
});
```

Add future-row coverage:

```ts
it.each([
  ['week', '2026-08-23T12:00:00'],
  ['month', '2026-08-31T12:00:00'],
  ['quarter', '2026-09-30T12:00:00'],
  ['year', '2026-12-31T12:00:00'],
] as const)('includes future rows inside the current %s', (range, date) => {
  const summary = buildAnalyticsSummary({
    transactions: [transaction({ id: 'future', date, amount: 25 })],
    range,
    currency: 'THB',
    now: new Date(2026, 7, 17, 12),
  });
  expect(summary.expenseTotal).toBe(25);
  expect(summary.transactions.map((row) => row.id)).toContain('future');
});
```

Add the exact Q2 groups:

```ts
const quarter = buildAnalyticsSummary({
  transactions: [],
  range: 'quarter',
  currency: 'THB',
  now: new Date(2026, 4, 15, 12),
});
expect(quarter.buckets).toHaveLength(13);
expect(quarter.axisGroups).toEqual([
  { key: '2026-04', label: 'Apr', bucketCount: 5 },
  { key: '2026-05', label: 'May', bucketCount: 4 },
  { key: '2026-06', label: 'Jun', bucketCount: 4 },
]);
```

Expect `previous week`, `previous month`, `previous quarter`, and `previous year` from `getComparisonText` with no elapsed or offset-dependent wording.

- [ ] **Step 3: Run the model test and confirm RED**

Run: `npm test -- src/components/TransactionFlow/analytics.test.ts`

Expected: FAIL on rolling boundaries, partial counts, missing `axisGroups`, future-row exclusion, and old comparison text.

- [ ] **Step 4: Implement full boundaries and metadata**

Import `addWeeks`, `endOfWeek`, `startOfWeek`, and `subWeeks`, then define:

```ts
const MONDAY_WEEK = { weekStartsOn: 1 as const };

export type AnalyticsAxisGroup = {
  key: string;
  label: string;
  bucketCount: number;
};
```

Add `axisGroups: AnalyticsAxisGroup[]` to `AnalyticsSummary`. Replace `getAnalyticsPeriods` with full boundaries:

```ts
if (range === 'week') {
  const anchor = addWeeks(now, offset);
  const comparisonAnchor = subWeeks(anchor, 1);
  return {
    current: {
      start: startOfWeek(anchor, MONDAY_WEEK),
      end: endOfWeek(anchor, MONDAY_WEEK),
    },
    comparison: {
      start: startOfWeek(comparisonAnchor, MONDAY_WEEK),
      end: endOfWeek(comparisonAnchor, MONDAY_WEEK),
    },
  };
}

if (range === 'month') {
  const anchor = addMonths(now, offset);
  const comparisonAnchor = subMonths(anchor, 1);
  return {
    current: { start: startOfMonth(anchor), end: endOfMonth(anchor) },
    comparison: {
      start: startOfMonth(comparisonAnchor),
      end: endOfMonth(comparisonAnchor),
    },
  };
}

if (range === 'year') {
  const anchor = addYears(now, offset);
  const comparisonAnchor = subYears(anchor, 1);
  return {
    current: { start: startOfYear(anchor), end: endOfYear(anchor) },
    comparison: {
      start: startOfYear(comparisonAnchor),
      end: endOfYear(comparisonAnchor),
    },
  };
}

const anchor = addQuarters(now, offset);
const comparisonAnchor = subQuarters(anchor, 1);
return {
  current: { start: startOfQuarter(anchor), end: endOfQuarter(anchor) },
  comparison: {
    start: startOfQuarter(comparisonAnchor),
    end: endOfQuarter(comparisonAnchor),
  },
};
```

Keep the custom branch unchanged except its default still ends at `endOfDay(now)`. Compute Week option distance from `startOfWeek(now, MONDAY_WEEK)` and `startOfWeek(earliest, MONDAY_WEEK)` divided by seven.

Add:

```ts
function buildAxisGroups(
  range: AnalyticsRange,
  current: DatePeriod,
  bucketCount: number,
): AnalyticsAxisGroup[] {
  if (range !== 'quarter') return [];
  const groups: AnalyticsAxisGroup[] = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = addDays(current.start, index * 7);
    const key = format(bucketStart, 'yyyy-MM');
    const last = groups.at(-1);
    if (last?.key === key) last.bucketCount += 1;
    else groups.push({ key, label: format(bucketStart, 'MMM'), bucketCount: 1 });
  }
  return groups;
}
```

Build buckets once, return `axisGroups: buildAxisGroups(range, periods.current, buckets.length)`, and remove the `periodOffset` argument from `getComparisonText`.

- [ ] **Step 5: Align existing weekly fixtures**

Keep explicit comparison rows on August 10–16. Move records intended as current from August 12–16 into August 18–22. Use category-series dates August 17 through 22 so all remain in one Monday-based week.

- [ ] **Step 6: Run the model test and confirm GREEN**

Run: `npm test -- src/components/TransactionFlow/analytics.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the period model**

```bash
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
git commit -m "feat: use full calendar analytics periods"
```

### Task 2: Render the shared Quarter month axis

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Write failing Option A chart tests**

Define three `AnalyticsAxisGroup` fixtures and assert:

```ts
render(
  <AnalyticsBarChart
    buckets={buckets}
    axisGroups={[
      { key: '2026-04', label: 'Apr', bucketCount: 5 },
      { key: '2026-05', label: 'May', bucketCount: 4 },
      { key: '2026-06', label: 'Jun', bucketCount: 4 },
    ]}
    series={series}
    currency="THB"
  />,
);
const axis = screen.getByTestId('analytics-grouped-axis');
expect(axis).toHaveAttribute('aria-hidden', 'true');
expect(within(axis).getByText('Apr').parentElement).toHaveStyle({ flexGrow: '5' });
expect(within(axis).getByText('May').parentElement).toHaveStyle({ flexGrow: '4' });
expect(within(axis).getByText('Jun').parentElement).toHaveStyle({ flexGrow: '4' });
expect(within(axis).getAllByTestId('analytics-axis-rule')).toHaveLength(6);
expect(screen.queryAllByTestId(/^analytics-label-/)).toHaveLength(0);
```

Retain a separate assertion that ordinary charts have no grouped axis and still render bucket labels.

- [ ] **Step 2: Write failing carousel and sheet integration tests**

Add `axisGroups: []` to the manual slide summary. Render a Quarter summary with Apr/May/Jun groups and assert `analytics-grouped-axis`. Render the drawer with `range="quarter"` and `now={new Date(2026, 4, 15, 12)}`, then assert Apr, May, and Jun within the grouped axis.

- [ ] **Step 3: Run chart/view tests and confirm RED**

Run: `npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

Expected: FAIL because `axisGroups` is not accepted, rendered, or passed by either view.

- [ ] **Step 4: Implement Option A once in the shared chart**

Add `axisGroups?: AnalyticsAxisGroup[]` to the props. Use `cn('flex flex-col', className)` on the figure, make the plot `min-h-0 flex-1`, omit individual labels while grouped, and render:

```tsx
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
```

Keep listbox, click, keyboard, stack, negative-baseline, and figure-summary logic unchanged. Pass `axisGroups={summary.axisGroups}` from both `AnalyticsSlide` and `AnalyticsDrawer`. Add no `shadow` class.

- [ ] **Step 5: Run chart/view tests and confirm GREEN**

Run: `npm test -- src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the shared axis**

```bash
git add src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "feat: group quarter analytics by month"
```

### Task 3: Replace rolling copy and remove the transfer helper

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsRangeToggle.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`

- [ ] **Step 1: Write failing control and carousel-copy tests**

Change range-control queries to the exact accessible names `Week`, `Month`, `Quarter`, and `Year`. In the slide fixture, use current option label `Aug 17–23`, accessible label `August 17, 2026 through August 23, 2026`, and assert:

```ts
expect(screen.getByText('spent · Aug 17–23')).toBeInTheDocument();
expect(screen.getByText('12% below previous week')).toBeInTheDocument();
expect(screen.queryByText(/last 7 days|to date|same elapsed days/)).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Month' }));
await user.click(screen.getByRole('button', { name: 'Year' }));
```

For Year, supply a selected option labeled `2026` and assert:

```ts
expect(screen.getByText('spent · 2026')).toBeInTheDocument();
expect(screen.getByText('12% below previous year')).toBeInTheDocument();
```

- [ ] **Step 2: Write failing sheet-copy and transfer-calculation tests**

Align the drawer fixture to one calendar week:

```ts
const customPeriod: DatePeriod = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 7, 19),
};
```

Keep Dining Out on August 17, move Coffee to August 18, move Salary to August 19, and set `baseProps.now` to August 19. Use period options `Aug 10–16` and `Aug 17–23` with complete accessible labels. Update transaction headers to `Today`, `Yesterday`, and `Monday, Aug 17`. Update the nested custom-range test to select August 18 and 19 so its expense remains `฿80`.

Assert the live region uses the option's full dates:

```ts
expect(status).toHaveTextContent(
  'August 17, 2026 through August 23, 2026 · Expenses ฿200',
);
expect(status).toHaveTextContent(
  'Loading August 17, 2026 through August 23, 2026 analytics',
);
```

Add this focused calculation/copy case:

```ts
it('hides transfer helper copy while keeping transfers out of totals', () => {
  renderDrawer({
    transactions: [
      ...transactions,
      {
        ...transactions[0],
        id: 'transfer',
        type: 'transfer',
        amount: 900,
        category: 'Savings',
      },
    ],
  });

  const overview = screen.getByRole('region', { name: 'Overview' });
  expect(within(overview).getAllByText('฿200').length).toBeGreaterThan(0);
  expect(within(overview).getByText('฿500')).toBeInTheDocument();
  expect(within(overview).getByText('฿300')).toBeInTheDocument();
  expect(screen.queryByText('Transfers are excluded from totals.')).not.toBeInTheDocument();
});
```

Update the mobile acceptance flow to query `Week` and `Month` instead of rolling/to-date names,
and replace its visible-helper assertion with:

```ts
await expect(
  analyticsDialog.getByText('Transfers are excluded from totals.'),
).toHaveCount(0);
```

- [ ] **Step 3: Run copy tests and confirm RED**

Run: `npm test -- src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

Expected: FAIL on old accessible names, rolling/to-date labels, old announcements, and the visible helper.

- [ ] **Step 4: Implement concrete full-period copy**

Replace the range options with:

```ts
const OPTIONS: Array<{ value: AnalyticsRange; short: string; label: string }> = [
  { value: 'week', short: 'W', label: 'Week' },
  { value: 'month', short: 'M', label: 'Month' },
  { value: 'quarter', short: 'Q', label: 'Quarter' },
  { value: 'year', short: 'Y', label: 'Year' },
  { value: 'custom', short: 'C', label: 'Custom date range' },
];
```

Replace the slide helper with:

```ts
function rangeLabel(range: AnalyticsRange, selectedPeriodLabel?: string): string {
  if (range === 'custom') return 'spent · custom range';
  return `spent · ${selectedPeriodLabel ?? range}`;
}
```

Call it as `rangeLabel(range, selectedPeriod?.label)` and call `getComparisonText` without an offset. Replace the drawer announcement selector with:

```ts
const rangeAnnouncement =
  range === 'custom'
    ? `Custom, ${format(customPeriod.start, 'MMM d')} through ${format(customPeriod.end, 'MMM d')}`
    : selectedPeriod?.accessibleLabel ?? range;
```

Delete only:

```tsx
<p className="mt-1 text-[11px] text-muted-foreground">
  Transfers are excluded from totals.
</p>
```

- [ ] **Step 5: Run copy tests and confirm GREEN**

Run: `npm test -- src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 6: Check old copy and forbidden styling**

Run:

```bash
rg -n "last 7 days|month to date|quarter to date|year to date|same elapsed days|Transfers are excluded from totals" src/components/TransactionFlow
rg -n "\bshadow(?:-|\b)" src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsRangeToggle.tsx
```

Expected: no production-code matches and no forbidden shadow classes. Intentional negative assertions in tests may match the first search.

- [ ] **Step 7: Commit the interface copy**

```bash
git add src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx e2e/home-carousel.spec.ts
git commit -m "fix: describe full analytics periods"
```

### Task 4: Verify the integrated feature

**Files:**
- Verify: all changed production and test files

- [ ] **Step 1: Run all analytics and carousel tests**

Run:

```bash
npm test -- src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/AnalyticsBarChart.test.tsx src/components/TransactionFlow/AnalyticsRangeToggle.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the mobile carousel acceptance flow**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: all test files pass with zero failures.

- [ ] **Step 4: Run lint and typecheck**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both exit 0 with no errors.

- [ ] **Step 5: Check final diff and state**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors, a clean worktree, and focused design/implementation commits above `origin/main`.
