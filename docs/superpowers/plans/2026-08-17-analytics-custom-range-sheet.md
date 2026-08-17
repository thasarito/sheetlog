# Analytics Custom Range Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Custom open one usable date-range sheet directly from both the Analytics carousel and Analytics detail sheet, committing dates only on Apply.

**Architecture:** `HomeDashboardCarousel` remains the owner of the committed analytics range and custom period. A reusable `AnalyticsRangeDrawer` renders through a normal Vaul root from the carousel and through `Drawer.NestedRoot` inside Analytics; it owns only draft calendar state, while each caller commits the shared state on Apply.

**Tech Stack:** React 18, TypeScript, Vaul, react-day-picker, date-fns, Testing Library/Vitest, Playwright Mobile Chrome

---

## File Map

- Create `src/components/TransactionFlow/AnalyticsRangeDrawer.tsx` for reusable standalone/nested range-sheet presentation and draft behavior.
- Create `src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx` for draft, boundary, same-day, dismissal, and focus behavior.
- Modify `src/components/ui/drawer.tsx` to expose Vaul's supported nested root.
- Modify `src/components/TransactionFlow/AnalyticsSlide.tsx` and its test so Custom requests a sheet without prematurely committing `custom`.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.tsx` and its test to own and render the standalone range sheet.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.tsx` and its test to render the nested range sheet and preserve the parent sheet on dismissal/apply.
- Modify `e2e/home-carousel.spec.ts` to exercise real pointer selection from both entry points.
- Delete `src/components/TransactionFlow/AnalyticsRangePicker.tsx` and `src/components/TransactionFlow/AnalyticsRangePicker.test.tsx` after all callers move to the sheet.
- Modify `package.json` and `package-lock.json` by uninstalling the now-unused Radix Popover dependency.

### Task 1: Build the reusable standalone/nested range sheet

**Files:**
- Create: `src/components/TransactionFlow/AnalyticsRangeDrawer.tsx`
- Create: `src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx`
- Modify: `src/components/ui/drawer.tsx:5-8,116-127`

- [ ] **Step 1: Write the failing range-sheet component tests**

Create `src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DatePeriod } from './analytics';
import { AnalyticsRangeDrawer } from './AnalyticsRangeDrawer';

const committedPeriod: DatePeriod = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 7, 17),
};

function RangeDrawerHarness({
  onApply,
}: {
  onApply: (period: DatePeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open custom range
      </button>
      <AnalyticsRangeDrawer
        open={open}
        onOpenChange={setOpen}
        value={committedPeriod}
        minDate={new Date(2026, 6, 1)}
        maxDate={new Date(2026, 7, 17)}
        onApply={onApply}
        returnFocusTo={triggerRef.current}
      />
    </>
  );
}

describe('AnalyticsRangeDrawer', () => {
  it('keeps an incomplete draft local and applies a bounded same-day range', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Open custom range' }));
    const dialog = screen.getByRole('dialog', { name: 'Custom date range' });
    expect(dialog.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /August 18/ })).toBeDisabled();

    const augustFifth = screen.getByRole('button', { name: /August 5th, 2026/ });
    augustFifth.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /August 6th, 2026/ })).toHaveFocus();

    await user.click(augustFifth);
    expect(screen.getByRole('button', { name: 'Apply custom range' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();

    await user.click(augustFifth);
    const apply = screen.getByRole('button', { name: 'Apply custom range' });
    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(onApply).toHaveBeenCalledWith({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 5),
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open custom range' })).toHaveFocus(),
    );
  });

  it('discards a cancelled draft and resets from the committed value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    const trigger = screen.getByRole('button', { name: 'Open custom range' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /August 6th, 2026/ }));
    await user.click(screen.getByRole('button', { name: /August 12th, 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel custom range' }));

    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));
    expect(onApply).toHaveBeenCalledWith(committedPeriod);
  });

  it('closes on Escape without applying and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    const trigger = screen.getByRole('button', { name: 'Open custom range' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Custom date range' })).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
```

- [ ] **Step 2: Run the test and verify the RED state**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx
```

Expected: FAIL because `./AnalyticsRangeDrawer` does not exist.

- [ ] **Step 3: Expose Vaul's nested root**

In `src/components/ui/drawer.tsx`, add the nested primitive beside the existing aliases:

```tsx
const Drawer = DrawerPrimitive.Root;
const DrawerNestedRoot = DrawerPrimitive.NestedRoot;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;
```

Add `DrawerNestedRoot` to the export list:

```tsx
export {
  Drawer,
  DrawerNestedRoot,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
```

- [ ] **Step 4: Implement the minimal reusable range sheet**

Create `src/components/TransactionFlow/AnalyticsRangeDrawer.tsx`:

```tsx
import { format, startOfDay } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerTitle,
} from '../ui/drawer';
import type { DatePeriod } from './analytics';

type AnalyticsRangeDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DatePeriod;
  minDate: Date;
  maxDate: Date;
  onApply: (period: DatePeriod) => void;
  nested?: boolean;
  returnFocusTo?: HTMLButtonElement | null;
};

function draftLabel(draft: DateRange): string {
  if (!draft.from) return 'Select a start date';
  if (!draft.to) return format(draft.from, 'MMM d') + ' – Select an end date';
  return format(draft.from, 'MMM d') + ' – ' + format(draft.to, 'MMM d');
}

export function AnalyticsRangeDrawer({
  open,
  onOpenChange,
  value,
  minDate,
  maxDate,
  onApply,
  nested = false,
  returnFocusTo,
}: AnalyticsRangeDrawerProps) {
  const [draft, setDraft] = useState<DateRange>({
    from: value.start,
    to: value.end,
  });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const Root = nested ? DrawerNestedRoot : Drawer;
  const complete = Boolean(draft.from && draft.to);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: value.start, to: value.end });
  }, [open, value.end, value.start]);

  const apply = () => {
    if (!draft.from || !draft.to) return;
    onApply({
      start: startOfDay(draft.from),
      end: startOfDay(draft.to),
    });
    onOpenChange(false);
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="sm:mx-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo) return;
          event.preventDefault();
          returnFocusTo.focus();
        }}
      >
        <DrawerHeader className="text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1}>
            Custom date range
          </DrawerTitle>
          <DrawerDescription>
            Choose an inclusive start and end date.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-3" data-vaul-no-drag>
          <p className="pb-2 text-sm font-semibold text-foreground" aria-live="polite">
            {draftLabel(draft)}
          </p>
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={(nextRange) => setDraft(nextRange ?? { from: undefined })}
            resetOnSelect
            min={0}
            numberOfMonths={1}
            defaultMonth={value.end}
            startMonth={startOfDay(minDate)}
            endMonth={startOfDay(maxDate)}
            disabled={{
              before: startOfDay(minDate),
              after: startOfDay(maxDate),
            }}
            showOutsideDays
            navLayout="around"
            className="analytics-calendar"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Cancel custom range"
              className="min-h-11 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Cancel
            </button>
          </DrawerClose>
          <button
            type="button"
            aria-label="Apply custom range"
            disabled={!complete}
            onClick={apply}
            className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Apply
          </button>
        </div>
      </DrawerContent>
    </Root>
  );
}
```

- [ ] **Step 5: Run the range-sheet tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx
```

Expected: 3 tests pass with no warnings.

- [ ] **Step 6: Commit the reusable sheet**

```bash
git add src/components/ui/drawer.tsx src/components/TransactionFlow/AnalyticsRangeDrawer.tsx src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx
git commit -m "feat: add analytics custom range sheet"
```

### Task 2: Route carousel Custom directly to the standalone range sheet

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx:47-79`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx:12-101,127-132,251-285`
- Modify: `e2e/home-carousel.spec.ts:172-191`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx:52-58`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx:13-17,40-63,84-93,220-232,341-362`

- [ ] **Step 1: Write the failing compact-slide dispatch test**

Replace the first `AnalyticsSlide` test with:

```tsx
it('routes W M Q Y immediately and requests Custom without committing it', async () => {
  const user = userEvent.setup();
  const onRangeChange = vi.fn();
  const onCustomRequest = vi.fn();
  const onViewAll = vi.fn();
  render(
    <AnalyticsSlide
      range="week"
      onRangeChange={onRangeChange}
      onCustomRequest={onCustomRequest}
      summary={summary}
      isLoading={false}
      isOffline={false}
      error={null}
      onRetry={vi.fn()}
      onViewAll={onViewAll}
    />,
  );

  expect(screen.getByText('฿3,240')).toBeInTheDocument();
  expect(screen.getByText('12% below previous 7 days')).toBeInTheDocument();
  expect(screen.getByTestId('segment-day-0-category-0')).toHaveAttribute(
    'data-tone',
    'emerald',
  );

  await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
  await user.click(screen.getByRole('button', { name: 'Year, year to date' }));
  expect(onRangeChange).toHaveBeenNthCalledWith(1, 'month');
  expect(onRangeChange).toHaveBeenNthCalledWith(2, 'year');

  await user.click(screen.getByRole('button', { name: 'Custom date range' }));
  expect(onRangeChange).not.toHaveBeenCalledWith('custom');
  expect(onCustomRequest).toHaveBeenCalledWith(expect.any(HTMLButtonElement));

  await user.click(screen.getByRole('button', { name: 'View all analytics' }));
  expect(onViewAll).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add a failing standalone range-sheet harness to the carousel test**

Add this call-record type beside `analyticsDrawerCalls`:

```tsx
const analyticsRangeDrawerCalls: Array<{
  open: boolean;
  value: DatePeriod;
}> = [];
```

Change the mock Analytics-slide Custom button so it only requests Custom:

```tsx
<button
  type="button"
  onClick={(event) => props.onCustomRequest(event.currentTarget)}
>
  Test custom range
</button>
```

Add this controlled mock after the `AnalyticsDrawer` mock:

```tsx
vi.mock("./AnalyticsRangeDrawer", () => ({
  AnalyticsRangeDrawer: ({
    open,
    onOpenChange,
    value,
    onApply,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: DatePeriod;
    onApply: (period: DatePeriod) => void;
  }) => {
    analyticsRangeDrawerCalls.push({ open, value });
    if (!open) return null;
    return (
      <div role="dialog" aria-label="Custom date range">
        <button
          type="button"
          onClick={() => {
            onApply({
              start: new Date(2026, 7, 5),
              end: new Date(2026, 7, 12),
            });
            onOpenChange(false);
          }}
        >
          Apply test custom range
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel test custom range
        </button>
      </div>
    );
  },
}));
```

Clear `analyticsRangeDrawerCalls` in `beforeEach`:

```tsx
beforeEach(() => {
  historyEnabledCalls.splice(0);
  analyticsSlideCalls.splice(0);
  analyticsDrawerCalls.splice(0);
  analyticsRangeDrawerCalls.splice(0);
});
```

Replace the Custom assertions in `builds daily month, weekly quarter, monthly year, and shared custom state`:

```tsx
await user.click(screen.getByRole("button", { name: "Test custom range" }));
expect(analyticsSlideCalls.at(-1)?.summary?.range).toBe("year");
expect(screen.getByRole("dialog", { name: "Custom date range" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Close analytics drawer" })).not.toBeInTheDocument();

await user.click(screen.getByRole("button", { name: "Apply test custom range" }));
const customSummary = analyticsSlideCalls.at(-1)?.summary;
const customDrawer = analyticsDrawerCalls.at(-1);
expect(customSummary?.range).toBe("custom");
expect(customSummary?.periods.current.start).toEqual(new Date(2026, 7, 5));
expect(customSummary?.periods.current.end.getDate()).toBe(12);
expect(customDrawer?.customPeriod).toEqual({
  start: new Date(2026, 7, 5),
  end: new Date(2026, 7, 12),
});
expect(analyticsRangeDrawerCalls.at(-1)?.open).toBe(false);
expect(screen.queryByRole("button", { name: "Close analytics drawer" })).not.toBeInTheDocument();
```

- [ ] **Step 3: Add the failing Mobile Chrome carousel regression**

In `e2e/home-carousel.spec.ts`, insert this block after the year-to-date bucket assertion and before switching back to Month:

```ts
await page.getByRole('button', { name: 'Custom date range' }).click();
const standaloneRangeDialog = page.getByRole('dialog', { name: 'Custom date range' });
await expect(standaloneRangeDialog).toBeVisible();
await expect(page.getByRole('dialog', { name: 'Analytics' })).toHaveCount(0);

const standaloneStart = subDays(new Date(), 4);
const standaloneEnd = subDays(new Date(), 2);
await standaloneRangeDialog
  .getByRole('button', {
    name: new RegExp(format(standaloneStart, 'MMMM do, yyyy')),
  })
  .click();
await standaloneRangeDialog
  .getByRole('button', {
    name: new RegExp(format(standaloneEnd, 'MMMM do, yyyy')),
  })
  .click();
await standaloneRangeDialog.getByRole('button', { name: 'Apply custom range' }).click();

await expect(standaloneRangeDialog).toHaveCount(0);
await expect(page.getByRole('button', { name: 'Custom date range' })).toHaveAttribute(
  'aria-pressed',
  'true',
);
await expect(page.getByRole('dialog', { name: 'Analytics' })).toHaveCount(0);
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: FAIL because Custom still calls `onRangeChange('custom')` and the carousel still opens Analytics.

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: FAIL because the standalone `Custom date range` sheet does not open.

- [ ] **Step 5: Stop the compact slide from prematurely committing Custom**

Replace the range-toggle handler in `AnalyticsSlide.tsx`:

```tsx
<AnalyticsRangeToggle
  value={range}
  onChange={(nextRange, trigger) => {
    if (nextRange === 'custom') {
      if (trigger) onCustomRequest?.(trigger);
      return;
    }
    onRangeChange(nextRange);
  }}
/>
```

- [ ] **Step 6: Add standalone range-sheet ownership to the carousel**

Add the import:

```tsx
import { AnalyticsRangeDrawer } from "./AnalyticsRangeDrawer";
```

Add state and the dedicated trigger ref beside the existing drawer state:

```tsx
const [range, setRange] = useState<AnalyticsRange>("week");
const [analyticsOpen, setAnalyticsOpen] = useState(false);
const [customRangeOpen, setCustomRangeOpen] = useState(false);
const [drawerCurrency, setDrawerCurrency] = useState(currency);
const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
const [customPeriod, setCustomPeriod] = useState(() => ({
  start: startOfMonth(analyticsNow),
  end: endOfDay(analyticsNow),
}));
const viewportRef = useRef<HTMLDivElement>(null);
const slideRefs = useRef<Array<HTMLElement | null>>([]);
const analyticsTriggerRef = useRef<HTMLButtonElement | null>(null);
const customRangeTriggerRef = useRef<HTMLButtonElement | null>(null);
```

Keep history active while either sheet is open:

```tsx
const history = useTransactionHistoryQuery(
  historyActivated || analyticsOpen || customRangeOpen,
);
```

Compute the earliest loaded date after `currencies`:

```tsx
const earliestDate = useMemo(() => {
  const dates = transactions
    .map((transaction) => tryParseDate(transaction.date))
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return customPeriod.start;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}, [customPeriod.start, transactions]);
```

Replace `handleCustomRangeRequest`:

```tsx
const handleCustomRangeRequest = (trigger: HTMLButtonElement) => {
  customRangeTriggerRef.current = trigger;
  setHistoryActivated(true);
  setCustomRangeOpen(true);
};
```

Render the standalone sheet immediately before `AnalyticsDrawer`:

```tsx
<AnalyticsRangeDrawer
  open={customRangeOpen}
  onOpenChange={setCustomRangeOpen}
  value={customPeriod}
  minDate={earliestDate}
  maxDate={analyticsNow}
  onApply={(period) => {
    setCustomPeriod(period);
    setRange("custom");
  }}
  returnFocusTo={customRangeTriggerRef.current}
/>
```

- [ ] **Step 7: Run focused unit and Mobile Chrome tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: all focused tests pass.

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: the Mobile Chrome carousel flow passes through the standalone Custom Apply assertion.

- [ ] **Step 8: Commit the standalone carousel flow**

```bash
git add src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx e2e/home-carousel.spec.ts
git commit -m "fix: open custom range directly from analytics carousel"
```

### Task 3: Replace the Analytics Popover with a nested range sheet

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx:1-7,139-148,192-222`
- Modify: `e2e/home-carousel.spec.ts:217-224`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx:2-3,27-28,60-78,100-114,133-144,165-166,245-259,398-400`

- [ ] **Step 1: Replace the Popover assertion with failing nested-sheet tests**

Replace `keeps W M Q Y C on the right and opens the controlled custom range picker` with:

```tsx
it('cancels a nested custom range without closing Analytics or clearing filters', async () => {
  const user = userEvent.setup();
  renderDrawer();

  await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
  await user.click(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' }));
  expect(screen.getByText('No matching transactions')).toBeInTheDocument();

  const customTrigger = screen.getByRole('button', { name: 'Custom date range' });
  await user.click(customTrigger);

  expect(screen.getByRole('dialog', { name: 'Custom date range' })).toBeInTheDocument();
  expect(
    screen.getByRole('dialog', { name: 'Analytics', hidden: true }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel custom range' }));

  expect(screen.queryByRole('dialog', { name: 'Custom date range' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Analytics' })).toBeVisible();
  expect(screen.getByText('No matching transactions')).toBeInTheDocument();
  await waitFor(() => expect(customTrigger).toHaveFocus());
});

it('applies a nested custom range and leaves Analytics open', async () => {
  const user = userEvent.setup();

  function CustomRangeHarness() {
    const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('month');
    const [selectedPeriod, setSelectedPeriod] = useState(customPeriod);
    return (
      <AnalyticsDrawer
        {...baseProps}
        range={selectedRange}
        onRangeChange={setSelectedRange}
        customPeriod={selectedPeriod}
        onCustomPeriodChange={setSelectedPeriod}
      />
    );
  }

  render(<CustomRangeHarness />);
  await user.click(screen.getByRole('button', { name: 'Custom date range' }));
  await user.click(screen.getByRole('button', { name: /August 5th, 2026/ }));
  await user.click(screen.getByRole('button', { name: /August 12th, 2026/ }));
  await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

  expect(screen.queryByRole('dialog', { name: 'Custom date range' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Analytics' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Custom, Aug 5 through Aug 12 · Expenses ฿0',
  );
  expect(screen.getByRole('button', { name: 'Custom date range' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
```

- [ ] **Step 2: Expand the Mobile Chrome nested-sheet regression**

Replace the old Popover Escape block in `e2e/home-carousel.spec.ts` with:

```ts
const firstAnalyticsBar = analyticsDialog.getByRole('option').first();
await expect(firstAnalyticsBar).toHaveAttribute('aria-selected', 'false');

await analyticsDialog.getByRole('button', { name: 'Custom date range' }).click();
const nestedRangeDialog = page.getByRole('dialog', { name: 'Custom date range' });
await expect(nestedRangeDialog).toBeVisible();
await expect(analyticsDialog).toBeAttached();

const nestedStart = subDays(new Date(), 6);
const nestedEnd = subDays(new Date(), 3);
await nestedRangeDialog
  .getByRole('button', {
    name: new RegExp(format(nestedStart, 'MMMM do, yyyy')),
  })
  .click();
await nestedRangeDialog
  .getByRole('button', {
    name: new RegExp(format(nestedEnd, 'MMMM do, yyyy')),
  })
  .click();
await nestedRangeDialog.getByRole('button', { name: 'Apply custom range' }).click();

await expect(nestedRangeDialog).toHaveCount(0);
await expect(analyticsDialog).toBeVisible();
await expect(firstAnalyticsBar).toHaveAttribute('aria-selected', 'false');
await expect(
  analyticsDialog.getByRole('button', { name: 'Custom date range' }),
).toHaveAttribute('aria-pressed', 'true');
```

- [ ] **Step 3: Run the focused unit test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because Analytics still renders the Radix Popover rather than a nested Vaul sheet.

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: FAIL when the portaled calendar cannot receive the real day clicks or when the expected nested sheet is absent.

- [ ] **Step 4: Replace Analytics Popover state with nested-sheet state**

Replace the picker import:

```tsx
import { AnalyticsRangeDrawer } from './AnalyticsRangeDrawer';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';
```

Replace the title/picker refs and picker state:

```tsx
const titleRef = useRef<HTMLHeadingElement>(null);
const customRangeTriggerRef = useRef<HTMLButtonElement | null>(null);
const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [customRangeOpen, setCustomRangeOpen] = useState(false);
```

Delete the `previousDrawerOpen` ref, `customPickerOpen` state, `customPickerRequest` state, and the effect that programmatically clicks the Popover trigger.

Add parent-close cleanup after the range/filter reset effect:

```tsx
useEffect(() => {
  if (!open) setCustomRangeOpen(false);
}, [open]);
```

Replace the drawer/range handlers:

```tsx
const handleDrawerOpenChange = (nextOpen: boolean) => {
  if (!nextOpen) setCustomRangeOpen(false);
  onOpenChange(nextOpen);
};

const handleRangeChange = (
  nextRange: AnalyticsRange,
  trigger?: HTMLButtonElement,
) => {
  if (nextRange === 'custom') {
    customRangeTriggerRef.current = trigger ?? null;
    setCustomRangeOpen(true);
    return;
  }
  onRangeChange(nextRange);
};

const applyCustomPeriod = (period: DatePeriod) => {
  onCustomPeriodChange(period);
  onRangeChange('custom');
};
```

- [ ] **Step 5: Remove the inline Popover trigger and render the nested sheet**

Delete the conditional `AnalyticsRangePicker` block beneath `analytics-range-controls`.

Inside the existing `Drawer` root, place the nested sheet after `DrawerContent` and before the closing `</Drawer>`:

```tsx
<AnalyticsRangeDrawer
  nested
  open={customRangeOpen}
  onOpenChange={setCustomRangeOpen}
  value={customPeriod}
  minDate={earliestDate}
  maxDate={now}
  onApply={applyCustomPeriod}
  returnFocusTo={customRangeTriggerRef.current}
/>
```

- [ ] **Step 6: Run focused unit and Mobile Chrome tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: all focused tests pass, including nested Cancel/Apply.

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: Mobile Chrome selects dates through the nested sheet, Analytics stays open, and no chart bar becomes selected.

- [ ] **Step 7: Commit the nested Analytics flow**

```bash
git add src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx e2e/home-carousel.spec.ts
git commit -m "fix: use nested sheet for analytics custom range"
```

### Task 4: Remove the obsolete Popover implementation and dependency

**Files:**
- Delete: `src/components/TransactionFlow/AnalyticsRangePicker.tsx`
- Delete: `src/components/TransactionFlow/AnalyticsRangePicker.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Verify that production code no longer imports the Popover or old picker**

Run:

```bash
rg -n "AnalyticsRangePicker|@radix-ui/react-popover" src package.json
```

Expected: only the old picker source/test and the `package.json` dependency remain.

- [ ] **Step 2: Delete the obsolete picker files**

Use `apply_patch` with these exact delete targets:

```diff
*** Delete File: src/components/TransactionFlow/AnalyticsRangePicker.tsx
*** Delete File: src/components/TransactionFlow/AnalyticsRangePicker.test.tsx
```

- [ ] **Step 3: Remove the unused dependency through npm**

Run:

```bash
npm uninstall @radix-ui/react-popover
```

Expected: `package.json` and `package-lock.json` remove `@radix-ui/react-popover` while retaining `react-day-picker`.

- [ ] **Step 4: Verify cleanup and run the complete unit/component suite**

Run:

```bash
rg -n "AnalyticsRangePicker|@radix-ui/react-popover" src package.json
```

Expected: no matches.

Run:

```bash
npm test
```

Expected: all test files pass with zero failures.

- [ ] **Step 5: Commit Popover cleanup**

```bash
git add package.json package-lock.json src/components/TransactionFlow/AnalyticsRangePicker.tsx src/components/TransactionFlow/AnalyticsRangePicker.test.tsx
git commit -m "refactor: remove analytics range popover"
```

### Task 5: Run final verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run repository lint**

Run:

```bash
npm run lint
```

Expected: exit 0 with no Biome errors.

- [ ] **Step 2: Run TypeScript without emitting files**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0 with no type errors.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
npm test
```

Expected: every Vitest file and test passes with zero failures.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite build and the browser OAuth boundary check both exit 0.

- [ ] **Step 5: Re-run the real Mobile Chrome interaction**

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: the carousel Custom sheet and nested Analytics Custom sheet both accept real pointer date selection, with no unintended Analytics opening or chart click-through.

- [ ] **Step 6: Inspect the final patch**

Run:

```bash
git diff --check origin/main...HEAD
```

Expected: exit 0 with no whitespace errors.

Run:

```bash
git status --short
```

Expected: clean worktree after the four implementation commits.
