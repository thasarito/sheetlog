# Transaction Dock Search Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a StepAmount-style Search clear action, continuously reclaim hidden dashboard-header space for transaction history, and keep the dashboard fixed while the dock follows the mobile keyboard boundary above expanded Step Category.

**Architecture:** `TransactionHistoryDock` keeps the controlled Search interaction and gains only a local input ref. `HomeDashboardCarousel` publishes remaining header space imperatively on the Transactions slide, which `TransactionHistoryView` consumes as padding. `CategoryStepSheet` disables Vaul input repositioning, exposes an explicit expansion request through its accessory context, and uses a focused keyboard-placement hook to transform only the accessory host from `visualViewport` measurements.

**Tech Stack:** React 18, TypeScript, Vaul, Embla Carousel, TanStack Virtual, Vitest/Testing Library, Playwright, Tailwind CSS, Biome.

---

## File Structure

- Modify `src/components/TransactionFlow/TransactionHistoryDock.tsx`: add the conditional clear control and request sheet expansion on Search focus.
- Modify `src/components/TransactionFlow/TransactionHistoryView.test.tsx`: cover clear behavior, focus restoration, and dynamic header padding.
- Modify `src/components/TransactionFlow/TransactionHistoryView.tsx`: consume the Transactions slide's remaining-header-space property.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`: verify remaining header space at initial, partial, and complete collapse.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.tsx`: publish remaining header space without React renders.
- Modify `src/components/TransactionFlow/CategoryStepSheetAccessory.tsx`: add the explicit `requestExpanded` accessory command.
- Create `src/components/TransactionFlow/useKeyboardAccessoryPlacement.ts`: isolate visual-viewport measurement and accessory transform updates.
- Create `src/components/TransactionFlow/useKeyboardAccessoryPlacement.test.tsx`: cover keyboard detection, offset calculation, reset, and missing API fallback.
- Modify `src/components/TransactionFlow/CategoryStepSheet.test.tsx`: verify expansion requests and disabled Vaul input repositioning.
- Modify `src/components/TransactionFlow/CategoryStepSheet.tsx`: wire the expansion command, keyboard placement hook, and fixed Vaul geometry.
- Modify `e2e/home-carousel.spec.ts`: verify integrated clear, header-space, fixed-layout, keyboard-boundary, and dismissal behavior.
- Create `docs/screenshots/transaction-entry-carousel/transaction-dock-search-layout.png`: capture the final Transactions layout for the follow-up PR.

## Task 1: Add the Search clear action

**Files:**
- Modify: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryDock.tsx`

- [ ] **Step 1: Write the failing clear-interaction test**

Add a focused test that renders a record, types a query, and verifies the desired StepAmount-style contract:

```tsx
it("clears transaction search through a 44px trailing control and restores focus", async () => {
  mocks.history.records = [transaction("lunch", { note: "Lunch" })];
  const user = userEvent.setup();
  render(
    <TransactionHistoryViewHarness
      open
      baseCurrency="THB"
      onOpenChange={vi.fn()}
      onEditTransaction={vi.fn()}
    />,
  );

  const search = screen.getByRole("searchbox", {
    name: "Search transaction history",
  });
  expect(
    screen.queryByRole("button", { name: "Clear transaction search" }),
  ).not.toBeInTheDocument();
  await user.type(search, "lunch");

  const clear = screen.getByRole("button", {
    name: "Clear transaction search",
  });
  expect(clear).toHaveClass("absolute", "size-11");
  await user.click(clear);

  expect(search).toHaveValue("");
  expect(clear).not.toBeInTheDocument();
  await waitFor(() => expect(search).toHaveFocus());
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx -t "clears transaction search"
```

Expected: FAIL because `Clear transaction search` does not exist.

- [ ] **Step 3: Implement the minimal clear control**

In `TransactionHistoryDock.tsx`:

```tsx
import { RefreshCw, Search, X } from "lucide-react";

const searchRef = useRef<HTMLInputElement | null>(null);
const clearSearch = () => {
  onSearchChange("");
  window.requestAnimationFrame(() => searchRef.current?.focus());
};
```

Assign `ref={searchRef}` to Search, use `cn` to switch from `pr-3` to `pr-12` only while `search` is non-empty, and render:

```tsx
{search ? (
  <button
    type="button"
    aria-label="Clear transaction search"
    onClick={clearSearch}
    className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
  >
    <X className="h-4 w-4" aria-hidden="true" />
  </button>
) : null}
```

- [ ] **Step 4: Run the focused test and component file**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: all Transaction history tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
git commit -m "feat: add transaction search clear action"
```

## Task 2: Reclaim dashboard-header space during Transactions scrolling

**Files:**
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryView.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryView.tsx`

- [ ] **Step 1: Extend the existing header-collapse test for remaining space**

In `HomeDashboardCarousel.test.tsx`, obtain the Transactions slide and assert the slide property at partial and complete progress:

```tsx
const transactionSlide = screen.getByLabelText("Transactions, slide 2 of 2");
expect(transactionSlide).toHaveStyle({ "--dashboard-header-space": "68px" });

fireEvent.scroll(scroll);
expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
expect(transactionSlide).toHaveStyle({ "--dashboard-header-space": "34px" });

scroll.scrollTop = 68;
fireEvent.scroll(scroll);
expect(transactionSlide).toHaveStyle({ "--dashboard-header-space": "0px" });
```

In `TransactionHistoryView.test.tsx`, assert:

```tsx
expect(screen.getByTestId("transaction-history-content")).toHaveStyle({
  paddingTop:
    "var(--dashboard-header-space, var(--dashboard-header-height, 68px))",
});
```

- [ ] **Step 2: Run both focused tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: FAIL because the slide does not publish `--dashboard-header-space` and history still uses fixed padding.

- [ ] **Step 3: Publish remaining header space from the existing scroll path**

Give the Transactions slide an initial property:

```tsx
style={{ "--dashboard-header-space": `${HEADER_COLLAPSE_DISTANCE}px` } as React.CSSProperties}
```

After `headerCollapseProgress(target)` is calculated, publish remaining pixels on that slide:

```tsx
const remainingHeaderSpace = HEADER_COLLAPSE_DISTANCE * (1 - progress);
slide?.style.setProperty(
  "--dashboard-header-space",
  `${Number(remainingHeaderSpace.toFixed(2))}px`,
);
```

Keep the existing header motion ref and per-slide `verticalProgressRef` behavior unchanged.

- [ ] **Step 4: Consume the property in Transaction history**

Replace the fixed top padding with:

```tsx
style={{
  paddingTop:
    "var(--dashboard-header-space, var(--dashboard-header-height, 68px))",
}}
```

- [ ] **Step 5: Run both focused tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: both test files PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/TransactionHistoryView.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
git commit -m "feat: reclaim hidden transaction header space"
```

## Task 3: Keep the layout fixed and place the dock at the keyboard boundary

**Files:**
- Modify: `src/components/TransactionFlow/CategoryStepSheetAccessory.tsx`
- Create: `src/components/TransactionFlow/useKeyboardAccessoryPlacement.ts`
- Create: `src/components/TransactionFlow/useKeyboardAccessoryPlacement.test.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryDock.tsx`

- [ ] **Step 1: Write failing keyboard-placement unit tests**

Create `useKeyboardAccessoryPlacement.test.tsx` around an exported pure calculation:

```tsx
expect(
  calculateKeyboardAccessoryPlacement({
    windowHeight: 844,
    viewportHeight: 544,
    viewportOffsetTop: 0,
    drawerTop: 324,
  }),
).toEqual({ active: true, keyboardTop: 544, offset: 220 });

expect(
  calculateKeyboardAccessoryPlacement({
    windowHeight: 844,
    viewportHeight: 810,
    viewportOffsetTop: 0,
    drawerTop: 324,
  }),
).toEqual({ active: false, keyboardTop: 844, offset: 0 });
```

Render the hook with fake drawer and host elements plus an `EventTarget` visual viewport. Change height from 844 to 544, dispatch `resize`, and assert:

```tsx
expect(host).toHaveStyle({
  "--transaction-history-keyboard-offset": "220px",
});
expect(host).toHaveAttribute("data-keyboard-active", "true");
expect(host).toHaveAttribute("data-keyboard-top", "544");
```

Restore height to 844 and assert the offset resets to `0px` and `data-keyboard-active="false"`. Add a missing-`visualViewport` case that remains at zero.

- [ ] **Step 2: Extend CategoryStepSheet tests for the integration contract**

Add `repositionInputs?: boolean` to `DrawerRootProps`, then assert the persistent sheet passes:

```tsx
expect(drawerMock.rootProps).toMatchObject({
  repositionInputs: false,
});
```

Extend `AccessoryProbe` with an input whose focus calls `accessory.requestExpanded`. Collapse the sheet, focus that input, and assert `activeSnapPoint` returns to the existing expanded point. Also assert the host transform contains `--transaction-history-keyboard-offset` without changing snap-point measurement.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/useKeyboardAccessoryPlacement.test.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: FAIL because the hook, expansion command, and `repositionInputs={false}` do not exist.

- [ ] **Step 4: Add the accessory expansion command**

Extend `CategoryStepSheetAccessoryContextValue`:

```tsx
requestExpanded: () => void;
```

Add a no-op default. In `CategoryStepSheet`, create a stable callback that calls `setCollapsed(false)` and include it in the provided value. In `TransactionHistoryDock`, call `accessory.requestExpanded` from the Search input's `onFocus` handler.

- [ ] **Step 5: Implement isolated visual-viewport placement**

Create `useKeyboardAccessoryPlacement.ts` with:

```tsx
export const KEYBOARD_INSET_THRESHOLD = 60;

export function calculateKeyboardAccessoryPlacement({
  windowHeight,
  viewportHeight,
  viewportOffsetTop,
  drawerTop,
}: KeyboardAccessoryMeasurements): KeyboardAccessoryPlacement {
  const keyboardTop = viewportHeight + viewportOffsetTop;
  const keyboardInset = windowHeight - keyboardTop;
  if (
    !Number.isFinite(keyboardInset) ||
    keyboardInset <= KEYBOARD_INSET_THRESHOLD
  ) {
    return { active: false, keyboardTop: windowHeight, offset: 0 };
  }
  return {
    active: true,
    keyboardTop,
    offset: Math.max(0, keyboardTop - drawerTop),
  };
}
```

The hook must listen to `visualViewport.resize`, `visualViewport.scroll`, and `window.resize`; measure `drawerElement.getBoundingClientRect().top`; and update only these host values:

```tsx
host.style.setProperty(
  "--transaction-history-keyboard-offset",
  `${placement.offset}px`,
);
host.dataset.keyboardActive = String(placement.active);
host.dataset.keyboardTop = String(placement.keyboardTop);
```

Reset all values on cleanup. Use `ResizeObserver` on the drawer when available so an ordinary snap transition recalculates the keyboard-relative offset.

- [ ] **Step 6: Wire fixed Vaul geometry and the host transform**

In `CategoryStepSheet`:

- store the `DrawerContent` element through a callback ref;
- invoke the keyboard-placement hook with the drawer and accessory host;
- pass `repositionInputs={false}` to `Drawer`;
- preserve both current snap points and active state;
- update the host transform to:

```tsx
transform: `translateY(calc(-100% - ${TRANSACTION_HISTORY_DOCK_GAP}px + var(--transaction-history-keyboard-offset, 0px)))`
```

- [ ] **Step 7: Run focused keyboard and dock tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/useKeyboardAccessoryPlacement.test.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/TransactionHistoryView.test.tsx
```

Expected: all three test files PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/components/TransactionFlow/CategoryStepSheetAccessory.tsx src/components/TransactionFlow/useKeyboardAccessoryPlacement.ts src/components/TransactionFlow/useKeyboardAccessoryPlacement.test.tsx src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/TransactionHistoryDock.tsx
git commit -m "feat: anchor transaction search above keyboard"
```

## Task 4: Verify the integrated mobile layout and capture evidence

**Files:**
- Modify: `e2e/home-carousel.spec.ts`
- Create: `docs/screenshots/transaction-entry-carousel/transaction-dock-search-layout.png`

- [ ] **Step 1: Write failing browser assertions**

Add a dedicated test that installs a controllable `visualViewport` before reload. The test must:

1. select Transactions with Step Category expanded;
2. capture dashboard, history, and drawer rectangles;
3. scroll history to 34px and 68px, checking computed top padding near 34px and 0px;
4. type Search text, verify the 44px clear control, clear, and retain focus;
5. simulate a visual viewport height of 544px;
6. verify Step Category is expanded and its rectangle is unchanged;
7. verify dashboard and history rectangles are unchanged;
8. verify the keyboard top lies inside the drawer rectangle;
9. verify dock bottom is `keyboardTop - 8px` within one-pixel tolerance;
10. restore visual viewport height to 844px and verify the ordinary dock-to-sheet gap returns to 8px.

Use a test initializer shaped like:

```tsx
await page.addInitScript(() => {
  class TestVisualViewport extends EventTarget {
    height = window.innerHeight;
    offsetTop = 0;
    width = window.innerWidth;
    setHeight(height: number) {
      this.height = height;
      this.dispatchEvent(new Event("resize"));
    }
  }
  const viewport = new TestVisualViewport();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  Object.assign(window, {
    __setSheetlogVisualViewportHeight: (height: number) =>
      viewport.setHeight(height),
  });
});
```

Keep test-only type casts local to the `page.evaluate` calls.

- [ ] **Step 2: Run the new browser case and verify RED**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --grep "keeps transaction search fixed above the keyboard"
```

Expected: FAIL on missing clear control, fixed header padding, or keyboard host placement before the final production integration.

- [ ] **Step 3: Make only integration corrections required by browser evidence**

Adjust event timing, finite measurement guards, or one-pixel geometry tolerances without changing the approved architecture. Do not introduce a new snap point, root resize, shadow, or query state.

- [ ] **Step 4: Run the focused Home carousel suite**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts
```

Expected: all Home carousel cases PASS across Chromium and Mobile Chrome, with only explicit touch-only desktop skips.

- [ ] **Step 5: Capture and inspect the Transactions screenshot**

Run the app with the same E2E environment, capture the scrolled Transactions state showing the clear control and reclaimed header space, and save it at:

```text
docs/screenshots/transaction-entry-carousel/transaction-dock-search-layout.png
```

Inspect the image for clipping, keyboard-boundary gaps, theme token use, and any shadow. Do not commit test-result output directories.

- [ ] **Step 6: Commit Task 4**

```bash
git add e2e/home-carousel.spec.ts docs/screenshots/transaction-entry-carousel/transaction-dock-search-layout.png
git commit -m "test: cover transaction dock search layout"
```

## Task 5: Final verification, review, and publication

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run the complete local gate**

Run fail-fast:

```bash
set -e
npm test
npm run lint
npx tsc --noEmit
npm run build
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test
git diff --check origin/main...HEAD
```

Expected: all commands exit zero. Existing informational Biome schema, Browserslist, or bundle-size messages may remain; no new shipped-source warning is accepted.

- [ ] **Step 2: Audit product constraints**

Run:

```bash
rg -n "shadow" src/components/TransactionFlow/TransactionHistoryDock.tsx src/components/TransactionFlow/CategoryStepSheet.tsx
git status --short
```

Expected: no shadow usage and a clean worktree.

- [ ] **Step 3: Request an independent code review**

Review `origin/main...HEAD` for search semantics, header-space feedback loops, VisualViewport compatibility, Vaul snap preservation, cleanup behavior, accessibility, and browser-test validity. Resolve every Critical or Important finding test-first.

- [ ] **Step 4: Rebase on the latest origin/main**

Run:

```bash
git fetch origin main
git rebase origin/main
git merge-base HEAD origin/main
git rev-parse origin/main
```

Expected: merge-base equals the freshly fetched `origin/main`. If rebase changes commits, rerun the affected and full verification gates.

- [ ] **Step 5: Push and create the follow-up PR**

Push `feat/transaction-dock-search-layout`, create a PR targeting `main`, embed the committed screenshot using the final commit SHA, and include exact unit, lint, typecheck, build, and Playwright results.

- [ ] **Step 6: Watch CI to completion**

Run:

```bash
gh pr checks "$(gh pr view --json number --jq .number)" --watch --interval 10
```

Expected: every required check reaches a passing terminal state. If GitHub Actions fails, inspect the failing run logs before making an approved test-first correction.
