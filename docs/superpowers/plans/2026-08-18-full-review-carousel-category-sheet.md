# Full Review Carousel and Category Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compact step-zero dashboard with full Transactions and Analytics review slides beneath a default-expanded, content-fit, two-snap Vaul category sheet while preserving the existing Amount, Receipt, edit, and analytics-sync flows.

**Architecture:** Keep `TransactionFlow` as the flow owner and extend its existing always-on `AnalyticsSyncController` with the history presentation state already produced by `useTransactionHistoryQuery`. Extract modal-free `TransactionHistoryView` and `AnalyticsView` surfaces, render them directly in `HomeDashboardCarousel`, and layer a measured non-modal `CategoryStepSheet` over that carousel. Preserve existing TanStack Query caches, background analytics synchronization, horizontal carousel gesture arbitration, and category quick-note behavior.

**Tech Stack:** React 18, TypeScript, Vaul 1.1, TanStack Query/Virtual, Tailwind CSS, Vitest + Testing Library, Playwright.

---

## File Map

### New files

- `src/components/TransactionFlow/TransactionHistoryView.tsx` — modal-free complete-history header, search/status UI, and virtualized list.
- `src/components/TransactionFlow/TransactionHistoryView.test.tsx` — migrated complete-history behavior without drawer assumptions.
- `src/components/TransactionFlow/AnalyticsView.tsx` — modal-free detailed analytics surface and standalone custom-range drawer.
- `src/components/TransactionFlow/AnalyticsView.test.tsx` — migrated detailed analytics behavior without outer-drawer assumptions.
- `src/components/TransactionFlow/CategoryStepSheet.tsx` — layered step-zero root, measured Vaul snap points, launcher, and occlusion CSS property.
- `src/components/TransactionFlow/CategoryStepSheet.test.tsx` — snap, measurement, accessibility, and non-modal configuration coverage.

### Modified files

- `src/components/TransactionFlow/useTransactionHistoryQuery.ts` — export the query-result type used by the controller and view.
- `src/components/TransactionFlow/useAnalyticsSync.ts` — expose the existing history result on `AnalyticsSyncController`.
- `src/components/TransactionFlow/useAnalyticsSync.test.tsx` — prove the controller exposes the same always-on history state.
- `src/components/SettingsDrawer.test.tsx` — complete the typed analytics-sync fixture with history state.
- `src/components/ui/drawer.tsx` — allow a caller to replace the default decorative handle while preserving all existing defaults.
- `src/components/DateTimeDrawer.tsx` — support `DrawerNestedRoot` when opened from the category sheet.
- `src/components/TransactionFlow/StepCategory.tsx` — request nested Date/Time behavior without changing form or gesture behavior.
- `src/components/TransactionFlow/StepCategory.carousel.test.tsx` — cover forwarding the nested-drawer contract.
- `src/components/TransactionFlow/HomeDashboardCarousel.tsx` — render full review surfaces, shared header indicators, and one detailed analytics summary.
- `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx` — replace compact/detail-modal assertions with direct-surface and gesture assertions.
- `src/components/TransactionFlow/index.tsx` — mount the layered category sheet on step zero and remove the history-drawer state path.
- `src/components/TransactionFlow/TransactionFlow.test.tsx` — assert layered step zero and direct review-to-edit transitions.
- `e2e/home-carousel.spec.ts` — exercise expanded/collapsed category states, full review slides, gestures, and screenshots.

### Removed after callers migrate

- `src/components/TransactionFlow/TransactionHistoryDrawer.tsx`
- `src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx`
- `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- `src/components/TransactionFlow/AnalyticsSlide.tsx`
- `src/components/TransactionFlow/AnalyticsSlide.test.tsx`

Keep `TopDashboard.tsx`, `TopDashboard.test.tsx`, `CarouselActionButton.tsx`, and
`CarouselActionButton.test.tsx`; the landing-page demo still consumes those compact components.

---

### Task 1: Expose the existing history state through `AnalyticsSyncController`

**Files:**
- Modify: `src/components/TransactionFlow/useTransactionHistoryQuery.ts`
- Modify: `src/components/TransactionFlow/useAnalyticsSync.ts`
- Modify: `src/components/TransactionFlow/useAnalyticsSync.test.tsx`
- Modify: `src/components/SettingsDrawer.test.tsx`

- [ ] **Step 1: Write the failing controller test**

Add this assertion to the existing test named `eagerly enables history and publishes cached rates during remote refresh`:

```tsx
expect(result.current.history).toBe(state.history);
expect(result.current.history.records).toBe(result.current.records);
expect(result.current.history.hasCompleteCache).toBe(true);
```

The mock `useTransactionHistoryQuery` already returns `state.history`, so reference equality proves
the controller did not create a second query or copy an incomplete subset.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/useAnalyticsSync.test.tsx
```

Expected: FAIL because `result.current.history` is `undefined`.

- [ ] **Step 3: Export the history result type and add it to the controller**

At the end of `useTransactionHistoryQuery.ts`, export the inferred result:

```ts
export type TransactionHistoryQueryResult = ReturnType<
  typeof useTransactionHistoryQuery
>;
```

Update `useAnalyticsSync.ts`:

```ts
import {
  useTransactionHistoryQuery,
  type TransactionHistoryQueryResult,
} from './useTransactionHistoryQuery';

export type AnalyticsSyncController = {
  history: TransactionHistoryQueryResult;
  records: TransactionRecord[];
  rates: ExchangeRateRecord[];
  hasLocalHistory: boolean;
  status: AnalyticsSyncStatus;
  lastSyncedAt?: string;
  isResyncing: boolean;
  resync: () => void;
};
```

Insert `history,` as the first property in the existing return object. Leave the current fields and
the complete guarded `resync` callback in place.

Add a complete `history` fixture to the typed object in `SettingsDrawer.test.tsx`. Reuse the exact
shape already returned by the hook:

```ts
history: {
  records: [],
  meta: null,
  error: null,
  hasCompleteCache: true,
  hasLocalSnapshot: true,
  isLoading: false,
  isRefreshing: false,
  isDownloading: false,
  isOnline: true,
  remoteStatus: 'success',
  remoteFetchedAt: undefined,
  remoteError: null,
  refresh: vi.fn(),
},
```

- [ ] **Step 4: Run controller and Settings tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/useAnalyticsSync.test.tsx src/components/SettingsDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TransactionFlow/useTransactionHistoryQuery.ts src/components/TransactionFlow/useAnalyticsSync.ts src/components/TransactionFlow/useAnalyticsSync.test.tsx src/components/SettingsDrawer.test.tsx
git commit -m "refactor: expose transaction history sync state"
```

---

### Task 2: Extract the modal-free complete Transactions view

**Files:**
- Create: `src/components/TransactionFlow/TransactionHistoryView.tsx`
- Create: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`
- Source to migrate: `src/components/TransactionFlow/TransactionHistoryDrawer.tsx`
- Source tests to migrate: `src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx`

- [ ] **Step 1: Write failing surface tests**

Create `TransactionHistoryView.test.tsx` from the existing drawer test harness, remove the drawer
primitive mock, and render a supplied history result:

```tsx
function renderView(
  overrides: Partial<TransactionHistoryQueryResult> = {},
  onEditTransaction = vi.fn(),
) {
  const history: TransactionHistoryQueryResult = {
    records: [],
    meta: null,
    error: null,
    hasCompleteCache: true,
    hasLocalSnapshot: true,
    isLoading: false,
    isRefreshing: false,
    isDownloading: false,
    isOnline: true,
    remoteStatus: 'success',
    remoteFetchedAt: undefined,
    remoteError: null,
    refresh: vi.fn(),
    ...overrides,
  };
  return render(
    <TransactionHistoryView
      history={history}
      baseCurrency="THB"
      carouselControls={<div data-testid="carousel-controls" />}
      onEditTransaction={onEditTransaction}
    />,
  );
}

it('renders the full history surface without modal controls', () => {
  renderView();
  expect(screen.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  expect(screen.getByTestId('carousel-controls')).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'Search transaction history' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Close transaction history' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('selects a row directly without a drawer-close callback', async () => {
  const onEditTransaction = vi.fn();
  const row = transaction('direct-row');
  renderView({ records: [row] }, onEditTransaction);
  await userEvent.setup().click(screen.getByRole('button', { name: /Category direct-row/ }));
  expect(onEditTransaction).toHaveBeenCalledWith(row);
});
```

Retain the existing virtualization, prepend-anchor, search, local/error status, refresh, base amount,
offline, loading, empty, and legacy-row tests, but replace each drawer render with `renderView`.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: FAIL because `TransactionHistoryView.tsx` does not exist.

- [ ] **Step 3: Extract the view**

Move `HISTORY_SKELETON_KEYS`, `HISTORY_INITIAL_RECT`, and
`TransactionHistoryVirtualList` unchanged from `TransactionHistoryDrawer.tsx`. Export this interface:

```tsx
type TransactionHistoryViewProps = {
  history: TransactionHistoryQueryResult;
  baseCurrency: string;
  carouselControls: React.ReactNode;
  onEditTransaction: (transaction: TransactionRecord) => void;
};
```

Preserve the existing debounce, filtering, flattening, base-amount query, status text, retry logic,
and virtualizer anchor. Replace the outer drawer with this fixed-header surface:

```tsx
return (
  <section className="flex h-full min-h-0 flex-col bg-card">
    <header className="grid grid-cols-[40px_1fr_40px] items-center gap-2 border-b border-border/70 px-3 pb-3 pt-4 text-center">
      <span aria-hidden="true" />
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
        <p className="sr-only">Search and browse the complete transaction history.</p>
      </div>
      <button
        type="button"
        aria-label="Refresh transaction history"
        disabled={!history.isOnline || isRefreshing}
        onClick={refresh}
        className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
      </button>
    </header>
    {carouselControls}
  </section>
);
```

Immediately after `carouselControls`, copy the existing JSX subtree beginning with
`<div className="flex min-h-0 flex-1 flex-col bg-card">` and ending at its matching closing tag
verbatim from `TransactionHistoryDrawer.tsx`. This subtree contains the search input, refresh and
offline status copy, error/retry panel, empty states, and `TransactionHistoryVirtualList`.

In `TransactionHistoryVirtualList`, replace `pb-safe` with dynamic occlusion styles:

```tsx
style={{
  paddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
  scrollPaddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
}}
```

Do not call `useTransactionHistoryQuery` in this view. `handleEdit` calls only
`onEditTransaction(transaction)`.

- [ ] **Step 4: Run the migrated Transactions tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: PASS with the same behavioral coverage as the old drawer tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/TransactionFlow/TransactionHistoryView.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
git commit -m "refactor: extract full transaction history view"
```

---

### Task 3: Extract the modal-free detailed Analytics view

**Files:**
- Create: `src/components/TransactionFlow/AnalyticsView.tsx`
- Create: `src/components/TransactionFlow/AnalyticsView.test.tsx`
- Source to migrate: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Source tests to migrate: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] **Step 1: Write failing detailed-view tests**

Migrate the existing `AnalyticsDrawer.test.tsx` harness to `AnalyticsView.test.tsx`. Remove `open`,
`onOpenChange`, and `initialSelectedBucket` from `baseProps`, then add a carousel-controls slot:

```tsx
const baseProps: ComponentProps<typeof AnalyticsView> = {
  transactions,
  summary: makeSummary(),
  baseCurrency: 'THB',
  bigSpendingThreshold: null,
  noBigSpending: false,
  onNoBigSpendingToggle: vi.fn(),
  range: 'week',
  onRangeChange: vi.fn(),
  periodOptions,
  periodOffset: 0,
  onPeriodChange: vi.fn(),
  customPeriod,
  onCustomPeriodChange: vi.fn(),
  isLoading: false,
  hasCompleteHistory: true,
  isOffline: false,
  error: null,
  onRetry: vi.fn(),
  onSelectTransaction: vi.fn(),
  carouselControls: <div data-testid="carousel-controls" />,
  now: new Date(2026, 7, 17),
};

it('renders detailed analytics directly without outer modal controls', () => {
  render(<AnalyticsView {...baseProps} />);
  expect(screen.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  expect(screen.getByTestId('carousel-controls')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Close analytics' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Analytics' })).not.toBeInTheDocument();
});
```

Keep all existing range announcement, chart/filter, category, no-big-spending, base amount, offline,
loading, empty, and selected-transaction tests. Change the custom-range assertion to require one
standalone `Custom date range` dialog and no Analytics dialog.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsView.test.tsx
```

Expected: FAIL because `AnalyticsView.tsx` does not exist.

- [ ] **Step 3: Extract the Analytics view**

Use the current drawer prop contract minus modal-only props:

```tsx
type AnalyticsViewProps = {
  transactions: TransactionRecord[];
  summary?: AnalyticsSummary;
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  noBigSpending: boolean;
  onNoBigSpendingToggle: () => void;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  periodOptions: AnalyticsPeriodOption[];
  periodOffset: number;
  onPeriodChange: (offset: number) => void;
  customPeriod: DatePeriod;
  onCustomPeriodChange: (period: DatePeriod) => void;
  isLoading: boolean;
  hasCompleteHistory: boolean;
  isOffline: boolean;
  updatedAt?: number;
  error: Error | null;
  onRetry: () => void;
  onSelectTransaction: (transaction: TransactionRecord) => void;
  carouselControls: React.ReactNode;
  now?: Date;
};
```

Preserve the current filter state, scope derivation, converted transaction amounts, range handling,
announcement, detailed sections, and retry/offline rendering. Remove every `open` guard, retained
closed-drawer ref, focus-on-open effect, `Drawer`, `DrawerContent`, `DrawerClose`, and close icon.
Render this shell:

```tsx
return (
  <section className="flex h-full min-h-0 flex-col bg-card">
    <header className="border-b border-border/60 px-4 pb-3 pt-4 text-left">
      <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
      <p className="sr-only">Review spending analytics and filter matching transactions.</p>
    </header>
    {carouselControls}
    <output
      aria-label="Analytics summary update"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {analyticsAnnouncement}
    </output>
    <AnalyticsRangeDrawer
      open={customRangeOpen}
      onOpenChange={setCustomRangeOpen}
      value={customPeriod}
      minDate={earliestDate}
      maxDate={now}
      onApply={applyCustomPeriod}
      returnFocusTo={customRangeTriggerRef.current}
    />
  </section>
);
```

Immediately after the live-region `output`, copy the existing scroll container beginning with
`<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe"` and ending at its matching closing
tag from `AnalyticsDrawer.tsx`. It contains the range selector, chart, overview, category list, and
transaction list. Remove `data-vaul-no-drag`, replace `pb-safe` with no padding utility, and add:

```tsx
style={{
  paddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
  scrollPaddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
}}
```

The range drawer intentionally omits `nested`; the outer Analytics drawer no longer exists.
Selecting a transaction clears filters and calls `onSelectTransaction` directly.

- [ ] **Step 4: Run detailed Analytics tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsView.test.tsx src/components/TransactionFlow/AnalyticsRangeDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TransactionFlow/AnalyticsView.tsx src/components/TransactionFlow/AnalyticsView.test.tsx
git commit -m "refactor: extract full analytics view"
```

---

### Task 4: Make the carousel render the full review surfaces

**Files:**
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Delete: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Delete: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Delete: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Delete: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`

- [ ] **Step 1: Replace compact/drawer composition tests with direct-view tests**

Mock the two extracted surfaces and capture their props. Add these expectations:

```tsx
it('renders both full review views and no View all flow', () => {
  renderCarousel();
  expect(screen.getByText('Full Transactions view')).toBeInTheDocument();
  expect(screen.getByText('Full Analytics view')).toBeInTheDocument();
  expect(screen.queryByText(/View all/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /Transactions|Analytics/ })).not.toBeInTheDocument();
  expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
});

it('keeps full review controls active while switching slides', async () => {
  const { viewport } = renderCarousel();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Analytics slide' }));
  await waitFor(() => expect(screen.getByLabelText('Analytics, slide 2 of 2')).not.toHaveAttribute('aria-hidden', 'true'));
  expect(analyticsViewCalls.at(-1)?.carouselControls).toBeDefined();
  fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Transactions slide' })).toHaveAttribute('aria-current', 'true'));
});
```

Retain current touch-swipe, nested-horizontal-lock, accidental-click suppression, period/range,
background-rate, converted-summary, and no-big-spending coverage, but drive those callbacks through
`AnalyticsView` instead of `AnalyticsSlide`/`AnalyticsDrawer`.

- [ ] **Step 2: Run the carousel test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: FAIL because the carousel still renders compact components and detail drawers.

- [ ] **Step 3: Simplify carousel state and render full views**

Remove `onViewAllTransactions`, `analyticsOpen`, `initialAnalyticsBucket`, drawer trigger refs, and
the standalone compact custom-range drawer. Compute the one visible Analytics summary with the
optional threshold:

```tsx
const analyticsResult = useMemo(() => {
  if (!analyticsSync.hasLocalHistory) return undefined;
  return buildAnalyticsSummary({
    transactions,
    range,
    baseCurrency,
    bigSpendingThreshold:
      noBigSpending && bigSpendingThreshold !== null
        ? bigSpendingThreshold
        : undefined,
    rates: analyticsSync.rates,
    now: analyticsNow,
    customPeriod,
    periodOffset,
  });
}, [
  analyticsNow,
  analyticsSync.hasLocalHistory,
  analyticsSync.rates,
  baseCurrency,
  bigSpendingThreshold,
  customPeriod,
  noBigSpending,
  periodOffset,
  range,
  transactions,
]);

const summary =
  analyticsResult?.status === 'ready' ? analyticsResult.summary : undefined;
```

Delete `drawerAnalyticsResult` and `drawerSummary`; the direct Analytics view is now the only
detailed summary consumer.

Create a local `CarouselIndicators` component or render function containing the current fieldset,
44-pixel dot buttons, arrow-key data attributes, and selected-state classes. Render one copy inside
each active slide view directly below its header:

```tsx
<TransactionHistoryView
  history={analyticsSync.history}
  baseCurrency={baseCurrency}
  carouselControls={<CarouselIndicators activeIndex={activeIndex} onSelect={scrollToSlide} />}
  onEditTransaction={onEditTransaction}
/>

<AnalyticsView
  transactions={transactions}
  summary={summary}
  baseCurrency={baseCurrency}
  bigSpendingThreshold={bigSpendingThreshold}
  noBigSpending={noBigSpending}
  onNoBigSpendingToggle={handleNoBigSpendingToggle}
  range={range}
  onRangeChange={handleRangeChange}
  periodOptions={periodOptions}
  periodOffset={periodOffset}
  onPeriodChange={setPeriodOffset}
  customPeriod={customPeriod}
  onCustomPeriodChange={setCustomPeriod}
  isLoading={!analyticsSync.hasLocalHistory}
  hasCompleteHistory={analyticsSync.history.hasCompleteCache}
  isOffline={analyticsSync.status === 'offline'}
  updatedAt={analyticsUpdatedAt}
  error={analyticsSync.history.error}
  onRetry={analyticsSync.resync}
  onSelectTransaction={onEditTransaction}
  carouselControls={<CarouselIndicators activeIndex={activeIndex} onSelect={scrollToSlide} />}
  now={analyticsNow}
/>
```

Change the outer carousel grid to a single full-height viewport. Preserve current native snap,
dominant-axis touch handling, `inert`, `aria-hidden`, live announcement, and reduced-motion logic.

- [ ] **Step 4: Run carousel and analytics tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsView.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Remove orphaned Analytics compact/modal files and verify references**

Delete the four Analytics files listed for this task, then run:

```bash
rg -n "AnalyticsDrawer|AnalyticsSlide" src e2e
```

Expected: no remaining source or test references.

- [ ] **Step 6: Commit**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsView.tsx src/components/TransactionFlow/AnalyticsView.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
git commit -m "feat: render full review carousel slides"
```

---

### Task 5: Add the measured two-snap category sheet

**Files:**
- Create: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Create: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`
- Modify: `src/components/ui/drawer.tsx`
- Modify: `src/components/DateTimeDrawer.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.carousel.test.tsx`

- [ ] **Step 1: Write failing category-sheet tests**

Mock `../ui/drawer` so the test can capture Root props while rendering children. Mock element
measurements by `data-testid` and trigger the test ResizeObserver. Cover this contract:

```tsx
it('opens expanded, publishes its measured occlusion, and collapses to the launcher', async () => {
  render(
    <CategoryStepSheet entry={<div data-testid="entry">Categories</div>}>
      <button type="button">Interactive review</button>
    </CategoryStepSheet>,
  );

  expect(capturedDrawerProps).toMatchObject({
    open: true,
    modal: false,
    dismissible: false,
    shouldScaleBackground: false,
    noBodyStyles: true,
  });
  expect(screen.getByTestId('category-step-layout')).toHaveStyle({
    '--category-sheet-occlusion': '520px',
  });
  expect(screen.getByRole('button', { name: 'Interactive review' })).toBeEnabled();

  await userEvent.setup().click(
    screen.getByRole('button', { name: 'Collapse transaction entry' }),
  );
  expect(screen.getByRole('button', { name: 'Expand transaction entry' })).toBeVisible();
  expect(screen.getByTestId('category-step-layout')).toHaveStyle({
    '--category-sheet-occlusion': '64px',
  });
});

it('clamps content height and never accepts a null dismiss point', () => {
  renderSheetWithMeasurements({ contentHeight: 900, layoutHeight: 700, launcherHeight: 64 });
  expect(capturedDrawerProps.snapPoints).toEqual(['64px', '700px']);
  act(() => capturedDrawerProps.setActiveSnapPoint(null));
  expect(screen.getByRole('button', { name: 'Collapse transaction entry' })).toBeVisible();
});
```

Also assert the sheet content class contains no `shadow`, the entry wrapper has
`data-vaul-no-drag`, and the collapsed/expanded controls have 44-pixel targets.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Let the drawer wrapper omit its decorative handle**

Extend `DrawerContentProps` without changing existing defaults:

```tsx
type DrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> & {
  contained?: boolean;
  showHandle?: boolean;
};

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(({ className, children, contained, showHandle = true, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay contained={contained} />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        contained
          ? "absolute inset-x-0 bottom-0 z-50"
          : "fixed inset-x-0 bottom-0 z-50",
        "mt-24 flex h-auto flex-col rounded-t-[28px] border border-border bg-card",
        className
      )}
      {...props}
    >
      {showHandle ? <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" /> : null}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
```

The overlay remains in the wrapper; Vaul returns `null` for it when `modal={false}`.

- [ ] **Step 4: Implement `CategoryStepSheet`**

Use measured pixel points and a semantic state instead of storing the dynamic string itself:

```tsx
const DEFAULT_LAUNCHER_HEIGHT = 64;
const DEFAULT_EXPANDED_HEIGHT = 520;

type CategoryStepSheetProps = {
  children: React.ReactNode;
  entry: React.ReactNode;
};

export function CategoryStepSheet({ children, entry }: CategoryStepSheetProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [heights, setHeights] = useState({
    collapsed: DEFAULT_LAUNCHER_HEIGHT,
    expanded: DEFAULT_EXPANDED_HEIGHT,
  });

  useLayoutEffect(() => {
    const measure = () => {
      const layoutHeight = Math.floor(
        layoutRef.current?.getBoundingClientRect().height ?? window.innerHeight,
      );
      const collapsedHeight = Math.max(
        44,
        Math.ceil(launcherRef.current?.getBoundingClientRect().height ?? DEFAULT_LAUNCHER_HEIGHT),
      );
      const contentHeight = Math.ceil(
        sheetBodyRef.current?.scrollHeight ?? DEFAULT_EXPANDED_HEIGHT,
      );
      setHeights({
        collapsed: collapsedHeight,
        expanded: Math.max(
          collapsedHeight + 1,
          Math.min(contentHeight, layoutHeight),
        ),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (layoutRef.current) observer.observe(layoutRef.current);
    if (sheetBodyRef.current) observer.observe(sheetBodyRef.current);
    return () => observer.disconnect();
  }, []);

  const collapsedPoint = `${heights.collapsed}px`;
  const expandedPoint = `${heights.expanded}px`;
  const activePoint = collapsed ? collapsedPoint : expandedPoint;

  return (
    <div
      ref={layoutRef}
      data-testid="category-step-layout"
      className="relative h-full min-h-0"
      style={{
        '--category-sheet-occlusion': activePoint,
      } as React.CSSProperties}
    >
      <div className="h-full min-h-0">{children}</div>
      <Drawer
        open
        modal={false}
        dismissible={false}
        shouldScaleBackground={false}
        noBodyStyles
        disablePreventScroll
        snapPoints={[collapsedPoint, expandedPoint]}
        activeSnapPoint={activePoint}
        setActiveSnapPoint={(point) => {
          if (point === collapsedPoint) setCollapsed(true);
          if (point === expandedPoint) setCollapsed(false);
        }}
      >
        <DrawerContent
          showHandle={false}
          className="max-h-[calc(100dvh-4rem)] overflow-hidden sm:mx-auto sm:max-w-md"
        >
          <div ref={sheetBodyRef} className="flex min-h-0 flex-col">
            <div ref={launcherRef} className="pb-safe">
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand transaction entry' : 'Collapse transaction entry'}
                onClick={() => setCollapsed((value) => !value)}
                className="flex min-h-11 w-full flex-col items-center justify-center gap-1 px-4"
              >
                <span className="h-1.5 w-12 rounded-full bg-border" aria-hidden="true" />
                {collapsed ? <span className="text-sm font-semibold">Log transaction</span> : null}
              </button>
            </div>
            <div data-vaul-no-drag className="min-h-0 overflow-y-auto">
              {entry}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
```

`sheetBodyRef` wraps the launcher and entry exactly once, so its `scrollHeight` is the expanded
height before clamping. Do not add either child height separately. Keep the two-point clamp and CSS
property contract unchanged.

- [ ] **Step 5: Preserve Date/Time as a nested modal drawer**

Add `nested?: boolean` to `DateTimeDrawerProps`, import `DrawerNestedRoot`, and select the root:

```tsx
const Root = nested ? DrawerNestedRoot : Drawer;
```

Replace the opening and closing `Drawer` tags with `Root`. Leave the existing `DrawerTrigger` and
`DrawerContent` JSX between those tags exactly in place, including the current controlled props.

Add `dateDrawerNested?: boolean` to `StepCategoryProps` and pass it as
`nested={dateDrawerNested}` to `DateTimeDrawer`. Update its carousel test mock to capture `nested`
and assert it is true in a harness that opts in. Do not alter category selection, form values,
quick notes, or `onConfirm`.

- [ ] **Step 6: Run category and drawer tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/StepCategory.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/drawer.tsx src/components/DateTimeDrawer.tsx src/components/TransactionFlow/StepCategory.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx
git commit -m "feat: add snapping category entry sheet"
```

---

### Task 6: Integrate the layered sheet into `TransactionFlow`

**Files:**
- Modify: `src/components/TransactionFlow/index.tsx`
- Modify: `src/components/TransactionFlow/TransactionFlow.test.tsx`
- Delete: `src/components/TransactionFlow/TransactionHistoryDrawer.tsx`
- Delete: `src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx`

- [ ] **Step 1: Write failing flow integration tests**

Replace the `TopDashboard` and `TransactionHistoryDrawer` mocks with a
`HomeDashboardCarousel` mock that exposes direct edit callbacks. Mock `CategoryStepSheet` as a
semantic layered wrapper for flow-only tests:

```tsx
vi.mock('./HomeDashboardCarousel', () => ({
  HomeDashboardCarousel: ({ onEditTransaction }: {
    onEditTransaction: (transaction: TransactionRecord) => void;
  }) => (
    <section aria-label="Home activity">
      <button type="button" onClick={() => onEditTransaction(mocks.expense)}>
        Edit expense from full review
      </button>
    </section>
  ),
}));

vi.mock('./CategoryStepSheet', () => ({
  CategoryStepSheet: ({ children, entry }: {
    children: React.ReactNode;
    entry: React.ReactNode;
  }) => (
    <div data-testid="category-step-layout">
      {children}
      <aside>{entry}</aside>
    </div>
  ),
}));
```

Add or update these tests:

```tsx
it('layers the default category entry above the full review carousel', () => {
  renderFlow();
  const layout = screen.getByTestId('category-step-layout');
  expect(within(layout).getByRole('region', { name: 'Home activity' })).toBeVisible();
  expect(within(layout).getByRole('button', { name: 'Start expense' })).toBeVisible();
});

it('routes a full-review row into the existing editor', async () => {
  renderFlow();
  await userEvent.setup().click(
    screen.getByRole('button', { name: 'Edit expense from full review' }),
  );
  expect(await screen.findByDisplayValue('Lunch')).toBeInTheDocument();
});
```

Keep every existing create/edit/reimbursement/undo/delete/place race test unchanged after updating
the dashboard button names.

- [ ] **Step 2: Run the flow test and verify it fails**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionFlow.test.tsx
```

Expected: FAIL because step zero still uses the two-row grid and history drawer.

- [ ] **Step 3: Replace the step-zero grid with `CategoryStepSheet`**

Remove the `TransactionHistoryDrawer` import, `historyDrawerOpen` state, drawer JSX, and
`onViewAllTransactions` prop. Mark the StepCategory Date/Time drawer as nested:

```tsx
<StepCategory
  form={form}
  categoryGroups={categoryGroups}
  onConfirm={openCreateAmountStep}
  dateDrawerNested
/>
```

Render step zero as:

```tsx
{step === 0 ? (
  <CategoryStepSheet entry={activeStep.content}>
    <HomeDashboardCarousel
      baseCurrency={onboarding.analyticsBaseCurrency}
      bigSpendingThreshold={bigSpendingThreshold}
      analyticsSync={analyticsSync}
      onToast={handleToast}
      onEditTransaction={handleEditTransaction}
    />
  </CategoryStepSheet>
) : (
  <StepCard
    animationKey={activeStep.key}
    className={activeStep.className}
    containerClassName="h-full"
  >
    {activeStep.content}
  </StepCard>
)}
```

Give step zero the entire content height by applying `pb-6` only when `step !== 0`. Amount and
Receipt markup and callbacks remain unchanged.

- [ ] **Step 4: Run flow and app tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionFlow.test.tsx src/main.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Remove the orphaned transaction drawer and verify references**

Delete the two transaction drawer files, then run:

```bash
rg -n "TransactionHistoryDrawer|onViewAllTransactions" src e2e
```

Expected: no remaining source or test references.

- [ ] **Step 6: Commit**

```bash
git add src/components/TransactionFlow/index.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/TransactionHistoryDrawer.tsx src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx
git commit -m "feat: layer category entry over full review"
```

---

### Task 7: Update mobile browser coverage and visual captures

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Replace compact/detail-sheet assertions with the new visible contract**

Keep the existing mock transaction seeding and background-rate route. Replace the sheet-opening
portions of the large carousel test with assertions equivalent to:

```ts
const categorySheet = page.getByRole('dialog').filter({
  has: page.getByRole('button', { name: 'Collapse transaction entry' }),
});
await expect(categorySheet).toBeVisible();
await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
await expect(page.getByRole('searchbox', { name: 'Search transaction history' })).toBeVisible();
await expect(page.getByRole('button', { name: 'View all transactions' })).toHaveCount(0);
await expect(page.getByRole('button', { name: 'View all analytics' })).toHaveCount(0);

await page.getByRole('button', { name: 'Collapse transaction entry' }).click();
await expect(page.getByRole('button', { name: 'Expand transaction entry' })).toBeVisible();
await expect(page.getByRole('button', { name: /Food Delivery/ })).toBeVisible();
```

Clicking the collapse control is the deterministic keyboard-equivalent assertion. Retain a CDP
touch gesture assertion that drags the same drawer chrome down and back up, then prove a category
tap still opens Date/Time and a review row still enters the editor.

- [ ] **Step 2: Assert vertical review scroll and horizontal slide swipe do not conflict**

Use the existing `touchSwipe` helper:

```ts
const viewport = page.getByTestId('home-carousel-viewport');
const historyRegion = page.getByRole('region', { name: 'Transaction history' });
const before = await historyRegion.evaluate((element) => element.scrollTop);
await touchSwipe(page, historyRegion, 2, -240);
await expect.poll(() => historyRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
await expect(page.getByRole('button', { name: 'Transactions slide' })).toHaveAttribute('aria-current', 'true');

await touchSwipe(page, viewport, -260, 4);
await expect(page.getByRole('button', { name: 'Analytics slide' })).toHaveAttribute('aria-current', 'true');
await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
```

Retain nested Analytics period-swipe coverage and background analytics synchronization coverage.

- [ ] **Step 3: Capture the three agreed mobile states**

Use `testInfo.outputPath` so screenshots remain test artifacts rather than tracked golden files:

```ts
await page.screenshot({
  path: testInfo.outputPath('category-expanded-transactions.png'),
  scale: 'css',
});
await page.getByRole('button', { name: 'Collapse transaction entry' }).click();
await page.screenshot({
  path: testInfo.outputPath('category-collapsed-transactions.png'),
  scale: 'css',
});
await page.getByRole('button', { name: 'Analytics slide' }).click();
await page.screenshot({
  path: testInfo.outputPath('category-collapsed-analytics.png'),
  scale: 'css',
});
```

- [ ] **Step 4: Run focused browser coverage**

Run:

```bash
npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: PASS. Inspect the three generated screenshots and confirm there is no shadow, modal
backdrop, clipped launcher, hidden active controls, or horizontal page overflow.

- [ ] **Step 5: Commit**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover full review category sheet flow"
```

---

### Task 8: Full verification and cleanup

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Verify removed components and forbidden styling**

Run:

```bash
rg -n "TransactionHistoryDrawer|AnalyticsDrawer|AnalyticsSlide|onViewAllTransactions" src e2e
rg -n "shadow" src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/TransactionHistoryView.tsx src/components/TransactionFlow/AnalyticsView.tsx
```

Expected: both commands return no matches. `TopDashboard` and `CarouselActionButton` remain for the
landing demo.

- [ ] **Step 2: Run all unit/integration tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint and typecheck required by `AGENTS.md`**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both PASS with no diagnostics.

- [ ] **Step 4: Run the production build and browser suite**

Run:

```bash
npm run build
npx playwright test
```

Expected: build and every Playwright project PASS.

- [ ] **Step 5: Review the final diff and commit verification fixes**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors and only this feature's files. If verification required code fixes,
inspect `git status --short`, stage only the displayed and reviewed fix paths, and commit them with
the message `fix: stabilize full review category sheet`.

If no fixes were needed, do not create an empty commit.

---

### Task 9: Publish, pass CI, and merge

**Files:**
- No product files unless CI reveals a reproducible defect.

- [ ] **Step 1: Publish through the GitHub workflow**

Use the `github:yeet` skill to confirm the commit scope, push the feature branch, and open a draft
PR with the approved design, interaction changes, test coverage, and local verification in its
body.

- [ ] **Step 2: Mark the PR ready and monitor required checks**

After confirming the remote diff matches the local feature:

```bash
gh pr ready
gh pr checks --watch --interval 20
```

Expected: every required check reports `pass` or `skipping`; none remain pending or failing.

- [ ] **Step 3: Fix failures from evidence, if any**

Use the `github:gh-fix-ci` workflow: inspect the failing GitHub Actions job and logs, reproduce the
failure locally, write or retain a regression test, implement the minimal fix, rerun the relevant
local checks, commit, push, and return to Step 2. Do not guess from a red check name.

- [ ] **Step 4: Merge only after the final green commit is verified**

Confirm the PR head SHA equals local `HEAD`, required reviews are satisfied, mergeability is clean,
and checks are green. Then use the repository's accepted squash merge:

```bash
gh pr merge --squash --delete-branch
```

Expected: GitHub reports the PR merged. Verify the merge commit appears on `origin/main` and report
the PR link and merge result.
