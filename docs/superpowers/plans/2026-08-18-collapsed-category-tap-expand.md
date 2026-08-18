# Collapsed Category Tap-to-Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the category entry sheet from any tap within its collapsed launcher, reduce the handle, and keep the transaction-type tabs visually identical in both sheet states.

**Architecture:** Keep collapse state inside `CategoryStepSheet`. Add a bubble-phase click handler to the existing sheet dialog so nested tab actions commit before expansion, keep the handle button responsible for collapsing from the expanded state, and restore focus to that persistent handle when expansion unmounts a focused collapsed control. Give both states the same 44px handle slot and full-width shared tab component.

**Tech Stack:** React 18, TypeScript, Vaul, Vitest, Testing Library, Playwright, Tailwind CSS.

---

### Task 1: Make the collapsed launcher reveal the entry sheet

**Files:**
- Modify: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Write failing component and browser tests**

Add a collapsed-controls click spy and assert that keyboard-activating the nested control invokes the spy, changes the handle label back to `Collapse transaction entry`, and moves focus to that expanded handle. Collapse again, click `category-step-launcher` outside a nested control, and assert it expands. Render the real shared type controls in the sheet and prove selecting Income updates the shared form while expanding. Assert the grip has `h-1 w-8` and the handle uses `min-h-11` in both states.

Add a focused browser test that captures the expanded and collapsed tab-strip geometry and asserts equal horizontal position, width, and height. Click Income after collapsing, then assert the expanded Income tab is selected and focus moves to the expanded handle. Keep the longer dashboard-reel scenario unchanged so its animation coverage stays within its timeout budget.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: FAIL because collapsed tab and launcher clicks do not expand, and the grip still uses `h-1.5 w-12`.

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --grep "keeps category type tabs identical" --project=chromium
```

Expected: FAIL because the collapsed tab strip is inset 16px relative to the expanded tab strip and a collapsed tab click does not expand.

- [ ] **Step 3: Implement the minimal component change**

Add sheet-dialog click bubbling that expands only while collapsed, track whether focus needs restoration, make the handle set the opposite rendered state without a competing functional toggle, use the same 44px handle slot in both states, and remove the collapsed-only tab gutter:

```tsx
const launcherButtonRef = useRef<HTMLButtonElement>(null);
const restoreLauncherFocusRef = useRef(false);
const DEFAULT_LAUNCHER_HEIGHT = 44;

useLayoutEffect(() => {
  if (collapsed || !restoreLauncherFocusRef.current) return;
  restoreLauncherFocusRef.current = false;
  launcherButtonRef.current?.focus({ preventScroll: true });
}, [collapsed]);

<DrawerContent
  showHandle={false}
  onClick={() => {
    if (collapsed) {
      restoreLauncherFocusRef.current = true;
      setCollapsed(false);
    }
  }}
>
  <div ref={setLauncherElement} data-testid="category-step-launcher">
    <button
      ref={launcherButtonRef}
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand transaction entry" : "Collapse transaction entry"}
      onClick={() => setCollapsed(!collapsed)}
      className="flex min-h-11 w-full items-center justify-center px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
    >
      <span className="h-1 w-8 rounded-full bg-border" aria-hidden="true" />
    </button>
    {collapsed && collapsedControls ? (
      <div
        data-testid="category-step-collapsed-controls"
        data-vaul-no-drag
        className="pb-3"
      >
        {collapsedControls}
      </div>
    ) : null}
  </div>
</DrawerContent>
```

- [ ] **Step 4: Verify focused component and browser GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/CategoryStepSheet.accessibility.test.tsx
```

Expected: both files PASS.

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --grep "keeps category type tabs identical" --project=chromium --project="Mobile Chrome"
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --grep "layers category entry" --project=chromium --project="Mobile Chrome"
```

Expected: both browser projects PASS.

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 6: Commit and push directly to main**

Fetch `origin/main`, ensure it remains an ancestor (or rebase and rerun verification if it advanced), commit the focused change, then push with an explicit refspec:

```bash
git push origin HEAD:main
```

Finally fetch again and verify `origin/main` equals `HEAD` and the worktree is clean.
