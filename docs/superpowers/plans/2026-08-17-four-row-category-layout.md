# Four-Row Category Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve four stable category rows, hide their scrollbar, and give all remaining dashboard height to Transactions/Analytics without changing category gestures.

**Architecture:** Replace the fixed one-quarter/three-quarter dashboard split with a remaining-space row plus an intrinsic category row. Make the four-column category carousel viewport square, capped at the actual app's 390 px scale on wider host surfaces, so four rows of square tiles and their existing equal gaps occupy exactly the viewport width; each slide keeps vertical overflow enabled while hiding scrollbar chrome.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Playwright

---

## File Map

- `src/components/TransactionFlow/index.tsx`: assign remaining dashboard height to `HomeDashboardCarousel` and make the category row intrinsic.
- `src/components/TransactionFlow/StepCategory.tsx`: reserve the responsive four-row viewport and hide each slide's vertical scrollbar.
- `src/components/CategoryGrid.tsx`: split each square tile into equal icon and label regions.
- `src/components/CategoryGrid.test.tsx`: guard the tile's equal-half content alignment and existing interactions.
- `src/components/TransactionFlow/TransactionFlow.test.tsx`: guard the dashboard track allocation.
- `src/components/TransactionFlow/StepCategory.carousel.test.tsx`: guard square sizing and hidden-but-enabled vertical overflow.
- `e2e/transaction-entry-carousel.spec.ts`: verify real browser geometry at the 390×844 app viewport.
- `docs/screenshots/transaction-entry-carousel/category-light.png`: refreshed light-mode PR screenshot.
- `docs/screenshots/transaction-entry-carousel/category-graphite-indigo.png`: refreshed dark-mode PR screenshot.

### Task 1: Add layout regressions

**Files:**
- Modify: `src/components/TransactionFlow/TransactionFlow.test.tsx:556-577`
- Modify: `src/components/TransactionFlow/StepCategory.carousel.test.tsx:70-130`
- Modify: `e2e/transaction-entry-carousel.spec.ts:260-310`

- [ ] **Step 1: Replace the old ratio assertion with the remaining-space contract**

```tsx
it("gives remaining dashboard space to activity above an intrinsic category row", () => {
  renderFlow();

  const transactionCanvas = screen.getByTestId("transaction-canvas");
  expect(transactionCanvas).toHaveStyle({
    height: `${window.innerHeight}px`,
  });
  expect(transactionCanvas).toHaveClass("shrink-0");
  expect(transactionCanvas).not.toHaveClass("h-dvh");

  const dashboardCarousel = screen.getByRole("region", {
    name: "Home activity",
  });
  const dashboardCell = dashboardCarousel.parentElement;
  const dashboardActionGrid = dashboardCell?.parentElement;

  expect(dashboardActionGrid).toHaveClass(
    "grid-rows-[minmax(0,1fr)_auto]",
    "gap-4",
  );
});
```

- [ ] **Step 2: Add the category sizing and scrollbar contract**

```tsx
it("reserves a square four-row viewport with hidden vertical scrollbars", () => {
  const viewport = renderCarousel();

  expect(viewport).toHaveClass("aspect-square", "w-full", "flex-none");
  expect(viewport).not.toHaveClass("flex-1");

  for (const label of ["Expense", "Income", "Transfer"]) {
    const slide = screen.getByLabelText(
      new RegExp(`^${label} categories, slide`),
    );
    expect(slide).toHaveClass(
      "overflow-y-auto",
      "[scrollbar-width:none]",
      "[&::-webkit-scrollbar]:hidden",
    );
  }
});
```

- [ ] **Step 3: Add a real-viewport browser regression**

```ts
test("reserves four category rows and gives remaining height to home activity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const viewport = page.getByTestId("transaction-type-carousel");
  const expenseSlide = page.getByLabel("Expense categories, slide 1 of 3");
  const activity = page.getByRole("region", { name: "Home activity" });

  const categoryBox = await viewport.boundingBox();
  const activityBox = await activity.boundingBox();
  if (!categoryBox || !activityBox) throw new Error("Dashboard layout missing");

  const scrollStyle = await expenseSlide.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      scrollbarWidth: style.scrollbarWidth,
    };
  });

  expect(Math.abs(categoryBox.width - categoryBox.height)).toBeLessThan(1);
  expect(activityBox.height).toBeGreaterThan(250);
  expect(scrollStyle).toEqual({
    overflowY: "auto",
    scrollbarWidth: "none",
  });
});
```

- [ ] **Step 4: Run the focused unit tests and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx
```

Expected: FAIL because the dashboard still uses `grid-rows-[1fr_3fr]`, the category viewport still uses `flex-1`, and vertical slides do not hide their scrollbar.

- [ ] **Step 5: Run the focused browser test and verify RED**

Run:

```bash
npx playwright test e2e/transaction-entry-carousel.spec.ts --project=chromium --grep "reserves four category rows"
```

Expected: FAIL because the category viewport height differs from its width and the activity region remains under 250 px tall.

### Task 2: Implement the CSS-only hotfix

**Files:**
- Modify: `src/components/TransactionFlow/index.tsx:1160-1168,1351-1370`
- Modify: `src/components/TransactionFlow/StepCategory.tsx:220-275`

- [ ] **Step 1: Make the category step intrinsically sized**

Change the category step definition and dashboard branch to:

```tsx
{
  key: "step-type-category",
  label: "Type & category",
  className: "min-h-0",
  content: (
    <StepCategory
      form={form}
      categoryGroups={categoryGroups}
      onConfirm={openCreateAmountStep}
    />
  ),
}
```

```tsx
<div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
  <div className="min-h-0">
    <HomeDashboardCarousel
      currency={currency}
      onEditTransaction={handleEditTransaction}
      onViewAllTransactions={() => setHistoryDrawerOpen(true)}
    />
  </div>
  <div className="min-h-0">
    <StepCard
      animationKey={activeStep.key}
      className={activeStep.className}
    >
      {activeStep.content}
    </StepCard>
  </div>
</div>
```

- [ ] **Step 2: Make the four-row viewport square and hide vertical scrollbar chrome**

Use these classes in `StepCategory`:

```tsx
<section
  aria-roledescription="carousel"
  aria-label="Transaction type and categories"
  className="mx-auto flex w-full max-w-[390px] min-h-0 flex-col select-none"
>
```

```tsx
<div
  ref={viewportRef}
  data-testid="transaction-type-carousel"
  className="mt-3 flex aspect-square w-full min-h-0 flex-none snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-x_pan-y] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
```

```tsx
<section
  aria-label={`${TYPE_META[typeOption].label} categories, slide ${index + 1} of ${TYPE_OPTIONS.length}`}
  className="h-full min-w-full snap-center snap-always overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
```

Retain every existing event handler, ref, ARIA attribute, and `CategoryGrid` prop. Remove only the old `h-full` on the outer section, `flex-1` on the carousel viewport, and `pb-2` on each slide.

- [ ] **Step 2a: Split category tile content into equal halves**

In `CategoryGrid`, use a two-row grid with no outer padding. Make the icon wrapper fill and center within row one; make the wrapping label fill and center within row two with horizontal padding. Retain all pointer, click, hover, focus, and context-menu handlers unchanged.

- [ ] **Step 3: Re-run the focused unit tests and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx
```

Expected: both test files PASS.

- [ ] **Step 4: Re-run the focused browser test and verify GREEN**

Run:

```bash
npx playwright test e2e/transaction-entry-carousel.spec.ts --project=chromium --grep "reserves four category rows"
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit the tested hotfix**

```bash
git add src/components/TransactionFlow/index.tsx src/components/TransactionFlow/StepCategory.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/StepCategory.carousel.test.tsx e2e/transaction-entry-carousel.spec.ts
git commit -m "fix: give activity remaining category space"
```

### Task 3: Verify, capture, and update PR #148

**Files:**
- Modify: `docs/screenshots/transaction-entry-carousel/category-light.png`
- Modify: `docs/screenshots/transaction-entry-carousel/category-graphite-indigo.png`

- [ ] **Step 1: Run complete verification**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test e2e/transaction-entry-carousel.spec.ts e2e/home-carousel.spec.ts --project=chromium
```

Expected: every command exits 0 with no failing tests or type errors.

- [ ] **Step 2: Capture the actual 390×844 app in light and dark modes**

Start the local app at `http://127.0.0.1:5174/app`, use the Playwright skill with a 390×844 viewport, wait for `transaction-type-carousel`, and write:

```text
docs/screenshots/transaction-entry-carousel/category-light.png
docs/screenshots/transaction-entry-carousel/category-graphite-indigo.png
```

Inspect both images and confirm four category rows are visible, the activity area is taller, no scrollbar is visible, and neither theme clips content.

- [ ] **Step 3: Commit the refreshed screenshots**

```bash
git add docs/screenshots/transaction-entry-carousel/category-light.png docs/screenshots/transaction-entry-carousel/category-graphite-indigo.png
git commit -m "docs: refresh four-row category screenshots"
```

- [ ] **Step 4: Push and refresh the existing PR**

```bash
git push origin feature/transaction-entry-carousel
```

Use the GitHub connector to update PR #148's inline screenshot URLs to the new screenshot commit SHA. Confirm every raw image URL returns `200 image/png` and report the PR URL plus the refreshed screenshots.
