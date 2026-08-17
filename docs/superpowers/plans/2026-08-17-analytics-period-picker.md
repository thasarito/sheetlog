# Analytics Period Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, locally bounded horizontal period picker to home and detailed Analytics, let the compact chart fill its available height, and clear drawer drill-down filters whenever the sheet closes.

**Architecture:** Extend the pure analytics model with a non-positive period offset and chronological period options derived from local transaction dates. Keep the offset in `HomeDashboardCarousel`, render it through a focused `AnalyticsPeriodPicker` in both views, and leave bucket/category drill-down state local to `AnalyticsDrawer`. Native horizontal scroll snapping handles touch momentum while the outer home carousel ignores gestures originating inside the nested picker.

**Tech Stack:** React 18, TypeScript, date-fns, Tailwind CSS, TanStack Query-backed transaction history, Vitest/Testing Library, Playwright.

---

## File Structure

- Modify `src/components/TransactionFlow/analytics.ts` for period boundaries, option inventory, labels, comparison copy, and offset-aware summaries.
- Modify `src/components/TransactionFlow/analytics.test.ts` for pure date and inventory behavior.
- Create `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx` for horizontal selection interaction.
- Create `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx` for option, arrow, keyboard, and settled-scroll behavior.
- Modify `src/components/TransactionFlow/AnalyticsSlide.tsx` and its test for the picker, accurate captions, and flex-growing chart.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.tsx` and its test for shared period selection and close-time filter reset.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.tsx` and its test for shared offset state, range resets, and nested gesture ownership.
- Modify `e2e/home-carousel.spec.ts` for mobile picker swipe, shared sheet state, responsive chart height, and reopened-sheet filters.
- Refresh the Analytics screenshots already attached to PR #149 after browser verification.

### Task 1: Add the pure period model

**Files:**
- Modify: `src/components/TransactionFlow/analytics.ts`
- Test: `src/components/TransactionFlow/analytics.test.ts`

- [ ] **Step 1: Write failing period-boundary and inventory tests**

Add tests that exercise the public API before it exists:

```ts
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  getAnalyticsPeriods,
  getComparisonText,
} from './analytics';

it('uses complete historical calendar periods while current periods remain to-date', () => {
  const now = new Date(2026, 7, 17, 12);
  expect(getAnalyticsPeriods('month', now, undefined, 0).current).toEqual({
    start: new Date(2026, 7, 1),
    end: new Date(2026, 7, 17, 23, 59, 59, 999),
  });
  expect(getAnalyticsPeriods('month', now, undefined, -1)).toEqual({
    current: {
      start: new Date(2026, 6, 1),
      end: new Date(2026, 6, 31, 23, 59, 59, 999),
    },
    comparison: {
      start: new Date(2026, 5, 1),
      end: new Date(2026, 5, 30, 23, 59, 59, 999),
    },
  });
});

it('builds every continuous local period including empty gaps', () => {
  const options = buildAnalyticsPeriodOptions(
    'month',
    [transaction({ id: 'old', date: '2026-05-09T12:00:00', amount: 10 })],
    new Date(2026, 7, 17, 12),
  );
  expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
    { offset: -3, label: 'May 2026' },
    { offset: -2, label: 'June 2026' },
    { offset: -1, label: 'July 2026' },
    { offset: 0, label: 'August 2026' },
  ]);
});

it('keeps only current when local history is empty and ignores invalid or future bounds', () => {
  const options = buildAnalyticsPeriodOptions(
    'year',
    [
      { ...transaction({ id: 'future', date: '2027-01-01T12:00:00', amount: 10 }) },
      {
        ...transaction({ id: 'invalid', date: '2024-01-01T12:00:00', amount: 10 }),
        sheetRowValid: false,
      },
    ],
    new Date(2026, 7, 17, 12),
  );
  expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
    { offset: 0, label: '2026' },
  ]);
});

it('moves through adjacent rolling seven-day blocks', () => {
  const periods = getAnalyticsPeriods('week', new Date(2026, 7, 17, 12), undefined, -1);
  expect(periods.current).toEqual({
    start: new Date(2026, 7, 4),
    end: new Date(2026, 7, 10, 23, 59, 59, 999),
  });
});

it('uses complete historical comparison copy', () => {
  expect(getComparisonText({ direction: 'below', percentage: 12 }, 'month', -1)).toBe(
    '12% below previous month',
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts
```

Expected: FAIL because `buildAnalyticsPeriodOptions` is not exported and the existing functions do not accept or apply a period offset.

- [ ] **Step 3: Implement offset-aware periods and option generation**

Add the public type and input field:

```ts
export type AnalyticsPeriodOption = {
  key: string;
  offset: number;
  label: string;
  accessibleLabel: string;
  period: DatePeriod;
};

type BuildAnalyticsSummaryInput = {
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  currency: string;
  now: Date;
  customPeriod?: DatePeriod;
  periodOffset?: number;
};
```

Extend the date-fns imports with `addQuarters`, `addYears`,
`differenceInCalendarQuarters`, and `differenceInCalendarYears`. Change
`getAnalyticsPeriods` to accept `periodOffset = 0`, clamp it with
`Math.min(0, Math.trunc(periodOffset))`, and apply these rules:

```ts
const offset = Math.min(0, Math.trunc(periodOffset));

if (range === 'week') {
  const end = endOfDay(addDays(now, offset * 7));
  const start = startOfDay(subDays(end, 6));
  return {
    current: { start, end },
    comparison: {
      start: startOfDay(subDays(start, 7)),
      end: endOfDay(subDays(start, 1)),
    },
  };
}

if (range === 'month') {
  const anchor = addMonths(now, offset);
  const start = startOfMonth(anchor);
  const end = offset === 0 ? endOfDay(now) : endOfMonth(anchor);
  const comparisonStart = startOfMonth(subMonths(anchor, 1));
  const comparisonEnd =
    offset === 0
      ? minDate(
          endOfMonth(comparisonStart),
          endOfDay(addDays(comparisonStart, differenceInCalendarDays(end, start))),
        )
      : endOfMonth(comparisonStart);
  return {
    current: { start, end },
    comparison: { start: comparisonStart, end: comparisonEnd },
  };
}
```

Apply the same current-versus-complete rule to quarter and year using their
corresponding date-fns helpers. Custom continues to ignore the offset.

Export `buildAnalyticsPeriodOptions(range, transactions, now)`. Find the earliest
parseable, non-future row whose `sheetRowValid !== false`; compute the number of
seven-day blocks, calendar months, quarters, or years between it and `now`; and emit
every offset from the negative distance through `0`. Use exact labels:

```ts
function periodOption(range: Exclude<AnalyticsRange, 'custom'>, now: Date, offset: number) {
  const period = getAnalyticsPeriods(range, now, undefined, offset).current;
  const label =
    range === 'week'
      ? formatCompactDateRange(period)
      : range === 'month'
        ? format(period.start, 'MMMM yyyy')
        : range === 'quarter'
          ? `Q${Math.floor(period.start.getMonth() / 3) + 1} ${format(period.start, 'yyyy')}`
          : format(period.start, 'yyyy');
  return {
    key: `${range}-${format(period.start, 'yyyy-MM-dd')}-${format(period.end, 'yyyy-MM-dd')}`,
    offset,
    label,
    accessibleLabel: formatAccessiblePeriod(range, period),
    period,
  };
}
```

Pass `periodOffset` into `getAnalyticsPeriods` inside `buildAnalyticsSummary`. Extend
`getComparisonText(comparison, range, periodOffset = 0)` so historical month,
quarter, and year use `previous month`, `previous quarter`, and `previous year`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts
```

Expected: PASS, including all existing aggregation and bucket tests.

- [ ] **Step 5: Commit the pure period model**

```bash
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
git commit -m "feat: model navigable analytics periods"
```

### Task 2: Build the horizontal period picker

**Files:**
- Create: `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx`
- Create: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Write failing picker interaction tests**

Create a test with four month options and assert that every option renders, the selected option is
semantic, arrows move exactly one option, current and earliest boundaries disable correctly,
keyboard Home/End work, and a settled scroll selects the option nearest the viewport center.

```tsx
const options: AnalyticsPeriodOption[] = [-3, -2, -1, 0].map((offset, index) => ({
  key: `month-${offset}`,
  offset,
  label: ['May 2026', 'June 2026', 'July 2026', 'August 2026'][index],
  accessibleLabel: ['May 2026', 'June 2026', 'July 2026', 'August 2026'][index],
  period: { start: new Date(2026, index + 4, 1), end: new Date(2026, index + 5, 0) },
}));

it('renders all local periods and navigates one option at a time', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />,
  );

  expect(screen.getAllByRole('option')).toHaveLength(4);
  expect(screen.getByRole('option', { name: 'July 2026' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Previous period, June 2026' }));
  expect(onChange).toHaveBeenLastCalledWith(-2);
  await user.click(screen.getByRole('button', { name: 'Next period, August 2026' }));
  expect(onChange).toHaveBeenLastCalledWith(0);
});
```

- [ ] **Step 2: Run the picker test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: FAIL because `AnalyticsPeriodPicker.tsx` does not exist.

- [ ] **Step 3: Implement the dedicated picker**

Implement these props and behaviors without changing `Picker.tsx` or `inline-picker.tsx`:

```tsx
type AnalyticsPeriodPickerProps = {
  options: AnalyticsPeriodOption[];
  value: number;
  onChange: (offset: number) => void;
  className?: string;
};

export function AnalyticsPeriodPicker({
  options,
  value,
  onChange,
  className,
}: AnalyticsPeriodPickerProps) {
  // Keep a viewport ref, option refs by offset, and an 80ms scroll-settle timer.
  // Center `value` on controlled changes. At settle, measure each option's center
  // against `scrollLeft + clientWidth / 2` and emit the nearest offset.
  // Render 44px ChevronLeft/ChevronRight buttons around a masked, snap-x viewport.
}
```

The viewport must include:

```tsx
<div
  ref={viewportRef}
  data-home-carousel-swipe-lock="true"
  data-testid="analytics-period-picker"
  role="listbox"
  aria-label="Analytics period"
  tabIndex={0}
  onScroll={handleScroll}
  onKeyDown={handleKeyDown}
  className="min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-x] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] [&::-webkit-scrollbar]:hidden"
>
  <div className="flex min-w-max px-[calc(50%-4rem)]">
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        role="option"
        aria-selected={option.offset === value}
        aria-label={option.accessibleLabel}
        onClick={() => onChange(option.offset)}
        className="flex h-9 w-32 shrink-0 snap-center items-center justify-center px-2 text-xs font-semibold"
      >
        {option.label}
      </button>
    ))}
  </div>
</div>
```

Selected text uses `text-primary`; other values use `text-muted-foreground`. Do not add a border,
card, shadow, mouse-drag handler, or new dependency. Clean up scroll timers on unmount and honor
`prefers-reduced-motion` when centering.

- [ ] **Step 4: Run the picker test and verify GREEN**

```bash
npx vitest run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: PASS with all options and input methods covered.

- [ ] **Step 5: Commit the picker**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.tsx src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
git commit -m "feat: add horizontal analytics period picker"
```

### Task 3: Share period state and expand the compact chart

**Files:**
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`

- [ ] **Step 1: Write failing shared-state and layout tests**

Extend the carousel mocks to capture `periodOptions`, `periodOffset`, and `onPeriodChange`. Assert:

```tsx
await user.click(screen.getByRole('button', { name: 'Test previous period' }));
expect(analyticsSlideCalls.at(-1)?.periodOffset).toBe(-1);
expect(analyticsDrawerCalls.at(-1)?.periodOffset).toBe(-1);

await user.click(screen.getByRole('button', { name: 'Test month range' }));
expect(analyticsSlideCalls.at(-1)?.periodOffset).toBe(0);
```

Add an `AnalyticsSlide` assertion that the picker receives every option and the chart figure has
`flex-1` plus `min-h-10`, not `h-10`. Also assert a historical month caption does not contain
`month to date`.

- [ ] **Step 2: Run focused component tests and verify RED**

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
```

Expected: FAIL because period props/state and flex-growing chart layout are absent.

- [ ] **Step 3: Add shared period state to the carousel parent**

In `HomeDashboardCarousel`:

```tsx
const [periodOffset, setPeriodOffset] = useState(0);
const periodOptions = useMemo(
  () => buildAnalyticsPeriodOptions(range, transactions, analyticsNow),
  [analyticsNow, range, transactions],
);
const handleRangeChange = (nextRange: AnalyticsRange) => {
  setRange(nextRange);
  setPeriodOffset(0);
};
```

Pass `periodOffset` into both summary builds and pass the option/value/change props to both
Analytics views. Clamp an offset only when it is no longer represented by the option list.

Ignore nested picker gestures at the outer carousel boundary:

```tsx
const ownsNestedHorizontalGesture = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('[data-home-carousel-swipe-lock="true"]') !== null;

const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (ownsNestedHorizontalGesture(event.target)) {
    pointerStart.current = null;
    return;
  }
  // Existing touch-only carousel initialization.
};
```

- [ ] **Step 4: Render the picker and flex-growing compact chart**

Add `periodOptions`, `periodOffset`, and `onPeriodChange` to `AnalyticsSlideProps`. Render
`AnalyticsPeriodPicker` after the metric/comparison and before the chart for W/M/Q/Y. Render a
static exact custom date label for C. Keep the picker available when the selected period has no
expense rows so the user can navigate away.

Change the chart from:

```tsx
className="mt-1 h-10"
```

to:

```tsx
className="mt-1 min-h-10 flex-1"
```

Historical metric copy uses the selected option label, while current offsets retain the approved
to-date captions. Pass `periodOffset` into `getComparisonText`.

- [ ] **Step 5: Run focused component tests and verify GREEN**

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
```

Expected: PASS with shared state, range reset, nested gesture ownership, and responsive chart
layout covered.

- [ ] **Step 6: Commit parent and compact integration**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
git commit -m "feat: navigate analytics history from home"
```

### Task 4: Integrate the sheet and reset drill-down filters on close

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] **Step 1: Write failing sheet synchronization and close-reset tests**

Add the shared period props to `baseProps`, render a controlled open/close harness, select a chart
bucket and category, close, reopen, and verify the chart and transaction list are unfiltered while
the range and period offset remain unchanged:

```tsx
it('clears bucket and category filters whenever the sheet closes', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Reopen analytics</button>
        <AnalyticsDrawer {...baseProps} open={open} onOpenChange={setOpen} />
      </>
    );
  }
  render(<Harness />);
  await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
  await user.click(screen.getByRole('button', { name: /Dining Out,/ }));
  await user.click(screen.getByRole('button', { name: 'Close analytics' }));
  await user.click(screen.getByRole('button', { name: 'Reopen analytics' }));
  expect(screen.queryByRole('button', { name: /Clear selected period filter/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
});
```

Also test that clicking a period option changes the shared callback and clears an active drill-down.

- [ ] **Step 2: Run the drawer test and verify RED**

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because the drawer does not render the shared picker and preserves filters across
close/reopen.

- [ ] **Step 3: Add the picker and deterministic filter reset**

Add `periodOptions`, `periodOffset`, and `onPeriodChange` props. Pass `periodOffset` into
`buildAnalyticsSummary` and render the picker immediately above the stacked chart for W/M/Q/Y.

Reset drill-down synchronously for all controlled close paths and retain an effect as protection
for an external close:

```tsx
const clearFilters = () => {
  setSelectedBucket(null);
  setSelectedCategory(null);
};

useEffect(() => {
  if (!open) {
    setSelectedBucket(null);
    setSelectedCategory(null);
  }
}, [open]);

const handleDrawerOpenChange = (nextOpen: boolean) => {
  if (!nextOpen && customPickerOpen) return;
  if (!nextOpen) {
    setCustomPickerOpen(false);
    clearFilters();
  }
  onOpenChange(nextOpen);
};
```

Call `clearFilters()` before `onOpenChange(false)` in the transaction-selection path. Add
`periodOffset` to the scope-reset effect so period changes clear stale bucket/category state.
Update metric and announcement copy to name the resolved historical period accurately.

- [ ] **Step 4: Run the drawer test and verify GREEN**

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: PASS, including existing custom-picker close protection and focus behavior.

- [ ] **Step 5: Commit sheet integration**

```bash
git add src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "fix: reset analytics drill-down on close"
```

### Task 5: Verify mobile gestures and refresh PR evidence

**Files:**
- Modify: `e2e/home-carousel.spec.ts`
- Update: Analytics screenshot files referenced by PR #149

- [ ] **Step 1: Extend the Mobile Chrome acceptance scenario**

Seed an older valid transaction so the W picker contains multiple continuous periods. In the
existing home carousel test:

```ts
const picker = page.getByTestId('analytics-period-picker').first();
await expect(picker.getByRole('option')).toHaveCount(3);
await touchSwipe(page, picker, 180, 2);
await expect(page.getByRole('button', { name: 'Analytics slide' })).toHaveAttribute(
  'aria-current',
  'true',
);
await expect(picker.getByRole('option', { selected: true })).not.toHaveText('Aug 11–17');
```

Open the Analytics sheet and assert its picker names the same selected period. Select a chart bar,
close and reopen the sheet, then assert the clear-filter chip is absent and all matching period
transactions return. Measure the compact chart and assert its height is greater than the former
40px fixed height when space is available, while the lower entry tab retains the same Y coordinate.

- [ ] **Step 2: Run Mobile Chrome against the unit-tested integration**

```bash
VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: PASS. If it fails, use the browser trace to identify the exact gesture boundary,
centering calculation, or flex constraint, add a focused regression assertion to the owning unit
test, verify that assertion fails for the observed reason, and make only the corresponding fix.

- [ ] **Step 3: Run focused and full verification**

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
pnpm install --frozen-lockfile
VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
git diff --check
```

Expected: all commands exit `0`; Vitest reports no failed files/tests; the Mobile Chrome scenario
passes; the pnpm frozen install confirms Cloudflare's dependency path remains valid.

- [ ] **Step 4: Capture and commit refreshed screenshots**

Use the verified local app to capture the home Analytics picker and the open Analytics sheet at a
390x844 mobile viewport. Replace the existing PR screenshot assets or add clearly named files under
`docs/screenshots/analytics/`, verify them visually, then commit:

```bash
git add e2e/home-carousel.spec.ts docs/screenshots/analytics
git commit -m "test: cover analytics period navigation"
```

- [ ] **Step 5: Push and finish PR #149**

Push the branch, update the PR body with the refreshed screenshots and verification counts, monitor
Cloudflare Pages to success, request a final code review, then merge using the repository-supported
merge method already selected for this PR.
