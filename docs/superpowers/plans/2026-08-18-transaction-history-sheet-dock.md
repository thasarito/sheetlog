# Transaction History Sheet Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Transactions search, count, saved status, and refresh controls into a compact dock that stays attached above Step Category vertically and tracks the Transactions Embla slide horizontally.

**Architecture:** `CategoryStepSheet` will expose a single accessory portal host inside the transformed Vaul layer and publish the dock's measured height as a CSS variable. `TransactionHistoryView` will retain all state and render one extracted dock either through that host or inline when no provider exists. `HomeDashboardCarousel` will drive the dock imperatively from the real Transactions slide rectangle during Embla motion, avoiding per-frame React renders and preserving signed loop/reversal behavior.

**Tech Stack:** React 19, TypeScript, Vaul, Embla Carousel, TanStack Virtual, Vitest + Testing Library, Playwright, Tailwind CSS.

---

## Task 1: Add a sheet accessory host without changing sheet geometry

**Files:**

- Create: `src/components/TransactionFlow/CategoryStepSheetAccessory.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Test: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`

- [ ] **Step 1: Write the failing accessory-host test**

Add a child probe that reads `useCategoryStepSheetAccessory()`, portals a marker when `host` is ready, and reports a measured height. Assert:

```tsx
expect(screen.getByTestId("category-step-accessory-host")).toContainElement(
  screen.getByText("Accessory probe"),
);
expect(screen.getByTestId("category-step-accessory-host")).toHaveAttribute(
  "data-vaul-no-drag",
);
expect(screen.getByTestId("category-step-layout")).toHaveStyle({
  "--transaction-history-dock-height": "96px",
});
expect(rootProps.snapPoints).toEqual(["44px", "164px"]);
```

Also assert that the accessory host is outside `category-step-sheet-body`, and that neither its class nor its descendants contain a `shadow` utility.

- [ ] **Step 2: Run the focused test and record RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: FAIL because the accessory context, host, and dock-height CSS variable do not exist.

- [ ] **Step 3: Implement the accessory context contract**

Create `CategoryStepSheetAccessory.tsx` with an explicit absent-provider value so consumers can avoid an inline first-frame flash:

```tsx
import { createContext, useContext } from "react";

export const DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT = 104;
export const TRANSACTION_HISTORY_DOCK_GAP = 8;

export type CategoryStepSheetAccessoryContextValue = {
  provided: boolean;
  host: HTMLDivElement | null;
  reportHeight: (height: number) => void;
};

const CategoryStepSheetAccessoryContext =
  createContext<CategoryStepSheetAccessoryContextValue>({
    provided: false,
    host: null,
    reportHeight: () => undefined,
  });

export const CategoryStepSheetAccessoryProvider =
  CategoryStepSheetAccessoryContext.Provider;

export function useCategoryStepSheetAccessory() {
  return useContext(CategoryStepSheetAccessoryContext);
}
```

- [ ] **Step 4: Render the host in the Vaul transform layer**

In `CategoryStepSheet`, add `accessoryHost` state, a stable `reportAccessoryHeight` callback that writes a rounded positive value to the root CSS custom property, and wrap the existing layout in the provider:

```tsx
const reportAccessoryHeight = useCallback((height: number) => {
  const value = Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT;
  layoutRef.current?.style.setProperty(
    "--transaction-history-dock-height",
    `${value}px`,
  );
}, []);
```

Publish the safe default on the layout:

```tsx
"--transaction-history-dock-height":
  `${DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT}px`,
```

Change only `DrawerContent` overflow to visible, retain `overflow-hidden` on `category-step-sheet-body`, and mount the host before the body:

```tsx
<div
  ref={setAccessoryHost}
  data-testid="category-step-accessory-host"
  data-vaul-no-drag
  className="pointer-events-none absolute inset-x-0 top-0 z-10 overflow-visible"
  style={{
    transform: `translateY(calc(-100% - ${TRANSACTION_HISTORY_DOCK_GAP}px))`,
  }}
/>
```

Do not include the host in launcher, safe-area, entry, collapsed-point, or expanded-point measurement.

- [ ] **Step 5: Run the focused test and record GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: PASS, with all existing snap-point and stable type-tabs tests unchanged.

- [ ] **Step 6: Commit the sheet host**

```bash
git add src/components/TransactionFlow/CategoryStepSheetAccessory.tsx src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx
git commit -m "feat: add category sheet accessory host"
```

## Task 2: Extract and portal the Transactions dock

**Files:**

- Create: `src/components/TransactionFlow/TransactionHistoryDock.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryView.tsx`
- Test: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`

- [ ] **Step 1: Write failing inline and portalled-dock tests**

Keep the existing standalone harness and assert that it still renders exactly one inline searchbox and metadata row. Add a provider harness with a real host element and assert:

```tsx
expect(screen.getAllByTestId("transaction-history-dock")).toHaveLength(1);
expect(host).toContainElement(screen.getByTestId("transaction-history-dock"));
expect(
  screen.getByTestId("transaction-history-content"),
).not.toContainElement(screen.getByRole("searchbox"));
expect(screen.getByRole("region", { name: "Transaction history" })).toHaveStyle({
  paddingBottom:
    "calc(var(--category-sheet-occlusion, env(safe-area-inset-bottom)) + var(--transaction-history-dock-height, 104px) + 8px)",
});
```

Mock `ResizeObserver` with a 104px dock rectangle and assert `reportHeight(104)`. Verify no `shadow` class, 12px inset (`mx-3`), 16px radius (`rounded-2xl`), and a 44px search input.

- [ ] **Step 2: Run the focused view test and record RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: FAIL because controls are still inline and no dock component, portal, measurement, or combined occlusion exists.

- [ ] **Step 3: Build `TransactionHistoryDock` with a standalone fallback**

Define the dock props around existing derived state and callbacks:

```tsx
export type TransactionHistoryDockProps = {
  search: string;
  onSearchChange: (value: string) => void;
  countLabel: string;
  statusLabel: string;
  canRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  motionRef?: React.RefObject<TransactionHistoryDockMotionHandle | null>;
};
```

Use `useCategoryStepSheetAccessory()` to select exactly one render target:

```tsx
if (accessory.provided && !accessory.host) return null;
return accessory.host ? createPortal(dock, accessory.host) : dock;
```

Render the approved compact visual structure:

```tsx
<div
  ref={dockElementRef}
  data-testid="transaction-history-dock"
  data-vaul-no-drag
  className="pointer-events-auto relative mx-3 rounded-2xl border border-border/70 bg-background/95 p-2 backdrop-blur-md"
>
  <span
    aria-hidden="true"
    className="absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-border/80"
  />
  {/* Existing 44px search and compact metadata/refresh controls */}
</div>
```

No shadow utility is permitted. Observe the dock rectangle and call `accessory.reportHeight(rect.height)` without moving search or refresh ownership out of the view.

- [ ] **Step 4: Move controls without changing behavior**

In `TransactionHistoryView`:

- keep `search`, debounce, filtering, count, refresh, and status derivation exactly where they are;
- replace the existing inline controls with one `TransactionHistoryDock`;
- pass the motion ref through a new optional prop;
- leave error and incomplete-cache banners in the slide content;
- pass `usesSheetAccessory={accessory.provided}` to the virtual list.

Use this Transactions-only reserved inset when portalled:

```tsx
const bottomInset = usesSheetAccessory
  ? "calc(var(--category-sheet-occlusion, env(safe-area-inset-bottom)) + var(--transaction-history-dock-height, 104px) + 8px)"
  : "var(--category-sheet-occlusion, env(safe-area-inset-bottom))";
```

Apply the same value to `paddingBottom` and `scrollPaddingBottom` without modifying virtualizer totals, row measurement, or anchor restoration.

- [ ] **Step 5: Run the focused view test and record GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: PASS, including existing search debounce, count, saved state, refresh, offline, error, edit, and anchor tests.

- [ ] **Step 6: Commit the dock extraction**

```bash
git add src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/TransactionHistoryView.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
git commit -m "feat: dock transaction history controls above category"
```

## Task 3: Synchronize dock motion with the real Transactions slide

**Files:**

- Modify: `src/components/TransactionFlow/TransactionHistoryDock.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Test: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Test: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`

- [ ] **Step 1: Write failing dock-motion tests**

In the mocked `TransactionHistoryView`, install a fake handle into the new prop and capture calls. Give the viewport and both slide nodes deterministic rectangles. Assert:

```tsx
expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
  x: 300,
  viewportWidth: 300,
  interactive: false,
  moving: false,
});
```

After selecting Transactions, expect `x: 0` and `interactive: true`. During emitted `scroll`, mutate the Transactions slide left edge to `125`, emit `scroll`, and expect `{ x: 125, interactive: false, moving: true }`. Cover negative x, looped previous navigation, reversal, settle, `reInit`, and reduced motion.

In the dock test, assert an imperative noninteractive update sets `translate3d`, `aria-hidden`, `inert`, and `pointer-events: none`; assert the settled Transactions update restores accessibility; assert settling Analytics blurs a focused searchbox.

- [ ] **Step 2: Run focused tests and record RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: FAIL because the motion handle and real-slide geometry synchronization are absent.

- [ ] **Step 3: Implement the imperative motion handle**

Export:

```tsx
export type TransactionHistoryDockMotion = {
  x: number;
  viewportWidth: number;
  interactive: boolean;
  moving: boolean;
};

export type TransactionHistoryDockMotionHandle = {
  setMotion: (motion: TransactionHistoryDockMotion) => void;
};
```

Install the handle with `useImperativeHandle`. Each update must:

```tsx
element.style.transform = `translate3d(${x}px, 0, 0)`;
element.style.pointerEvents = interactive ? "auto" : "none";
element.toggleAttribute("inert", !interactive);
element.setAttribute("aria-hidden", interactive ? "false" : "true");
element.dataset.motion = moving ? "moving" : "settled";
element.dataset.offsetX = String(x);
```

Only set `visibility: hidden` when motion is settled and `Math.abs(x) >= viewportWidth - 1`; keep it visible while moving. Blur the active descendant before making the dock inert. The portalled default is hidden/inert because Analytics is the default; the inline fallback is active.

- [ ] **Step 4: Drive motion from actual Embla slide geometry**

In `HomeDashboardCarousel`, create `transactionDockMotionRef`, then measure the actual Transactions slide relative to the viewport:

```tsx
const renderTransactionDockMotion = useCallback(
  (interactive: boolean, moving: boolean) => {
    const viewport = viewportRef.current;
    const transactionSlide = slideRefs.current[1];
    if (!viewport || !transactionSlide) return;
    const viewportRect = viewport.getBoundingClientRect();
    const slideRect = transactionSlide.getBoundingClientRect();
    transactionDockMotionRef.current?.setMotion({
      x: slideRect.left - viewportRect.left,
      viewportWidth: viewportRect.width,
      interactive,
      moving,
    });
  },
  [],
);
```

Call it with `(false, true)` at pointer-motion start and on Embla `scroll`. Call it with `(selectedIndex === 1, false)` after `select`, `settle`, initial setup, and `reInit`. Pass the ref to `TransactionHistoryView`. Continue to use existing Embla direction/reversal logic for the title reel; do not derive dock x from title-reel math.

- [ ] **Step 5: Run focused tests and record GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: PASS for both current carousel behavior and new dock motion/accessibility cases.

- [ ] **Step 6: Commit synchronized carousel motion**

```bash
git add src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
git commit -m "feat: sync transaction dock with carousel motion"
```

## Task 4: Verify the integrated Vaul, Embla, virtual-list, and keyboard behavior

**Files:**

- Modify: `e2e/home-carousel.spec.ts`
- Modify as needed from failures: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Modify as needed from failures: `src/components/TransactionFlow/TransactionHistoryDock.tsx`
- Modify as needed from failures: `src/components/TransactionFlow/TransactionHistoryView.tsx`
- Modify as needed from failures: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`

- [ ] **Step 1: Add failing browser acceptance assertions**

Extend the existing Chromium + Mobile Chrome home-carousel scenario to assert:

```ts
await expect(page.getByTestId("transaction-history-dock")).toHaveCount(1);
await expect(page.getByTestId("transaction-history-dock")).toHaveAttribute(
  "aria-hidden",
  "true",
);
expect(await page.getByTestId("transaction-history-dock").evaluate(
  (node) => getComputedStyle(node).boxShadow,
)).toBe("none");
```

Measure the dock bottom and DrawerContent top before, during, and after a real sheet drag, allowing at most 1px rounding error from the approved 8px gap. During both carousel directions, sample `dock.left - viewport.left` and `transactionSlide.left - viewport.left` and require them to match within 1px. Verify `inert`/pointer state at rest and in motion.

Enter a search query on Transactions, swipe to Analytics and back, and assert the query and filtered count persist. Focus the searchbox on the mobile project and assert the active sheet snap point and 8px relationship do not change. Scroll to the final virtualized row and assert its bottom is above the combined occlusion.

- [ ] **Step 2: Run the focused browser spec and record RED**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --project=chromium --project="Mobile Chrome"
```

Expected: at least one new dock integration assertion fails before final production refinements.

- [ ] **Step 3: Make the smallest integration fixes**

Adjust only geometry timing, focus release, visibility, or CSS required by the failing evidence. Preserve:

- category snap points and entry measurement;
- exactly one transaction-type tabs fieldset;
- Analytics controls and occlusion;
- title-reel motion;
- history query/mutation/refetch semantics;
- no-shadow styling.

- [ ] **Step 4: Re-run browser coverage to GREEN**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --project=chromium --project="Mobile Chrome"
```

Expected: all tests pass on Chromium and Mobile Chrome.

- [ ] **Step 5: Capture the approved visual**

Run the app with the same E2E environment and use Playwright to capture the settled Transactions state with the dock above collapsed Step Category in both light and dark theme. Save the primary image under `artifacts/transaction-history-sheet-dock.png` for the PR body; do not commit generated Playwright output.

- [ ] **Step 6: Commit browser coverage and refinements**

```bash
git add e2e/home-carousel.spec.ts src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/TransactionHistoryView.tsx src/components/TransactionFlow/HomeDashboardCarousel.tsx
git commit -m "test: cover transaction history sheet dock"
```

## Task 5: Full verification and delivery

**Files:**

- Verify all changed source, test, and documentation files

- [ ] **Step 1: Run unit tests for the changed subsystem**

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

- [ ] **Step 2: Run repository-required static checks**

```bash
npm run lint
npx tsc --noEmit
```

- [ ] **Step 3: Run the complete browser suite**

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test
```

- [ ] **Step 4: Audit scope and style**

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
rg -n "shadow" src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/TransactionHistoryView.tsx
git status --short
```

Expected: clean diff check; no shadow usage in the new surface; only planned files changed; no generated output staged.

- [ ] **Step 5: Rebase on the latest remote main and repeat affected checks**

```bash
git fetch origin main
git rebase origin/main
git merge-base HEAD origin/main
git rev-parse origin/main
```

Expected: merge-base equals the latest `origin/main`. Re-run unit, lint, typecheck, and the affected Chromium/Mobile Chrome spec after any rebase rewrite.

- [ ] **Step 6: Request code review, open the PR, and monitor CI**

Use the repository's PR workflow with the screenshot embedded in the PR description. Include the exact unit, Playwright, lint, and typecheck results. Address only evidence-backed review or CI failures, push the branch, and wait until every required check passes.
