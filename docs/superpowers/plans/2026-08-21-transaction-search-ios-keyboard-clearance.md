# Transaction Search iOS Keyboard Clearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Transactions search dock fully visible above the iOS form-navigation/input-assistant bar while the software keyboard is open, without adding an unnecessary gap on Android or desktop browsers.

**Architecture:** Keep the existing Category Step Sheet keyboard snap-point geometry unchanged. Reuse the accessory host's existing `--transaction-history-keyboard-offset` hook to lift only the portalled transaction-search dock by a 48px iOS input-assistant clearance while the sheet is in its keyboard state. Isolate iOS/iPadOS detection in a pure helper so the platform rule is explicit and testable.

**Tech Stack:** React 18, TypeScript, Vaul, Tailwind CSS, Vitest, Testing Library, Playwright.

**Spec:** User-reported screenshot regression (`IMG_9463.png`) after the fixed transaction viewport-shell adjustment.

## Global Constraints

- Do not change the transaction list, category-sheet snap points, or the fixed viewport shell.
- Apply extra clearance only while the Category Step Sheet is in `keyboard` state.
- Support iPhone/iPod user agents and iPadOS desktop-mode detection (`MacIntel` plus touch points).
- Preserve the existing 8px dock-to-sheet gap and the existing `--transaction-history-keyboard-offset` transform contract.
- Do not add visual shadows.

---

### Task 1: Capture the transaction-search overlap regression

**Files:**
- Modify: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`

**Interfaces:**
- Consumes: `CategoryStepSheetAccessoryContextValue.requestKeyboard` and the existing `category-step-accessory-host`.
- Produces: A component-level assertion that iOS keyboard state publishes `--transaction-history-keyboard-offset: -48px`, while non-iOS keyboard state publishes `0px`.

- [ ] **Step 1: Add a keyboard accessory test probe**

Add a small portalled input whose `onFocus` calls `accessory.requestKeyboard`:

```tsx
function KeyboardAccessoryProbe() {
  const accessory = useCategoryStepSheetAccessory();

  return accessory.host
    ? createPortal(
        <input
          aria-label="Keyboard accessory search"
          onFocus={accessory.requestKeyboard}
        />,
        accessory.host,
      )
    : null;
}
```

- [ ] **Step 2: Write the failing iOS clearance test**

```tsx
it("raises a focused transaction search above the iOS input assistant", async () => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  );
  const user = userEvent.setup();

  render(
    <CategoryStepSheet entry={<div>Categories</div>} layoutHeight={844}>
      <KeyboardAccessoryProbe />
    </CategoryStepSheet>,
  );

  const host = screen.getByTestId("category-step-accessory-host");
  expect(host).toHaveStyle({
    "--transaction-history-keyboard-offset": "0px",
  });

  await user.click(
    await screen.findByRole("textbox", { name: "Keyboard accessory search" }),
  );

  expect(host).toHaveAttribute("data-category-sheet-state", "keyboard");
  expect(host).toHaveStyle({
    "--transaction-history-keyboard-offset": "-48px",
  });
});
```

- [ ] **Step 3: Write the non-iOS guard test**

Render the same probe with an Android user agent, focus it, and assert that the custom property remains `0px`.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/CategoryStepSheet.test.tsx -t "input assistant|outside iOS"
```

Expected: the iOS assertion fails because the accessory host does not currently publish the clearance variable.

- [ ] **Step 5: Commit the regression tests**

```bash
git add src/components/TransactionFlow/CategoryStepSheet.test.tsx
git commit -m "test: cover iOS transaction search clearance"
```

### Task 2: Apply iOS-only input-assistant clearance

**Files:**
- Create: `src/components/TransactionFlow/keyboardAccessoryClearance.ts`
- Create: `src/components/TransactionFlow/keyboardAccessoryClearance.test.ts`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`

**Interfaces:**
- Produces: `IOS_INPUT_ASSISTANT_CLEARANCE_PX = 48` and `keyboardAccessoryOffset(active: boolean, navigatorLike?: NavigatorPlatformLike): number`.
- Consumes: `keyboardAccessoryOffset` in `CategoryStepSheet` to set `--transaction-history-keyboard-offset` on the accessory host.

- [ ] **Step 1: Add pure platform-rule tests**

Cover an iPhone user agent, iPadOS desktop mode (`platform: "MacIntel", maxTouchPoints: 5`), Android, desktop macOS, and inactive keyboard state. Expected offsets are `-48` only for active iOS/iPadOS cases and `0` otherwise.

- [ ] **Step 2: Implement the minimal pure helper**

```ts
export const IOS_INPUT_ASSISTANT_CLEARANCE_PX = 48;

export type NavigatorPlatformLike = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

function isIosLike(target: NavigatorPlatformLike): boolean {
  return (
    /iPad|iPhone|iPod/.test(target.userAgent) ||
    (target.platform === "MacIntel" && target.maxTouchPoints > 1)
  );
}

export function keyboardAccessoryOffset(
  active: boolean,
  target: NavigatorPlatformLike = navigator,
): number {
  return active && isIosLike(target)
    ? -IOS_INPUT_ASSISTANT_CLEARANCE_PX
    : 0;
}
```

- [ ] **Step 3: Wire the existing accessory transform hook**

In `CategoryStepSheet.tsx`, calculate the offset from `keyboardState` and publish it on `category-step-accessory-host`:

```tsx
const accessoryKeyboardOffset = keyboardAccessoryOffset(keyboardState);

style={
  {
    "--transaction-history-keyboard-offset": `${accessoryKeyboardOffset}px`,
    transform: `translateY(calc(-100% - ${TRANSACTION_HISTORY_DOCK_GAP}px + var(--transaction-history-keyboard-offset)))`,
  } as React.CSSProperties
}
```

This moves only the portalled dock; sheet snap points and transaction-list occlusion remain unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npx vitest run src/components/TransactionFlow/keyboardAccessoryClearance.test.ts src/components/TransactionFlow/CategoryStepSheet.test.tsx
```

Expected: all focused tests pass with no warnings.

- [ ] **Step 5: Run static verification**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/components/TransactionFlow/keyboardAccessoryClearance.ts src/components/TransactionFlow/keyboardAccessoryClearance.test.ts src/components/TransactionFlow/CategoryStepSheet.tsx
git commit -m "fix: clear iOS keyboard toolbar from transaction search"
```

### Task 3: Review and publish the pull request

**Files:**
- Inspect: all files changed from `main`.

**Interfaces:**
- Consumes: the completed test and implementation commits.
- Produces: a ready-for-review pull request targeting `main`.

- [ ] **Step 1: Inspect the branch diff**

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git diff main...HEAD -- src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/keyboardAccessoryClearance.ts src/components/TransactionFlow/keyboardAccessoryClearance.test.ts
```

Confirm that only the search accessory moves and no sheet/list geometry changes.

- [ ] **Step 2: Re-run the focused tests, typecheck, and lint**

Run the commands from Task 2 again using the final branch state.

- [ ] **Step 3: Create the pull request**

Title: `Fix transaction search overlap with iOS keyboard toolbar`

Body must summarize the root cause, iOS-only 48px clearance, unchanged sheet geometry, and verification commands.

- [ ] **Step 4: Mark the pull request ready for review**

Confirm the final head SHA, changed filenames, and PR status before reporting completion.
