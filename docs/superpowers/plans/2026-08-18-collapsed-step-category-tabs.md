# Collapsed StepCategory Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the collapsed “Log transaction” label with the existing interactive Expense, Income, and Transfer tab strip, then publish a screenshot-backed pull request with passing CI.

**Architecture:** Extract the existing compact transaction-type tabs and their direct form-update behavior into a focused `StepCategoryTypeTabs` component. Render that shared component inside `StepCategory` for expanded carousel navigation and inside `CategoryStepSheet` as collapsed controls, with the two instances sharing form state but never being interactive at the same time.

**Tech Stack:** React 18, TypeScript, TanStack Form, Framer Motion, Vaul, Vitest, Testing Library, Playwright.

---

### Task 1: Share the transaction-type tabs

**Files:**
- Create: `src/components/TransactionFlow/StepCategoryTypeTabs.tsx`
- Create: `src/components/TransactionFlow/StepCategoryTypeTabs.test.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.tsx`
- Test: `src/components/TransactionFlow/StepCategory.test.tsx`
- Test: `src/components/TransactionFlow/StepCategory.carousel.test.tsx`

- [ ] **Step 1: Write the failing shared-tab test**

Create a harness around `useTransactionForm`, render `StepCategoryTypeTabs`, click Income, and assert that the shared form becomes Income, clears category and place, preserves note, and exposes Income as pressed:

```tsx
it("updates the shared form when a collapsed type tab is selected", async () => {
  const hook = renderHook(() =>
    useTransactionForm({
      initialValues: {
        type: "expense",
        category: "Food",
        note: "Central Cafe",
        place: { provider: "google", placeId: "central-cafe" },
      },
    }),
  );
  render(
    <StepCategoryTypeTabs
      form={hook.result.current}
      layoutId="collapsedTransactionType"
    />,
  );

  await userEvent.setup().click(screen.getByRole("button", { name: "Income" }));

  await waitFor(() =>
    expect(hook.result.current.state.values).toMatchObject({
      type: "income",
      category: "",
      note: "Central Cafe",
    }),
  );
  expect(hook.result.current.state.values.place).toBeUndefined();
  expect(screen.getByRole("button", { name: "Income" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/StepCategoryTypeTabs.test.tsx
```

Expected: FAIL because `StepCategoryTypeTabs.tsx` does not exist.

- [ ] **Step 3: Implement the shared tabs and refactor StepCategory**

Create `StepCategoryTypeTabs.tsx` with exported transaction metadata, a shared form update helper, and the existing compact `AnimatedTabs` presentation:

```tsx
export function updateTransactionType(
  form: TransactionFormApi,
  currentType: TransactionType,
  nextType: TransactionType,
) {
  if (nextType === currentType) return;
  form.setFieldValue("type", nextType);
  if (nextType !== "expense") clearTransactionPlace(form);
  form.setFieldValue("category", "");
}

export function StepCategoryTypeTabs({
  form,
  layoutId,
  onChange,
  visualProgress,
}: StepCategoryTypeTabsProps) {
  const type = form.useStore((state) => state.values.type);
  const activeType = type ?? TYPE_OPTIONS[0];
  const handleChange = (nextType: TransactionType) => {
    if (onChange) {
      onChange(nextType);
      return;
    }
    updateTransactionType(form, activeType, nextType);
  };
  return (
    <AnimatedTabs
      tabs={TRANSACTION_TYPE_TABS}
      value={activeType}
      onChange={handleChange}
      layoutId={layoutId}
      variant="compact"
      visualProgress={visualProgress}
    />
  );
}
```

Move the icon/label metadata out of `StepCategory.tsx`, render `StepCategoryTypeTabs` there with its carousel `onChange`, and call `updateTransactionType` from `commitTypeIndex` so both entry points preserve identical field-reset rules.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/StepCategoryTypeTabs.test.tsx src/components/TransactionFlow/StepCategory.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx
```

Expected: all focused transaction-type tests PASS.

- [ ] **Step 5: Commit the shared component**

```bash
git add src/components/TransactionFlow/StepCategoryTypeTabs.tsx src/components/TransactionFlow/StepCategoryTypeTabs.test.tsx src/components/TransactionFlow/StepCategory.tsx
git commit -m "refactor: share category type tabs"
```

### Task 2: Expose tabs in the collapsed sheet

**Files:**
- Modify: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Write the failing collapsed-launcher test**

Pass a `collapsedControls` node from the test harness, collapse the sheet, and assert the old label is absent while the supplied controls and handle are visible:

```tsx
<CategoryStepSheet
  entry={<div data-testid="entry">Categories</div>}
  collapsedControls={<button type="button">Expense</button>}
>
  <button type="button">Interactive review</button>
</CategoryStepSheet>
```

```tsx
expect(screen.queryByText("Log transaction")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Expense" })).toBeVisible();
expect(
  screen.getByRole("button", { name: "Expand transaction entry" }),
).toBeVisible();
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: FAIL because `CategoryStepSheet` does not accept or render `collapsedControls`, and “Log transaction” is still present.

- [ ] **Step 3: Implement the collapsed controls**

Add `collapsedControls?: React.ReactNode` to `CategoryStepSheetProps`. Keep the expand/collapse handle as its own minimum-44-pixel button, remove the text label, and conditionally render the controls as a sibling only while collapsed:

```tsx
<button
  type="button"
  aria-expanded={!collapsed}
  aria-label={collapsed ? "Expand transaction entry" : "Collapse transaction entry"}
  onClick={() => setCollapsed((value) => !value)}
  className={collapsed ? "flex min-h-11 w-full items-center justify-center" : "flex min-h-16 w-full items-center justify-center"}
>
  <span className="h-1.5 w-12 rounded-full bg-border" aria-hidden="true" />
</button>
{collapsed && collapsedControls ? (
  <div data-testid="category-step-collapsed-controls" data-vaul-no-drag className="px-4 pb-3">
    {collapsedControls}
  </div>
) : null}
```

In `TransactionFlow/index.tsx`, pass a `StepCategoryTypeTabs` instance using the live `form` and a unique `collapsedTransactionType` layout id.

- [ ] **Step 4: Run focused component tests to verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/CategoryStepSheet.accessibility.test.tsx src/components/TransactionFlow/StepCategoryTypeTabs.test.tsx
```

Expected: all focused sheet and tab tests PASS.

- [ ] **Step 5: Commit the collapsed launcher**

```bash
git add src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/index.tsx
git commit -m "feat: show category tabs when entry is collapsed"
```

### Task 3: Cover the browser behavior and capture the screenshot

**Files:**
- Modify: `e2e/home-carousel.spec.ts`
- Create: `docs/screenshots/transaction-entry-carousel/category-collapsed-tabs-analytics.png`

- [ ] **Step 1: Update the browser assertion before production code verification**

Replace the collapsed “Log transaction” expectation with assertions that the old label has count zero, `category-step-collapsed-controls` is visible, and Expense, Income, and Transfer are visible within it. Keep the existing screenshot point after the Vaul snap settles.

- [ ] **Step 2: Run the focused browser test**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test e2e/home-carousel.spec.ts --grep "layers category entry" --project=chromium --project="Mobile Chrome"
```

Expected: 2 tests PASS and each project emits `category-collapsed-analytics.png` in its Playwright output directory.

- [ ] **Step 3: Capture and inspect the documentation screenshot**

Use the Playwright browser workflow at a mobile viewport to open the seeded local app, collapse the category sheet, and write:

```text
docs/screenshots/transaction-entry-carousel/category-collapsed-tabs-analytics.png
```

Inspect the image at original detail and confirm Analytics is visible behind the collapsed sheet, the handle is present, all three transaction-type labels are legible, and “Log transaction” is absent.

- [ ] **Step 4: Commit browser coverage and screenshot**

```bash
git add e2e/home-carousel.spec.ts docs/screenshots/transaction-entry-carousel/category-collapsed-tabs-analytics.png
git commit -m "test: document collapsed category tabs"
```

### Task 4: Verify and publish the pull request

**Files:**
- Verify all files changed from `origin/main` through `HEAD`

- [ ] **Step 1: Run repository verification**

Run:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key npx playwright test
git diff --check origin/main...HEAD
```

Expected: lint, typecheck, all unit tests, build, all Playwright projects, and diff check PASS.

- [ ] **Step 2: Confirm branch ancestry and cleanliness**

Run:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
git status --short
```

Expected: the ancestry command exits zero, the branch is zero commits behind, and the worktree is clean.

- [ ] **Step 3: Push and create the pull request**

Push `direct/carousel-transparent-track-title`, create a ready-for-review pull request against `main`, summarize the carousel/category-sheet work, list verification, and embed the committed screenshot with a raw GitHub URL pinned to its commit SHA.

- [ ] **Step 4: Monitor CI**

Watch the pull-request checks until every required check succeeds. If a check fails, inspect its logs, fix the cause test-first, rerun local verification, push the fix, and watch the replacement run.
