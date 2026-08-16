# Silent Reimbursement Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Places attribution and replace the reimbursement balance/text block with one completely silent, accessible icon control.

**Architecture:** Keep all reimbursement query, validation, offline, and sync behavior unchanged. Collapse only `ReimbursementAction` presentation into a state-derived icon button, remove its now-unused display props, and remove the shared Places attribution component from its two consumers. Preserve accessible names so existing flow and E2E selectors continue to exercise the real user path.

**Tech Stack:** React 18, TypeScript, Lucide React, Testing Library, Vitest, Playwright Mobile Chrome, GitHub PR checks.

---

## File map

- Delete `src/components/TransactionFlow/GoogleMapsAttribution.tsx`: the product no longer renders provider attribution.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.tsx`: remove the attribution import and render.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`: assert chips/loading/search have no attribution.
- Modify `src/components/TransactionFlow/PlaceSearchDrawer.tsx`: remove the attribution import and render.
- Modify `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`: preserve result coverage while asserting no attribution.
- Modify `src/components/TransactionFlow/ReimbursementAction.tsx`: derive a silent icon, accessible name, disabled state, and click action from the existing summary/query state.
- Modify `src/components/TransactionFlow/ReimbursementAction.test.tsx`: cover the complete icon-only state matrix and absence of visible metrics/status copy.
- Modify `src/components/TransactionFlow/index.tsx`: stop passing display-only currency and online-verification props.
- Modify `e2e/transaction-flow.spec.ts`: assert attribution is absent while retaining Places and reimbursement flow coverage.
- Refresh `output/playwright/new-flow/places-nearby.png`, `output/playwright/new-flow/reimbursement-action.png`, and `output/playwright/new-flow/reimbursement-form.png` for PR #137.

### Task 1: Remove Places attribution

**Files:**
- Delete: `src/components/TransactionFlow/GoogleMapsAttribution.tsx`
- Modify: `src/components/TransactionFlow/NearbyPlaceChips.tsx`
- Test: `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`
- Modify: `src/components/TransactionFlow/PlaceSearchDrawer.tsx`
- Test: `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`
- Test: `e2e/transaction-flow.spec.ts`

- [ ] **Step 1: Change component tests to require attribution-free Places UI**

In `NearbyPlaceChips.test.tsx`, replace the three positive `Google Maps` assertions with the same
absence assertion in loading, Search-during-loading, and Search-only cases:

```tsx
expect(screen.queryByText("Google Maps", { exact: true })).not.toBeInTheDocument();
```

Rename the Search-only test to `renders Search without attribution when nearby results are empty`.
In `PlaceSearchDrawer.test.tsx`, rename the result test to
`renders place names and addresses without attribution` and use:

```tsx
expect(screen.getByRole("dialog", { name: "Search places" })).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Coffee House.*123 Main Street/i })
).toBeVisible();
expect(screen.getByText("Coffee House")).toBeVisible();
expect(screen.getByText("123 Main Street")).toBeVisible();
expect(screen.queryByText("Google Maps", { exact: true })).not.toBeInTheDocument();
```

In `e2e/transaction-flow.spec.ts`, replace the positive attribution assertion with:

```ts
await expect(page.getByText("Google Maps", { exact: true })).toHaveCount(0);
```

- [ ] **Step 2: Run the focused component tests and verify RED**

Run:

```bash
npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/PlaceSearchDrawer.test.tsx
```

Expected: failures report that `Google Maps` is still present in the chip rail and search drawer.

- [ ] **Step 3: Remove the shared attribution presentation**

Delete both imports:

```tsx
import { GoogleMapsAttribution } from "./GoogleMapsAttribution";
```

Delete `<GoogleMapsAttribution />` from `NearbyPlaceChips.tsx` and
`PlaceSearchDrawer.tsx`, then delete `GoogleMapsAttribution.tsx`. Preserve the chip rail, Search
button, drawer description, results, retry, and selection states unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/PlaceSearchDrawer.test.tsx
```

Expected: both files pass with no warnings. Then run:

```bash
rg -n "GoogleMapsAttribution|>Google Maps<" src e2e/transaction-flow.spec.ts
```

Expected: no matches.

- [ ] **Step 5: Commit the attribution removal**

```bash
git add src/components/TransactionFlow/NearbyPlaceChips.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.test.tsx \
  src/components/TransactionFlow/PlaceSearchDrawer.tsx \
  src/components/TransactionFlow/PlaceSearchDrawer.test.tsx \
  src/components/TransactionFlow/GoogleMapsAttribution.tsx \
  e2e/transaction-flow.spec.ts
git commit -m "style: remove places attribution"
```

### Task 2: Replace the reimbursement summary with a silent icon

**Files:**
- Modify: `src/components/TransactionFlow/ReimbursementAction.tsx`
- Test: `src/components/TransactionFlow/ReimbursementAction.test.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Rewrite the component tests around its accessible state machine**

Keep the existing `summary()` and `renderAction()` helpers, but remove `currency` and
`needsOnlineVerification` from the rendered props. Replace the visible-balance/status assertions
with these cases:

```tsx
it("renders one silent reimbursement icon without balance copy", async () => {
  const user = userEvent.setup();
  const onReimburse = vi.fn();
  renderAction({ onReimburse });

  expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  const action = screen.getByRole("button", { name: "Reimburse" });
  expect(action).toBeEnabled();
  expect(action.querySelector("svg")).toBeInTheDocument();
  await user.click(action);
  expect(onReimburse).toHaveBeenCalledTimes(1);
});

it("uses a disabled loading icon while checking", () => {
  renderAction({ isChecking: true });

  const action = screen.getByRole("button", {
    name: "Checking reimbursements",
  });
  expect(action).toBeDisabled();
  expect(action.querySelector("svg")).toHaveClass("animate-spin");
  expect(screen.queryByText("Checking reimbursements...")).not.toBeInTheDocument();
});

it("uses the silent icon as the retry control after a check failure", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  const onReimburse = vi.fn();
  renderAction({ isError: true, onRetry, onReimburse });

  const action = screen.getByRole("button", {
    name: "Retry reimbursement check",
  });
  expect(action).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(action);
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onReimburse).not.toHaveBeenCalled();
});

it.each<{
  name: string;
  value: ReimbursementSummary;
  isDeleting?: boolean;
  accessibleName: string;
}>([
  {
    name: "fully reimbursed",
    value: summary({ remaining: 0 }),
    accessibleName: "Fully reimbursed",
  },
  {
    name: "currency mismatch",
    value: summary({ currencyMismatchIds: ["child-2"] }),
    accessibleName: "Reimbursement unavailable",
  },
  {
    name: "over-reimbursed",
    value: summary({ remaining: 0, overReimbursed: 10 }),
    accessibleName: "Reimbursement unavailable",
  },
  {
    name: "unknown balance",
    value: summary({ remaining: Number.NaN }),
    accessibleName: "Reimbursement unavailable",
  },
  {
    name: "source deletion",
    value: summary(),
    isDeleting: true,
    accessibleName: "Reimbursement unavailable",
  },
])("disables the icon for $name", ({ value, isDeleting, accessibleName }) => {
  renderAction({ value, isDeleting });

  expect(
    screen.getByRole("button", { name: accessibleName as string })
  ).toBeDisabled();
  expect(screen.queryByText(/confirmed|queued|remaining|mismatch|over-reimbursed/i))
    .not.toBeInTheDocument();
});
```

Keep a positive-balance test with no online-verification prop to prove the best-known balance remains
actionable. Keep click guards by asserting disabled states never call `onReimburse`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test -- src/components/TransactionFlow/ReimbursementAction.test.tsx
```

Expected: failures show the old balance labels/status text and old `Reimburse` accessible name in
loading/error states.

- [ ] **Step 3: Implement the minimal icon-only component**

Replace `ReimbursementAction.tsx` with the same public summary/query inputs minus the two display-only
props:

```tsx
import { HandCoins, Loader2, RotateCcw } from "lucide-react";
import type { ReimbursementSummary } from "../../lib/reimbursements";

export type ReimbursementActionProps = {
  summary: ReimbursementSummary;
  isChecking: boolean;
  isError: boolean;
  isDeleting?: boolean;
  onRetry: () => void;
  onReimburse: () => void;
};

export function ReimbursementAction({
  summary,
  isChecking,
  isError,
  isDeleting = false,
  onRetry,
  onReimburse,
}: ReimbursementActionProps) {
  const hasCurrencyMismatch = summary.currencyMismatchIds.length > 0;
  const isOverReimbursed =
    Number.isFinite(summary.overReimbursed) && summary.overReimbursed > 0;
  const hasKnownRemaining = Number.isFinite(summary.remaining);
  const isFullyReimbursed =
    !isChecking &&
    !isError &&
    hasKnownRemaining &&
    summary.remaining <= 0 &&
    !isOverReimbursed &&
    !hasCurrencyMismatch;
  const canReimburse =
    !isChecking &&
    !isError &&
    !isDeleting &&
    !hasCurrencyMismatch &&
    !isOverReimbursed &&
    hasKnownRemaining &&
    summary.remaining > 0;
  const canRetry = isError && !isChecking && !isDeleting;

  const accessibleName = isDeleting
    ? "Reimbursement unavailable"
    : isChecking
      ? "Checking reimbursements"
      : canRetry
        ? "Retry reimbursement check"
        : isFullyReimbursed
          ? "Fully reimbursed"
          : canReimburse
            ? "Reimburse"
            : "Reimbursement unavailable";

  const Icon = isChecking && !isDeleting ? Loader2 : canRetry ? RotateCcw : HandCoins;

  return (
    <button
      type="button"
      aria-label={accessibleName}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => {
        if (canRetry) {
          onRetry();
        } else if (canReimburse) {
          onReimburse();
        }
      }}
      disabled={!canRetry && !canReimburse}
    >
      <Icon
        className={`h-4 w-4${isChecking ? " animate-spin" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
```

In `TransactionFlow/index.tsx`, remove only these props from the call:

```tsx
currency={flowMode.transaction.currency}
needsOnlineVerification={reimbursementSummary.needsOnlineVerification}
```

- [ ] **Step 4: Run focused and integration tests and verify GREEN**

Run:

```bash
npm run test -- \
  src/components/TransactionFlow/ReimbursementAction.test.tsx \
  src/components/TransactionFlow/StepAmount.test.tsx \
  src/components/TransactionFlow/TransactionFlow.test.tsx
```

Expected: all tests pass; existing `Reimburse` flow selectors still find the available icon by its
accessible name.

- [ ] **Step 5: Commit the silent reimbursement action**

```bash
git add src/components/TransactionFlow/ReimbursementAction.tsx \
  src/components/TransactionFlow/ReimbursementAction.test.tsx \
  src/components/TransactionFlow/index.tsx
git commit -m "style: simplify reimbursement action"
```

### Task 3: Verify the flow, refresh screenshots, and close CI

**Files:**
- Modify: `output/playwright/new-flow/places-nearby.png`
- Modify: `output/playwright/new-flow/reimbursement-action.png`
- Modify: `output/playwright/new-flow/reimbursement-form.png`

- [ ] **Step 1: Run the full local gate**

Run exactly:

```bash
npm run test
npx tsc --noEmit
npm run lint
npm run build
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key \
  npx playwright test --project="Mobile Chrome"
git diff --check
if rg -n "shadow" \
  src/components/TransactionFlow/ReimbursementAction.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.tsx \
  src/components/TransactionFlow/PlaceSearchDrawer.tsx; then exit 1; fi
```

Expected: unit, type, lint, build, and all Mobile Chrome tests exit zero; no changed UI file contains
`shadow`.

- [ ] **Step 2: Launch the deterministic development app for browser capture**

First verify the Playwright CLI prerequisite:

```bash
command -v npx >/dev/null 2>&1
```

Then launch:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key \
  npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Use `/home/ubuntu/.codex/skills/playwright/scripts/playwright_cli.sh` in a second terminal. Open
`http://127.0.0.1:5174/app`, snapshot before each interaction, seed the same mock source expense and
Google Maps stub used by `e2e/transaction-flow.spec.ts`, and navigate by current snapshot refs.

- [ ] **Step 3: Refresh and inspect the three PR screenshots**

Capture at the existing exact paths:

```bash
/home/ubuntu/.codex/skills/playwright/scripts/playwright_cli.sh \
  screenshot --filename output/playwright/new-flow/places-nearby.png
/home/ubuntu/.codex/skills/playwright/scripts/playwright_cli.sh \
  screenshot --filename output/playwright/new-flow/reimbursement-action.png
/home/ubuntu/.codex/skills/playwright/scripts/playwright_cli.sh \
  screenshot --filename output/playwright/new-flow/reimbursement-form.png
```

Inspect each image and verify: no `Google Maps` attribution is visible; the source expense footer
contains Delete, one `HandCoins` icon, and Save; no confirmed/queued/remaining copy is visible; the
opened reimbursement form is unchanged.

- [ ] **Step 4: Commit and push the final screenshots**

```bash
git add output/playwright/new-flow/places-nearby.png \
  output/playwright/new-flow/reimbursement-action.png \
  output/playwright/new-flow/reimbursement-form.png
git commit -m "docs: refresh silent flow screenshots"
git push origin feat/places-reimbursements
```

- [ ] **Step 5: Inspect and close PR checks**

Run:

```bash
gh auth status
python3 /home/ubuntu/.codex/plugins/cache/openai-curated-remote/github/0.1.8-2841cf9749ae/skills/gh-fix-ci/scripts/inspect_pr_checks.py \
  --repo . --pr 137
gh pr checks 137 --watch --interval 10
```

For a GitHub Actions failure, use the reported run ID with `gh run view <run-id> --log`, reproduce
the exact failing command locally, add a failing regression when the defect is behavioral, fix it,
rerun the full gate, and push. For an external Cloudflare check, report its details URL separately;
do not claim green until its final state is successful or the provider exposes an owner-only blocker
that cannot be changed from this workspace.
