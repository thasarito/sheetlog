# Stable Mobile Keyboard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep SheetLog's transaction canvas geometrically unchanged while a native keyboard is visible, and dismiss that keyboard after a successful pointer/touch place selection.

**Architecture:** A focused `useStableTransactionHeight` hook owns the transaction canvas height and ignores same-width mobile viewport contractions while still accepting orientation changes. The viewport meta tag and supported VirtualKeyboard API request overlay behavior as progressive enhancement. `TransactionNoteField` distinguishes pointer/touch selection from keyboard selection so successful taps blur the input while Arrow/Enter retains accessible focus.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, TanStack Query-backed Places hooks, Vitest/Testing Library, Playwright Mobile Chrome.

---

### Task 0: Capture the mobile acceptance RED before production changes

**Files:**
- Modify: `e2e/transaction-flow.spec.ts:440-560`

- [ ] **Step 1: Add the keyboard-sized viewport and blur assertions**

In `renders inline note results over the keypad and preserves selected metadata`, add this helper near the existing Places describe block:

```ts
type RequiredBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>;

function expectSameBox(actual: RequiredBox, expected: RequiredBox) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
}
```

Import `type Locator` from `@playwright/test`. Capture baseline boxes after the note, keypad, and Submit are visible:

```ts
const baselineNote = await note.boundingBox();
const baselineKeypad = await keypad.boundingBox();
const baselineSubmit = await submit.boundingBox();
if (!baselineNote || !baselineKeypad || !baselineSubmit) {
  throw new Error("Expected transaction geometry before keyboard resize");
}
```

After inline results appear and while the note is focused, simulate the keyboard contraction and assert unchanged geometry:

```ts
await page.setViewportSize({ width: 390, height: 544 });
await page.evaluate(
  () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
);

const keyboardNote = await note.boundingBox();
const keyboardKeypad = await keypad.boundingBox();
const keyboardSubmit = await submit.boundingBox();
if (!keyboardNote || !keyboardKeypad || !keyboardSubmit) {
  throw new Error("Expected transaction geometry with keyboard visible");
}
expectSameBox(keyboardNote, baselineNote);
expectSameBox(keyboardKeypad, baselineKeypad);
expectSameBox(keyboardSubmit, baselineSubmit);
```

After clicking `Central Cafe`, add:

```ts
await expect(note).toHaveValue("Central Cafe");
await expect(note).not.toBeFocused();
await expect(page.getByRole("listbox")).toHaveCount(0);

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(
  () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
);
```

Re-read the three rectangles and use `expectSameBox` against the original baseline.

- [ ] **Step 2: Run the isolated scenario and verify RED**

```bash
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test e2e/transaction-flow.spec.ts --project="Mobile Chrome" --retries=0 --grep "renders inline note results"
```

Expected: FAIL because the current `dvh` canvas moves under the 390x544 viewport and the selected note remains focused.

- [ ] **Step 3: Preserve the failing test for the implementation tasks**

Do not commit the failing acceptance test by itself. Leave only `e2e/transaction-flow.spec.ts` modified while Tasks 1-3 implement the independently unit-tested behavior. Task 4 owns its final GREEN run and commit.

### Task 1: Add a stable transaction-height owner

**Files:**
- Create: `src/components/TransactionFlow/useStableTransactionHeight.ts`
- Create: `src/components/TransactionFlow/useStableTransactionHeight.test.tsx`

- [ ] **Step 1: Write the failing stable-height tests**

Create `useStableTransactionHeight.test.tsx` with a controllable viewport and coarse-pointer stub:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestVirtualKeyboardOverlay,
  useStableTransactionHeight,
} from "./useStableTransactionHeight";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

beforeEach(() => {
  setViewport(390, 844);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true }),
  );
});

afterEach(() => {
  setViewport(originalWidth, originalHeight);
  vi.unstubAllGlobals();
});

describe("useStableTransactionHeight", () => {
  it("ignores a same-width mobile keyboard contraction", () => {
    const { result } = renderHook(() => useStableTransactionHeight());
    expect(result.current).toBe(844);

    act(() => {
      setViewport(390, 544);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(844);
  });

  it("accepts a genuine orientation-size change", () => {
    const { result } = renderHook(() => useStableTransactionHeight());

    act(() => {
      setViewport(844, 390);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(390);
  });

  it("keeps normal desktop resizing responsive", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    const { result } = renderHook(() => useStableTransactionHeight());

    act(() => {
      setViewport(390, 600);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(600);
  });

  it("requests keyboard overlay only when the API exists", () => {
    const keyboard = { overlaysContent: false };
    const restore = requestVirtualKeyboardOverlay({ virtualKeyboard: keyboard });
    expect(keyboard.overlaysContent).toBe(true);
    restore();
    expect(keyboard.overlaysContent).toBe(false);
    expect(() => requestVirtualKeyboardOverlay({})()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/useStableTransactionHeight.test.tsx
```

Expected: FAIL because `useStableTransactionHeight.ts` does not exist.

- [ ] **Step 3: Implement the minimal stable-height hook**

Create `useStableTransactionHeight.ts`:

```ts
import { useEffect, useRef, useState } from "react";

type VirtualKeyboardLike = { overlaysContent: boolean };
type NavigatorWithVirtualKeyboard = {
  virtualKeyboard?: VirtualKeyboardLike;
};

export function requestVirtualKeyboardOverlay(
  target: NavigatorWithVirtualKeyboard,
) {
  const keyboard = target.virtualKeyboard;
  if (!keyboard) return () => undefined;
  const previousValue = keyboard.overlaysContent;
  keyboard.overlaysContent = true;
  return () => {
    keyboard.overlaysContent = previousValue;
  };
}

function isCoarsePointer() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function useStableTransactionHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  const widthRef = useRef(window.innerWidth);
  const coarsePointerRef = useRef(isCoarsePointer());

  useEffect(() => {
    const restoreKeyboardOverlay = requestVirtualKeyboardOverlay(
      navigator as Navigator & NavigatorWithVirtualKeyboard,
    );

    const handleResize = () => {
      const widthChanged = window.innerWidth !== widthRef.current;
      if (coarsePointerRef.current && !widthChanged) return;
      widthRef.current = window.innerWidth;
      setHeight(window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      restoreKeyboardOverlay();
    };
  }, []);

  return height;
}
```

The hook intentionally freezes height-only resizes on coarse-pointer devices, where they represent native-keyboard and mobile-toolbar behavior, but keeps ordinary desktop resizing responsive. A width change establishes a new mobile orientation baseline.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npx vitest run src/components/TransactionFlow/useStableTransactionHeight.test.tsx
npx tsc --noEmit
```

Expected: 4 focused tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit the hook**

```bash
git add src/components/TransactionFlow/useStableTransactionHeight.ts src/components/TransactionFlow/useStableTransactionHeight.test.tsx
git commit -m "feat: stabilize mobile transaction height"
```

### Task 2: Integrate the stable canvas and standards overlay preference

**Files:**
- Modify: `index.html:5-8,238-241`
- Modify: `src/components/TransactionFlow/index.tsx:1360-1370`
- Modify: `src/components/TransactionFlow/TransactionFlow.test.tsx`

- [ ] **Step 1: Write the failing TransactionFlow layout assertion**

In the existing full-flow render test, add a stable test ID and assert that the transaction canvas uses an explicit pixel height rather than its own `dvh` class:

```tsx
const transactionCanvas = screen.getByTestId("transaction-canvas");
expect(transactionCanvas).toHaveStyle({ height: `${window.innerHeight}px` });
expect(transactionCanvas).not.toHaveClass("h-dvh");
```

At the top of `useStableTransactionHeight.test.tsx`, import the Vite raw HTML fixture and assert the viewport string contains the overlay preference:

```ts
import indexHtml from "../../../index.html?raw";

it("requests overlay keyboard behavior in the viewport contract", () => {
expect(indexHtml).toContain("interactive-widget=overlays-content");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/useStableTransactionHeight.test.tsx
```

Expected: FAIL because the main canvas still owns `h-dvh`, has no test ID/inline height, and the viewport meta tag lacks the overlay preference.

- [ ] **Step 3: Integrate one height owner**

In `TransactionFlow/index.tsx`, import and use the hook:

```tsx
import { useStableTransactionHeight } from "./useStableTransactionHeight";

const stableTransactionHeight = useStableTransactionHeight();

<main
  data-testid="transaction-canvas"
  style={{ height: `${stableTransactionHeight}px` }}
  className="h-full from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6"
>
```

In `index.html`, append the standards preference to the existing viewport meta content without changing zoom or safe-area settings:

```html
content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content"
```

Leave the root body clipping behavior intact: the stable transaction canvas may extend behind the native keyboard, which is the approved overlay behavior.

- [ ] **Step 4: Run focused tests, typecheck, and lint**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/useStableTransactionHeight.test.tsx
npx tsc --noEmit
npx biome check index.html src/components/TransactionFlow/index.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/useStableTransactionHeight.ts src/components/TransactionFlow/useStableTransactionHeight.test.tsx
```

Expected: focused tests PASS; typecheck and Biome exit 0.

- [ ] **Step 5: Commit the canvas integration**

```bash
git add index.html src/components/TransactionFlow/index.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/useStableTransactionHeight.test.tsx
git commit -m "fix: keep transaction canvas stable above keyboards"
```

### Task 3: Dismiss the native keyboard after successful pointer selection

**Files:**
- Modify: `src/components/TransactionFlow/TransactionNoteField.tsx:80-160,250-280`
- Modify: `src/components/TransactionFlow/TransactionNoteField.test.tsx`

- [ ] **Step 1: Rewrite focus tests for pointer, failure, keyboard, and nearby behavior**

Add or update component tests so the contracts are explicit:

```tsx
it("blurs after a successful pointer result selection", async () => {
  const user = userEvent.setup();
  const onPlaceSelect = vi.fn();
  renderField({ activeResults: [centralCafe], onPlaceSelect });
  const input = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(input, "central");
  expect(input).toHaveFocus();

  await user.click(screen.getByRole("option", { name: /Central Cafe/ }));

  expect(onPlaceSelect).toHaveBeenCalledWith({
    displayName: "Central Cafe",
    placeId: "central-cafe",
  });
  await waitFor(() => expect(input).not.toHaveFocus());
});

it("keeps focus when pointer selection fails so it can be retried", async () => {
  const user = userEvent.setup();
  renderField({ activeResults: [centralCafe] });
  hookState.selectSuggestion.mockRejectedValueOnce(new Error("provider failed"));
  const input = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(input, "central");
  await user.click(screen.getByRole("option", { name: /Central Cafe/ }));
  await waitFor(() => expect(hookState.selectSuggestion).toHaveBeenCalled());
  expect(input).toHaveFocus();
});

it("keeps logical focus after Arrow and Enter selection", async () => {
  const user = userEvent.setup();
  renderField({ activeResults: [centralCafe] });
  const input = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(input, "central{ArrowDown}{Enter}");
  await waitFor(() => expect(input).toHaveFocus());
});
```

Update the nearby-choice test to focus the empty note before clicking a chip, then assert `input` is not focused after success. Keep the existing Clear test's `input` focus assertion unchanged.

- [ ] **Step 2: Run the focused component test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionNoteField.test.tsx
```

Expected: pointer and nearby success assertions FAIL because successful selections currently call `focusInput()`.

- [ ] **Step 3: Implement source-aware successful selection focus**

In `TransactionNoteField.tsx`, add a blur helper and replace `selectOption` with the complete source-aware implementation:

```tsx
const blurInput = useCallback(() => {
  localInputRef.current?.blur();
}, []);

const selectOption = async (
  suggestion: PlaceSuggestion,
  dismissKeyboard = false,
) => {
  const generation = generationRef.current;
  const selectionSessionId = sessionId;
  const selectionValue = value;
  try {
    const selection = await autocomplete.selectSuggestion(suggestion);
    if (
      !mountedRef.current ||
      generationRef.current !== generation ||
      sessionIdRef.current !== selectionSessionId ||
      valueRef.current !== selectionValue ||
      !placesEnabledRef.current
    ) {
      return;
    }
    onPlaceSelect(selection);
    retireLifecycle(true);
    if (dismissKeyboard) blurInput();
    else focusInput();
  } catch {
    // The generic selection error remains available in the open popup.
  }
};
```

Use the flag only for pointer/touch result clicks:

```tsx
onClick={() => void selectOption(suggestion, true)}
```

Keep the Arrow/Enter call as `selectOption(selectedOption)`. Replace `handleNearbySelect` with:

```tsx
const handleNearbySelect = (suggestion: PlaceSuggestion) => {
  onPlaceSelect({
    displayName: suggestion.name,
    placeId: suggestion.placeId,
  });
  retireLifecycle(true);
  blurInput();
};
```

Keep `handleClear()` calling `focusInput()`.

Do not blur before asynchronous resolution: the existing `onBlur` retirement would invalidate the pending selection. Do not blur in the catch path, so retry remains immediately usable.

- [ ] **Step 4: Run component and integrated Places tests**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionNoteField.test.tsx src/components/TransactionFlow/index.places.test.tsx src/components/TransactionFlow/StepAmount.test.tsx
npx tsc --noEmit
```

Expected: all focused tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit the focus behavior**

```bash
git add src/components/TransactionFlow/TransactionNoteField.tsx src/components/TransactionFlow/TransactionNoteField.test.tsx
git commit -m "fix: dismiss keyboard after place selection"
```

### Task 4: Lock the mobile geometry and blur behavior in Playwright

**Files:**
- Modify: `e2e/transaction-flow.spec.ts:440-560`
- Modify: `output/playwright/new-flow/note-place-combobox-results.png` only if the deterministic screenshot bytes change

- [ ] **Step 1: Review the preserved acceptance regression**

Confirm the uncommitted `e2e/transaction-flow.spec.ts` diff from Task 0 still contains all four contracts: complete note/keypad/Submit rectangle equality during 390x844 to 390x544 contraction, pointer-result blur, popup closure, and geometry equality after restoring 390x844.

- [ ] **Step 2: Run the isolated scenario and full Mobile Chrome project GREEN**

Run:

```bash
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test e2e/transaction-flow.spec.ts --project="Mobile Chrome" --retries=0 --grep "renders inline note results"
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test --project="Mobile Chrome" --retries=0
```

Expected: isolated scenario PASS; full Mobile Chrome project PASS with zero retries.

- [ ] **Step 3: Refresh and inspect the tracked screenshot if needed**

Compare the generated attachment with the tracked artifact:

```bash
sha256sum \
  test-results/transaction-flow-Transacti-caf38-preserves-selected-metadata-Mobile-Chrome/note-place-combobox-results.png \
  output/playwright/new-flow/note-place-combobox-results.png
```

If hashes differ, copy the generated PNG over the tracked file, inspect it at original resolution, and confirm the flat note input/results overlay remains unchanged.

- [ ] **Step 4: Commit E2E coverage and any refreshed screenshot**

```bash
git add e2e/transaction-flow.spec.ts
git add output/playwright/new-flow/note-place-combobox-results.png
git commit -m "test: cover native keyboard place behavior"
```

If the screenshot is byte-identical, omit it from `git add`.

### Task 5: Final verification, review, and PR update

**Files:**
- Review: `origin/main...HEAD`
- Update: draft PR #143 after all commits are final

- [ ] **Step 1: Run the complete repository gate**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test --project="Mobile Chrome" --retries=0
git diff --check origin/main...HEAD
```

Expected: all commands exit 0. Existing informational Biome schema, bundle-size, and Browserslist notices are acceptable; test failures are not.

- [ ] **Step 2: Enforce the no-shadow rule and clean tree**

```bash
mapfile -d '' changed_tsx < <(
  git diff --diff-filter=ACMR --name-only -z origin/main...HEAD -- '*.tsx'
)
if [ "${#changed_tsx[@]}" -gt 0 ]; then
  if rg -n "shadow" -- "${changed_tsx[@]}"; then
    exit 1
  fi
fi
git status --short
```

Expected: `rg` finds no changed-TSX `shadow`; worktree is clean.

- [ ] **Step 3: Request independent review**

Ask a read-only reviewer to inspect the exact diff for:

- keyboard-sized height contraction without transaction reflow;
- orientation/desktop resize behavior;
- pointer success blur versus keyboard focus preservation;
- failed selection and Clear focus behavior;
- stale-selection/session protections;
- Mobile E2E realism and zero retries.

Resolve every Critical or Important finding test-first, rerun the affected gates, and obtain a Ready verdict.

- [ ] **Step 4: Push and update draft PR #143**

```bash
git push origin feat/note-place-combobox
gh pr checks 143 --repo thasarito/sheetlog --watch
```

Expected: remote head equals local HEAD and every PR check passes. Keep the PR draft; do not merge.

- [ ] **Step 5: Run the manual device release gate**

On installed iOS and Android PWAs:

1. Open a new expense and enter an amount.
2. Focus Note and type at least two characters.
3. Confirm the transaction canvas does not move when the native keyboard opens.
4. Tap a place result and confirm the keyboard closes only after the place resolves.
5. Force a selection failure and confirm the keyboard/input remain ready to retry.

This manual gate must be reported separately because browser automation cannot display the actual OS keyboard.
