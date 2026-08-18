# Transparent Track-Bound Carousel Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both home review slides transparent, replace the duplicate headers and dot controls with large titles that move with their slides, and preserve transaction refresh in the content area.

**Architecture:** Keep the existing snap carousel as the only motion system. Put each large title inside its existing `TransactionHistoryView` or `AnalyticsView`, remove the shared indicator overlay, and relocate Refresh within transaction metadata without changing query or mutation behavior.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest/Testing Library, Playwright, TanStack Query state already supplied through `useAnalyticsSync`.

---

## File Map

- Modify `src/components/TransactionFlow/TransactionHistoryView.tsx`: transparent transaction surfaces, 80-pixel track-bound title, and Refresh relocation.
- Modify `src/components/TransactionFlow/TransactionHistoryView.test.tsx`: surface/title/refresh regression coverage.
- Modify `src/components/TransactionFlow/AnalyticsView.tsx`: transparent analytics surface and matching track-bound title.
- Modify `src/components/TransactionFlow/AnalyticsView.test.tsx`: surface/title regression coverage.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.tsx`: remove shared dots and restrict carousel keyboard handling to the viewport.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`: replace dot-driven assertions with slide-state, swipe, and viewport-keyboard assertions.
- Modify `e2e/home-carousel.spec.ts`: use swipe/keyboard navigation and verify transparent computed backgrounds plus track-bound title geometry.

### Task 1: Make the direct review views transparent and move Refresh

**Files:**
- Modify: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsView.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryView.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsView.tsx`

- [ ] **Step 1: Write failing transaction-view assertions**

Extend `renders the full history surface without modal controls` so the desired canvas and title classes are required, and add a metadata-location assertion for Refresh:

```tsx
const heading = screen.getByRole("heading", { name: "Transactions" });
const surface = heading.closest("section");
expect(surface).toHaveClass("bg-transparent");
expect(surface).not.toHaveClass("bg-card");
expect(heading.parentElement).toHaveClass("h-20");
expect(heading).toHaveClass("text-[28px]");

const metadata = screen.getByTestId("transaction-history-metadata");
expect(
  within(metadata).getByRole("button", {
    name: "Refresh transaction history",
  }),
).toBeInTheDocument();
expect(screen.getByTestId("transaction-history-content")).toHaveClass(
  "bg-transparent",
);
```

Import `within` from Testing Library in this test file.

- [ ] **Step 2: Write failing analytics-view assertions**

Extend `renders detailed analytics directly without outer modal controls`:

```tsx
const heading = screen.getByRole('heading', { name: 'Analytics' });
const surface = heading.closest('section');
expect(surface).toHaveClass('bg-transparent');
expect(surface).not.toHaveClass('bg-card');
expect(heading.parentElement).toHaveClass('h-20');
expect(heading).toHaveClass('text-[28px]');
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/TransactionHistoryView.test.tsx src/components/TransactionFlow/AnalyticsView.test.tsx
```

Expected: FAIL because both roots still use `bg-card`, the old title regions are `h-16`, and the new transaction test IDs/location do not exist.

- [ ] **Step 4: Implement the transaction title, transparent canvases, and Refresh location**

Change the root and title markup in `TransactionHistoryView` to:

```tsx
<section className="flex h-full min-h-0 flex-col bg-transparent">
  <header className="flex h-20 shrink-0 items-center justify-center px-4 text-center">
    <h2 className="text-[28px] font-bold tracking-tight text-foreground">
      Transactions
    </h2>
    <p className="sr-only">
      Search and browse the complete transaction history.
    </p>
  </header>

  <div
    data-testid="transaction-history-content"
    className="flex min-h-0 flex-1 flex-col bg-transparent"
  >
```

Delete the old `h-11` indicator spacer. Keep Search unchanged. Replace the metadata row with:

```tsx
<div
  data-testid="transaction-history-metadata"
  className="flex min-h-11 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"
>
  <span>{countLabel}</span>
  <div className="flex min-w-0 items-center gap-1">
    <span className="truncate text-right">{statusLabel}</span>
    <button
      type="button"
      aria-label="Refresh transaction history"
      disabled={!history.isOnline || isRefreshing}
      onClick={refresh}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
    </button>
  </div>
</div>
```

Compute `statusLabel` once above the return so behavior and copy remain unchanged:

```tsx
const statusLabel = isRefreshing
  ? "Updating…"
  : history.meta
    ? `Saved ${format(parseDate(history.meta.capturedAt), "MMM d, HH:mm")}`
    : history.isDownloading
      ? "Downloading…"
      : "Not downloaded";
```

- [ ] **Step 5: Implement the analytics title and transparent canvas**

Change the top of `AnalyticsView` to:

```tsx
<section className="flex h-full min-h-0 flex-col bg-transparent">
  <header className="flex h-20 shrink-0 items-center justify-center px-4 text-center">
    <h2 className="text-[28px] font-bold tracking-tight text-foreground">
      Analytics
    </h2>
    <p className="sr-only">
      Review spending analytics and filter matching transactions.
    </p>
  </header>
```

Delete the old `h-11` indicator spacer. Leave the analytics scroller and controls unchanged.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/TransactionHistoryView.test.tsx src/components/TransactionFlow/AnalyticsView.test.tsx
```

Expected: both files PASS, including refresh invocation and title/surface assertions.

- [ ] **Step 7: Commit the direct-view change**

```bash
git add src/components/TransactionFlow/TransactionHistoryView.tsx \
  src/components/TransactionFlow/TransactionHistoryView.test.tsx \
  src/components/TransactionFlow/AnalyticsView.tsx \
  src/components/TransactionFlow/AnalyticsView.test.tsx
git commit -m "feat: add transparent track-bound review titles"
```

### Task 2: Remove dot controls while preserving carousel navigation

**Files:**
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`

- [ ] **Step 1: Replace the dot-control unit test with the required behavior**

Change `openAnalytics` to drive the viewport keyboard target:

```tsx
async function openAnalytics() {
  const viewport = screen.getByTestId('home-carousel-viewport');
  fireEvent.keyDown(viewport, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(
      screen.getByLabelText('Analytics, slide 2 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true'),
  );
}
```

Replace `keeps one persistent indicator set focused outside inert slides` with:

```tsx
it('removes dot controls while keeping viewport keyboard navigation', async () => {
  const { viewport } = renderCarousel();
  const transactionSlide = screen.getByLabelText('Transactions, slide 1 of 2');
  const analyticsSlide = screen.getByLabelText('Analytics, slide 2 of 2');

  expect(screen.queryByRole('button', { name: 'Transactions slide' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Analytics slide' })).not.toBeInTheDocument();

  fireEvent.keyDown(viewport, { key: 'ArrowRight' });
  await waitFor(() => expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true'));
  expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');

  fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
  await waitFor(() => expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true'));
});
```

Update remaining assertions that read `aria-current` from dot buttons to read `aria-hidden` from the labelled slides. Replace the test-only click back to Transactions with `fireEvent.keyDown(viewport, { key: 'ArrowLeft' })`.

- [ ] **Step 2: Run the carousel unit test and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: FAIL because the Transactions and Analytics dot buttons still render.

- [ ] **Step 3: Remove shared indicators from production**

Delete `CarouselIndicators`, the `cn` import used only by it, and the absolute indicator overlay in `HomeDashboardCarousel`. Narrow the key handler to the viewport:

```tsx
onKeyDown={(event) => {
  if (event.target !== viewportRef.current) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    scrollToSlide(1);
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    scrollToSlide(0);
  }
}}
```

Do not change the snap viewport, pointer gesture, settle, inert, or announcement logic.

- [ ] **Step 4: Run the carousel unit test and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: PASS with swipe, nested-control, keyboard, edit-routing, analytics, and offline coverage intact.

- [ ] **Step 5: Commit the carousel-control change**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx \
  src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
git commit -m "feat: replace carousel dots with slide titles"
```

### Task 3: Update browser coverage for the physical title track

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Write the browser assertions before adapting navigation**

In `layers category entry over both full review slides`, identify labelled slides and headings, then assert transparent canvases:

```ts
const transactionSlide = page.getByLabel('Transactions, slide 1 of 2');
const analyticsSlide = page.getByLabel('Analytics, slide 2 of 2');
const transactionTitle = transactionSlide.getByRole('heading', {
  name: 'Transactions',
});
const analyticsTitle = analyticsSlide.getByRole('heading', {
  name: 'Analytics',
});

await expect(page.getByRole('button', { name: 'Transactions slide' })).toHaveCount(0);
await expect(page.getByRole('button', { name: 'Analytics slide' })).toHaveCount(0);
expect(
  await transactionTitle.evaluate((heading) =>
    getComputedStyle(heading.closest('section')!).backgroundColor,
  ),
).toBe('rgba(0, 0, 0, 0)');
```

Record title geometry before and after a horizontal swipe:

```ts
const analyticsTitleBefore = await analyticsTitle.boundingBox();
await touchSwipe(page, viewport, -260, 4);
await expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
const analyticsTitleAfter = await analyticsTitle.boundingBox();
if (!analyticsTitleBefore || !analyticsTitleAfter) {
  throw new Error('Carousel title geometry missing');
}
expect(analyticsTitleBefore.x).toBeGreaterThan(analyticsTitleAfter.x + 200);
expect(
  await analyticsTitle.evaluate((heading) =>
    getComputedStyle(heading.closest('section')!).backgroundColor,
  ),
).toBe('rgba(0, 0, 0, 0)');
```

- [ ] **Step 2: Run the focused browser test and verify RED**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key PLAYWRIGHT_HTML_OPEN=never \
  npx playwright test e2e/home-carousel.spec.ts --grep "layers category entry"
```

Expected: FAIL against the old `bg-card` surfaces and old dot-control expectations.

- [ ] **Step 3: Adapt all browser navigation to swipe or viewport keyboard input**

- In the background-rates test, replace the Analytics dot click with `touchSwipe(page, viewport, -260, 4)` and wait for the Analytics slide to lose `aria-hidden`.
- Replace `keeps carousel indicators focused across keyboard slide changes` with a viewport-focus test that presses ArrowRight and ArrowLeft, verifies the labelled slide states, and asserts that both old dot buttons have count zero.
- In the layered-carousel test, replace every dot assertion with labelled-slide state assertions.
- Replace the final Transactions dot click with `touchSwipe(page, viewport, 260, 4)` and wait for the Transactions slide to become active before selecting its row.
- Keep the nested analytics period swipe assertions unchanged so inner horizontal gestures remain isolated.

- [ ] **Step 4: Run the full home-carousel browser file and verify GREEN**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key PLAYWRIGHT_HTML_OPEN=never \
  npx playwright test e2e/home-carousel.spec.ts
```

Expected: all home-carousel tests PASS on configured desktop/mobile projects.

- [ ] **Step 5: Commit browser coverage**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover transparent track-bound carousel titles"
```

### Task 4: Full verification and direct delivery

**Files:**
- Verify all modified files and lockfiles without changing dependencies.

- [ ] **Step 1: Install exactly from the committed lockfile**

Run:

```bash
npm ci
```

Expected: exit 0 and the Vaul compatibility postinstall patch applies successfully.

- [ ] **Step 2: Run repository CI-equivalent checks**

Run each command and require exit 0:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key PLAYWRIGHT_HTML_OPEN=never npx playwright test
```

Expected: lint, TypeScript, unit tests, production build, and all Playwright projects PASS with zero failures.

- [ ] **Step 3: Confirm scope and a clean committed worktree**

Run:

```bash
git diff origin/main...HEAD --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: only the approved spec, plan, component, and test commits are ahead; no uncommitted files remain.

- [ ] **Step 4: Rebase onto the latest remote main**

Run:

```bash
git fetch origin main
git rebase origin/main
git rev-list --left-right --count origin/main...HEAD
git merge-base --is-ancestor origin/main HEAD
```

Expected: `0 <positive-count>` and an exit-zero ancestor check. If rebase changes code, rerun the complete checks from Step 2.

- [ ] **Step 5: Push directly to origin/main**

Run:

```bash
git push origin HEAD:main
```

Expected: a fast-forward update of `origin/main`.

- [ ] **Step 6: Verify the remote commit and post-push deployment check**

Run:

```bash
git fetch origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
gh api repos/thasarito/sheetlog/commits/$(git rev-parse HEAD)/check-runs
```

Expected: local HEAD equals `origin/main`; any reported Cloudflare Pages check reaches `completed` with `success` before completion is reported.
