# Category Gesture Arbitration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve carousel swipes before the long-press threshold, lock activated long presses to quick-note dragging, and animate the compact transaction-type indicator with live carousel progress.

**Architecture:** `CategoryGrid` prevents native touch scrolling only after its existing 400 ms long press activates and reports cancellation to the radial menu. `StepCategory` derives bounded fractional progress from `scrollLeft`, while `AnimatedTabs` renders a single progress-driven compact indicator and keeps semantic selection tied to the committed form type.

**Tech Stack:** React 18, TypeScript, Framer Motion, Tailwind CSS 4, Vitest, Testing Library, Playwright

---

## File Map

- `src/components/CategoryGrid.tsx`: arbitrate native touch scrolling after long-press activation and propagate cancellation.
- `src/components/CategoryGrid.test.tsx`: verify pre-threshold movement remains scrollable and post-threshold touch movement is cancelled for radial dragging.
- `src/components/ui/AnimatedTabs.tsx`: render optional fractional compact-indicator progress without changing semantic selection.
- `src/components/ui/AnimatedTabs.test.tsx`: verify fractional indicator translation and nearest-tab visual emphasis.
- `src/components/TransactionFlow/StepCategory.tsx`: calculate live carousel progress and connect radial cancellation.
- `src/components/TransactionFlow/StepCategory.carousel.test.tsx`: verify live visual progress precedes form-type commit.
- `e2e/transaction-entry-carousel.spec.ts`: verify real touch arbitration and in-progress tab animation.

### Task 1: Lock activated long presses to quick-note dragging

**Files:**
- Modify: `src/components/CategoryGrid.test.tsx`
- Modify: `src/components/CategoryGrid.tsx`

- [ ] **Step 1: Write failing gesture-arbitration tests**

Add tests that dispatch a cancelable native `touchmove` before and after advancing the 400 ms timer. Before activation, `defaultPrevented` must be false. After activation, it must be true, pointer movement must call `onDrag`, and pointer cancellation must call a new optional `onCancel` callback.

```tsx
const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
category.dispatchEvent(touchMove);
expect(touchMove.defaultPrevented).toBe(false);

act(() => vi.advanceTimersByTime(400));
const lockedMove = new Event("touchmove", { bubbles: true, cancelable: true });
category.dispatchEvent(lockedMove);
expect(lockedMove.defaultPrevented).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/CategoryGrid.test.tsx`

Expected: FAIL because activated long presses do not prevent native touch scrolling and `onCancel` is not exposed.

- [ ] **Step 3: Implement the long-press touch lock**

Extend both grid prop types with `onCancel?: () => void`. Attach one native non-passive `touchmove` listener to each category button through a button ref:

```tsx
useEffect(() => {
  const button = buttonRef.current;
  if (!button) return;
  const preventNativeScroll = (event: TouchEvent) => {
    if (isLongPressRef.current) event.preventDefault();
  };
  button.addEventListener("touchmove", preventNativeScroll, { passive: false });
  return () => button.removeEventListener("touchmove", preventNativeScroll);
}, []);
```

Call `onCancel` only when an activated gesture receives `pointercancel`. Do not change the 400 ms threshold, 10 px movement tolerance, button hit target, or tap suppression.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/CategoryGrid.test.tsx`

Expected: all CategoryGrid tests PASS.

### Task 2: Drive compact tabs from fractional carousel progress

**Files:**
- Modify: `src/components/ui/AnimatedTabs.test.tsx`
- Modify: `src/components/ui/AnimatedTabs.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.carousel.test.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.tsx`

- [ ] **Step 1: Write failing compact-tab tests**

Render three compact tabs with semantic `value="expense"` and `visualProgress={0.5}`. Assert that the indicator exposes:

```tsx
expect(screen.getByTestId("animated-tabs-compact-indicator")).toHaveStyle({
  transform: "translateX(calc(50% + 2px))",
});
expect(screen.getByRole("button", { name: "Expense" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
expect(screen.getByRole("button", { name: "Income" })).toHaveClass(
  "text-foreground",
);
```

In the carousel test, set `scrollLeft` to `150` for a `300` px viewport, dispatch `scroll`, and assert the indicator moves while the form type remains `expense` before the 80 ms settle timer.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/components/ui/AnimatedTabs.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx`

Expected: FAIL because `visualProgress` and the shared compact indicator do not exist.

- [ ] **Step 3: Implement the shared progress indicator**

Add `visualProgress?: number` to `AnimatedTabsProps`. For the compact variant, clamp progress from `0` through `tabs.length - 1`, derive the nearest visual index, and render one indicator behind the buttons:

```tsx
const progress = Math.max(
  0,
  Math.min(tabs.length - 1, visualProgress ?? selectedIndex),
);
const visualIndex = Math.round(progress);

<motion.div
  data-testid="animated-tabs-compact-indicator"
  aria-hidden="true"
  className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-xl bg-surface-3"
  style={{
    width: `calc((100% - ${8 + (tabs.length - 1) * 4}px) / ${tabs.length})`,
    transform: `translateX(calc(${progress * 100}% + ${progress * 4}px))`,
  }}
/>
```

Use semantic selection only for `aria-pressed`; use the nearest visual index for icon and label colors. Preserve all non-compact variants.

- [ ] **Step 4: Connect live viewport progress**

In `StepCategory`, initialize `visualProgress` from `selectedIndex`. On every scroll, compute:

```ts
const progress = Math.max(
  0,
  Math.min(TYPE_OPTIONS.length - 1, viewport.scrollLeft / viewport.clientWidth),
);
setVisualProgress(progress);
```

Pass it to `AnimatedTabs`. Keep `commitTypeIndex` behind the existing 80 ms settle timer, reset visual progress when external selection changes, pass `radialHandlers.onCancel` into `CategoryGrid`, and clear the radial menu on pointer cancellation.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- src/components/ui/AnimatedTabs.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx src/components/CategoryGrid.test.tsx`

Expected: all focused tests PASS.

### Task 3: Verify real touch behavior and integrate

**Files:**
- Modify: `e2e/transaction-entry-carousel.spec.ts`

- [ ] **Step 1: Add failing browser regressions**

Extend the seeded quick-note test to hold for 450 ms, drag, and assert that `transaction-type-carousel.scrollLeft` stays unchanged while the radial menu remains open. Add a partial swipe test that compares the compact indicator's bounding box before release and confirms the semantic Expense button remains pressed until settle.

- [ ] **Step 2: Run the browser regressions**

Run: `VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts --project=chromium`

Expected after Tasks 1 and 2: all transaction-entry carousel tests PASS, including hold-drag-release and partial-swipe animation.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts --project=chromium
```

Expected: all commands exit 0; existing Biome schema and bundle-size informational warnings may remain.

- [ ] **Step 4: Review and commit**

Inspect `git diff --check` and the scoped diff. Commit only the spec, plan, implementation, and tests; preserve `output/playwright/transaction-flow/` untracked.

```bash
git add docs/superpowers/specs/2026-08-17-category-gesture-arbitration-design.md docs/superpowers/plans/2026-08-17-category-gesture-arbitration.md src/components/CategoryGrid.tsx src/components/CategoryGrid.test.tsx src/components/ui/AnimatedTabs.tsx src/components/ui/AnimatedTabs.test.tsx src/components/TransactionFlow/StepCategory.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx e2e/transaction-entry-carousel.spec.ts
git commit -m "fix: arbitrate category carousel gestures"
```

- [ ] **Step 5: Push safely to main**

Fetch `origin/main`, rebase if necessary, rerun verification on the final tree, request focused code review, and push with `git push origin HEAD:main` only when `origin/main` is an ancestor of `HEAD`. Never force push.
