# iOS Quick-Note Touch Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an activated quick-note ring alive through an iPhone PWA drag outside its category tile and release the exact selected quick note without breaking taps or carousel scrolling.

**Architecture:** `CategoryGrid` will give native Touch Events exclusive ownership of touch gestures from `touchstart` through `touchend`/`touchcancel`, keyed by `Touch.identifier` and followed with temporary document listeners. Mouse and stylus retain the pointer-capture path. Unit tests will deterministically inject the iOS-style pointer cancellation, and the browser regression will drag to a rendered radial target rather than a guessed offset.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright/CDP, Framer Motion

---

## Scope and baseline

This plan implements only PR 1 from `docs/superpowers/specs/2026-08-17-ios-quicknote-touch-lifecycle-design.md` on branch `fix/ios-quicknote-touch-lifecycle`.

Modify only:

- `src/components/CategoryGrid.tsx` — split native-touch ownership from mouse/stylus pointer ownership.
- `src/components/CategoryGrid.test.tsx` — cover touch identity, outside-tile movement, cancellation, click suppression, pointer capture, and cleanup.
- `e2e/transaction-entry-carousel.spec.ts` — reproduce iOS pointer cancellation and prove the seeded radial note is applied.

Do not modify `StepCategory`, `RadialMenu`, carousel timing, styles, or haptic behavior. The existing `triggerHaptic()` call remains unchanged.

Clean baseline recorded before implementation: 75 Vitest files and 1,033 tests passed.

### Task 1: Add deterministic failing gesture regressions

**Files:**

- Modify: `src/components/CategoryGrid.test.tsx:1-184`
- Modify: `e2e/transaction-entry-carousel.spec.ts:38-69,231-268`

- [ ] **Step 1: Add a native Touch Event test helper**

Add this helper below `renderGrid()` in `src/components/CategoryGrid.test.tsx`:

```tsx
function touch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as Touch;
}

function dispatchTouch(
  target: HTMLElement | Document,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Touch[],
  changedTouches: Touch[],
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    touches: { configurable: true, value: touches },
    changedTouches: { configurable: true, value: changedTouches },
  });
  fireEvent(target, event);
  return event;
}
```

- [ ] **Step 2: Replace the pointer-driven touch-lock test with native ownership regressions**

Replace `locks native scrolling only after long press activation and reports cancellation` and add the following tests. Keep the existing rendering, contrast, ordinary-tap, pointer-capture, movement-tolerance, and unmount tests.

```tsx
it("keeps native touch ownership outside the tile and ignores touch-derived pointer cancellation", async () => {
  vi.useFakeTimers();
  const onLongPress = vi.fn();
  const onDrag = vi.fn();
  const onRelease = vi.fn();
  const onCancel = vi.fn();
  const onSelect = vi.fn();
  renderGrid({ onLongPress, onDrag, onRelease, onCancel, onSelect });

  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const setPointerCapture = vi.fn();
  Object.defineProperties(tile, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: setPointerCapture },
  });
  const start = touch(41, 24, 28);

  dispatchTouch(tile, "touchstart", [start], [start]);
  fireEvent.pointerDown(tile, {
    pointerId: 41,
    pointerType: "touch",
    clientX: 24,
    clientY: 28,
  });
  await act(async () => vi.advanceTimersByTimeAsync(400));

  expect(onLongPress).toHaveBeenCalledWith("Food Delivery", {
    x: 24,
    y: 28,
  });
  expect(setPointerCapture).not.toHaveBeenCalled();

  fireEvent.pointerLeave(tile, {
    pointerId: 41,
    pointerType: "touch",
    clientX: 80,
    clientY: -72,
  });
  fireEvent.pointerCancel(tile, {
    pointerId: 41,
    pointerType: "touch",
  });

  const moved = touch(41, 80, -72);
  const moveEvent = dispatchTouch(document, "touchmove", [moved], [moved]);

  expect(moveEvent.defaultPrevented).toBe(true);
  expect(onDrag).toHaveBeenLastCalledWith({ x: 80, y: -72 });
  expect(onCancel).not.toHaveBeenCalled();

  dispatchTouch(document, "touchend", [], [moved]);

  expect(onRelease).toHaveBeenCalledWith({ x: 80, y: -72 });
  fireEvent.click(tile);
  expect(onSelect).not.toHaveBeenCalled();
});

it("leaves native scrolling available before touch activation", async () => {
  vi.useFakeTimers();
  const onLongPress = vi.fn();
  renderGrid({ onLongPress });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const start = touch(42, 20, 20);

  dispatchTouch(tile, "touchstart", [start], [start]);
  fireEvent.pointerDown(tile, {
    pointerId: 42,
    pointerType: "touch",
    clientX: 20,
    clientY: 20,
  });
  const moved = touch(42, 36, 20);
  const moveEvent = dispatchTouch(document, "touchmove", [moved], [moved]);

  expect(moveEvent.defaultPrevented).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(onLongPress).not.toHaveBeenCalled();
});

it("cancels an active native touch for matching touchcancel and suppresses its click", async () => {
  vi.useFakeTimers();
  const onCancel = vi.fn();
  const onSelect = vi.fn();
  renderGrid({ onCancel, onSelect });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const start = touch(43, 24, 28);

  dispatchTouch(tile, "touchstart", [start], [start]);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  dispatchTouch(document, "touchcancel", [], [start]);

  expect(onCancel).toHaveBeenCalledOnce();
  fireEvent.click(tile);
  expect(onSelect).not.toHaveBeenCalled();
});

it("cancels an active native touch when a second touch begins anywhere", async () => {
  vi.useFakeTimers();
  const onCancel = vi.fn();
  const onDrag = vi.fn();
  renderGrid({ onCancel, onDrag });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const first = touch(44, 24, 28);
  const second = touch(45, 240, 400);

  dispatchTouch(tile, "touchstart", [first], [first]);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  dispatchTouch(document, "touchstart", [first, second], [second]);
  dispatchTouch(document, "touchmove", [first], [first]);

  expect(onCancel).toHaveBeenCalledOnce();
  expect(onDrag).not.toHaveBeenCalled();
});

it("cancels a pending native touch when a second touch begins anywhere", async () => {
  vi.useFakeTimers();
  const onLongPress = vi.fn();
  const onCancel = vi.fn();
  renderGrid({ onLongPress, onCancel });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const first = touch(48, 24, 28);
  const second = touch(49, 240, 400);

  dispatchTouch(tile, "touchstart", [first], [first]);
  dispatchTouch(document, "touchstart", [first, second], [second]);
  await act(async () => vi.advanceTimersByTimeAsync(400));

  expect(onLongPress).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

it("does not release when touchend omits the initiating identifier", async () => {
  vi.useFakeTimers();
  const onRelease = vi.fn();
  const onCancel = vi.fn();
  renderGrid({ onRelease, onCancel });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const start = touch(46, 24, 28);

  dispatchTouch(tile, "touchstart", [start], [start]);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  dispatchTouch(document, "touchend", [], [touch(99, 80, 80)]);

  expect(onRelease).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledOnce();
});

it.each(["mouse", "pen"] as const)(
  "keeps an active %s pointer captured across leave and cancels it on pointercancel",
  async (pointerType) => {
  vi.useFakeTimers();
  const onDrag = vi.fn();
  const onCancel = vi.fn();
  const onSelect = vi.fn();
  renderGrid({ onDrag, onCancel, onSelect });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  let captured = false;
  const setPointerCapture = vi.fn(() => {
    captured = true;
  });
  const releasePointerCapture = vi.fn(() => {
    captured = false;
  });
  Object.defineProperties(tile, {
    hasPointerCapture: { configurable: true, value: () => captured },
    setPointerCapture: { configurable: true, value: setPointerCapture },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
  });

  fireEvent.pointerDown(tile, {
    pointerId: 47,
    pointerType,
    clientX: 24,
    clientY: 28,
  });
  await act(async () => vi.advanceTimersByTimeAsync(400));
  fireEvent.pointerLeave(tile, {
    pointerId: 47,
    pointerType,
  });
  fireEvent.pointerMove(tile, {
    pointerId: 47,
    pointerType,
    clientX: 64,
    clientY: 12,
  });

  expect(onDrag).toHaveBeenCalledWith({ x: 64, y: 12 });
  expect(onCancel).not.toHaveBeenCalled();

  fireEvent.pointerCancel(tile, {
    pointerId: 47,
    pointerType,
  });

  expect(releasePointerCapture).toHaveBeenCalledWith(47);
  expect(onCancel).toHaveBeenCalledOnce();
  fireEvent.click(tile);
  expect(onSelect).not.toHaveBeenCalled();
  },
);

it("removes native document listeners when a pending tile unmounts", async () => {
  vi.useFakeTimers();
  const onLongPress = vi.fn();
  const onDrag = vi.fn();
  const onRelease = vi.fn();
  const { unmount } = renderGrid({ onLongPress, onDrag, onRelease });
  const tile = screen.getByRole("button", { name: "Food Delivery" });
  const start = touch(50, 24, 28);

  dispatchTouch(tile, "touchstart", [start], [start]);
  unmount();
  dispatchTouch(document, "touchmove", [touch(50, 80, -72)], []);
  dispatchTouch(document, "touchend", [], [touch(50, 80, -72)]);
  await act(async () => vi.advanceTimersByTimeAsync(400));

  expect(onLongPress).not.toHaveBeenCalled();
  expect(onDrag).not.toHaveBeenCalled();
  expect(onRelease).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Make the browser regression target an actual radial segment and inject iOS-style cancellation**

Change the seeded quick note in `seedQuickNote()` to:

```ts
{
  id: "ios-snap-target",
  icon: "Coffee",
  label: "iOS Snap 73",
  note: "iOS snap target selected",
  amount: "73.21",
}
```

Replace `keeps the long-press quick-note gesture` with:

```ts
test("keeps a native quick-note drag alive outside the tile and applies the selected note", async ({
  page,
}) => {
  await seedQuickNote(page);
  await page.reload();
  const viewport = page.getByTestId("transaction-type-carousel");
  const tile = page.getByRole("button", { name: "Food Delivery" });
  const box = await tile.boundingBox();
  if (!box) throw new Error("Food Delivery tile missing");
  const client = await page.context().newCDPSession(page);
  const touchPoint = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint],
  });
  await page.waitForTimeout(450);

  const label = page.getByText("iOS Snap 73", { exact: true });
  await expect(label).toBeVisible();
  const targetBox = await label.locator("xpath=..").locator("circle").boundingBox();
  if (!targetBox) throw new Error("Quick-note radial target missing");
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const scrollLeftBeforeDrag = await viewport.evaluate(
    (element) => element.scrollLeft,
  );

  await tile.dispatchEvent("pointercancel", {
    pointerId: 41,
    pointerType: "touch",
    isPrimary: true,
  });
  await expect(label).toBeVisible();

  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [targetPoint],
  });
  await page.waitForTimeout(50);

  await expect(label).toBeVisible();
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(
    scrollLeftBeforeDrag,
  );

  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();

  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Transaction note")).toHaveValue(
    "iOS snap target selected",
  );
});
```

- [ ] **Step 4: Run the regressions and confirm the old implementation fails**

Run:

```bash
npm test -- src/components/CategoryGrid.test.tsx
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts \
  --project="Mobile Chrome" \
  --grep "keeps a native quick-note drag alive"
```

Expected before implementation:

- Unit failures show that native `touchstart` is not the gesture owner and touch-derived `pointercancel` calls `onCancel`.
- The browser test loses `iOS Snap 73` immediately after the injected touch `pointercancel`.

### Task 2: Implement explicit native-touch ownership

**Files:**

- Modify: `src/components/CategoryGrid.tsx:1-201`
- Test: `src/components/CategoryGrid.test.tsx`
- Test: `e2e/transaction-entry-carousel.spec.ts`

- [ ] **Step 1: Add gesture types and touch lookup helpers**

Change the React import and add these helpers below the interaction constants:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";

type GesturePosition = { x: number; y: number };
type GestureOwner = "touch" | "pointer" | null;
type GestureOutcome = "release" | "cancel" | "abandon";

function findTouch(touches: TouchList, identifier: number): Touch | undefined {
  return Array.from(touches).find((item) => item.identifier === identifier);
}

function touchPosition(touch: Touch): GesturePosition {
  return { x: touch.clientX, y: touch.clientY };
}
```

- [ ] **Step 2: Replace the gesture refs and handlers inside `CategoryButton`**

Keep icon/color/hover state and JSX styling unchanged. Replace the block from `buttonRef` through `handleClick` with this ownership model:

```tsx
const buttonRef = useRef<HTMLButtonElement>(null);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const clickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const isLongPressRef = useRef(false);
const wasLongPressRef = useRef(false);
const startPosRef = useRef<GesturePosition | null>(null);
const ownerRef = useRef<GestureOwner>(null);
const touchIdentifierRef = useRef<number | null>(null);
const pointerIdRef = useRef<number | null>(null);
const removeTouchListenersRef = useRef<(() => void) | null>(null);
const latestRef = useRef({
  categoryName: category.name,
  onLongPress,
  onDrag,
  onRelease,
  onCancel,
});
latestRef.current = {
  categoryName: category.name,
  onLongPress,
  onDrag,
  onRelease,
  onCancel,
};

const clearTimer = useCallback(() => {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
}, []);

const clearClickResetTimer = useCallback(() => {
  if (clickResetTimerRef.current) clearTimeout(clickResetTimerRef.current);
  clickResetTimerRef.current = null;
}, []);

const removeTouchListeners = useCallback(() => {
  const remove = removeTouchListenersRef.current;
  removeTouchListenersRef.current = null;
  remove?.();
}, []);

const scheduleClickReset = useCallback(() => {
  clearClickResetTimer();
  clickResetTimerRef.current = setTimeout(() => {
    clickResetTimerRef.current = null;
    wasLongPressRef.current = false;
  }, 0);
}, [clearClickResetTimer]);

const finishGesture = useCallback(
  (outcome: GestureOutcome, position?: GesturePosition) => {
    const wasActive = isLongPressRef.current;
    const callbacks = latestRef.current;

    clearTimer();
    removeTouchListeners();
    isLongPressRef.current = false;
    startPosRef.current = null;
    ownerRef.current = null;
    touchIdentifierRef.current = null;
    pointerIdRef.current = null;

    if (!wasActive) return;
    scheduleClickReset();
    if (outcome === "release" && position) callbacks.onRelease?.(position);
    if (outcome === "cancel") callbacks.onCancel?.();
  },
  [clearTimer, removeTouchListeners, scheduleClickReset],
);

const beginLongPress = useCallback(
  (
    owner: Exclude<GestureOwner, null>,
    position: GesturePosition,
    pointer?: { target: HTMLButtonElement; pointerId: number },
  ) => {
    clearTimer();
    clearClickResetTimer();
    wasLongPressRef.current = false;
    isLongPressRef.current = false;
    ownerRef.current = owner;
    startPosRef.current = position;
    pointerIdRef.current = pointer?.pointerId ?? null;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (ownerRef.current !== owner || !startPosRef.current) return;
      const callbacks = latestRef.current;
      if (!callbacks.onLongPress) {
        finishGesture("abandon");
        return;
      }

      isLongPressRef.current = true;
      wasLongPressRef.current = true;
      if (
        owner === "pointer" &&
        pointer &&
        !pointer.target.hasPointerCapture(pointer.pointerId)
      ) {
        pointer.target.setPointerCapture(pointer.pointerId);
      }
      triggerHaptic();
      callbacks.onLongPress(callbacks.categoryName, position);
    }, LONG_PRESS_THRESHOLD);
  },
  [clearClickResetTimer, clearTimer, finishGesture],
);

useEffect(() => {
  const button = buttonRef.current;
  if (!button) return;

  const handleTouchStart = (event: TouchEvent) => {
    if (!latestRef.current.onLongPress) return;
    if (event.touches.length !== 1 || event.changedTouches.length !== 1) {
      if (ownerRef.current === "touch") {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
      }
      return;
    }
    if (ownerRef.current !== null) return;

    const initiatingTouch = event.changedTouches[0];
    touchIdentifierRef.current = initiatingTouch.identifier;

    const handleAdditionalTouchStart = (nextEvent: TouchEvent) => {
      const identifier = touchIdentifierRef.current;
      if (
        ownerRef.current === "touch" &&
        identifier !== null &&
        (nextEvent.touches.length !== 1 ||
          Array.from(nextEvent.changedTouches).some(
            (item) => item.identifier !== identifier,
          ))
      ) {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
      }
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const identifier = touchIdentifierRef.current;
      if (ownerRef.current !== "touch" || identifier === null) return;
      const ownedTouch = findTouch(moveEvent.touches, identifier);
      if (!ownedTouch) {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
        return;
      }
      const position = touchPosition(ownedTouch);
      if (isLongPressRef.current) {
        moveEvent.preventDefault();
        latestRef.current.onDrag?.(position);
        return;
      }
      const start = startPosRef.current;
      if (
        start &&
        Math.hypot(position.x - start.x, position.y - start.y) >
          MOVEMENT_TOLERANCE
      ) {
        finishGesture("abandon");
      }
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      const identifier = touchIdentifierRef.current;
      if (ownerRef.current !== "touch" || identifier === null) return;
      const ownedTouch = findTouch(endEvent.changedTouches, identifier);
      if (!ownedTouch) {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
        return;
      }
      finishGesture("release", touchPosition(ownedTouch));
    };

    const handleTouchCancel = (cancelEvent: TouchEvent) => {
      const identifier = touchIdentifierRef.current;
      if (
        ownerRef.current === "touch" &&
        identifier !== null &&
        findTouch(cancelEvent.changedTouches, identifier)
      ) {
        finishGesture(isLongPressRef.current ? "cancel" : "abandon");
      }
    };

    document.addEventListener("touchstart", handleAdditionalTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });
    removeTouchListenersRef.current = () => {
      document.removeEventListener("touchstart", handleAdditionalTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchCancel);
    };

    beginLongPress("touch", touchPosition(initiatingTouch));
  };

  button.addEventListener("touchstart", handleTouchStart, { passive: true });
  return () => {
    button.removeEventListener("touchstart", handleTouchStart);
    const pointerId = pointerIdRef.current;
    if (
      pointerId !== null &&
      typeof button.hasPointerCapture === "function" &&
      button.hasPointerCapture(pointerId)
    ) {
      button.releasePointerCapture(pointerId);
    }
    clearTimer();
    clearClickResetTimer();
    removeTouchListeners();
    isLongPressRef.current = false;
    wasLongPressRef.current = false;
    startPosRef.current = null;
    ownerRef.current = null;
    touchIdentifierRef.current = null;
    pointerIdRef.current = null;
  };
}, [
  beginLongPress,
  clearClickResetTimer,
  clearTimer,
  finishGesture,
  removeTouchListeners,
]);

const releasePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
};

const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
  if (event.pointerType === "touch" || !latestRef.current.onLongPress) return;
  if (ownerRef.current !== null) return;
  beginLongPress(
    "pointer",
    { x: event.clientX, y: event.clientY },
    { target: event.currentTarget, pointerId: event.pointerId },
  );
};

const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
  if (
    event.pointerType === "touch" ||
    ownerRef.current !== "pointer" ||
    pointerIdRef.current !== event.pointerId
  ) {
    return;
  }
  const position = { x: event.clientX, y: event.clientY };
  if (isLongPressRef.current) {
    latestRef.current.onDrag?.(position);
    return;
  }
  const start = startPosRef.current;
  if (
    start &&
    Math.hypot(position.x - start.x, position.y - start.y) > MOVEMENT_TOLERANCE
  ) {
    finishGesture("abandon");
  }
};

const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
  if (
    event.pointerType === "touch" ||
    ownerRef.current !== "pointer" ||
    pointerIdRef.current !== event.pointerId
  ) {
    return;
  }
  releasePointer(event);
  finishGesture("release", { x: event.clientX, y: event.clientY });
};

const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
  if (
    event.pointerType === "touch" ||
    ownerRef.current !== "pointer" ||
    pointerIdRef.current !== event.pointerId
  ) {
    return;
  }
  releasePointer(event);
  finishGesture(isLongPressRef.current ? "cancel" : "abandon");
};

const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
  setIsHovered(false);
  if (
    event.pointerType === "touch" ||
    ownerRef.current !== "pointer" ||
    pointerIdRef.current !== event.pointerId ||
    isLongPressRef.current
  ) {
    return;
  }
  finishGesture("abandon");
};

const handleClick = () => {
  if (wasLongPressRef.current) {
    wasLongPressRef.current = false;
    clearClickResetTimer();
    return;
  }
  onSelect(category.name);
};
```

- [ ] **Step 3: Route pointer leave through the non-cancelling handler**

Replace the inline `onPointerLeave` callback in the category button with:

```tsx
onPointerLeave={handlePointerLeave}
```

Keep all other JSX, classes, icon placement, and label layout unchanged.

- [ ] **Step 4: Run focused unit and browser tests**

Run:

```bash
npm test -- src/components/CategoryGrid.test.tsx
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts \
  --project="Mobile Chrome" \
  --grep "keeps a native quick-note drag alive"
```

Expected: all focused tests pass. The browser test keeps the ring mounted after the injected touch pointer cancellation, releases on the rendered radial target, and exposes `iOS snap target selected` in the note field.

- [ ] **Step 5: Run related integration tests**

Run:

```bash
npm test -- \
  src/components/CategoryGrid.test.tsx \
  src/components/TransactionFlow/StepCategory.test.tsx \
  src/components/TransactionFlow/StepCategory.carousel.test.tsx
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts \
  --project="Mobile Chrome"
```

Expected: all selected unit and Mobile Chrome carousel tests pass, including ordinary tap, horizontal swipe, vertical scroll, live indicator, and quick-note drag coverage.

- [ ] **Step 6: Commit the scoped fix**

```bash
git add \
  src/components/CategoryGrid.tsx \
  src/components/CategoryGrid.test.tsx \
  e2e/transaction-entry-carousel.spec.ts
git commit -m "fix: own quick-note touch lifecycle"
```

### Task 3: Verify, review, and publish PR 1

**Files:**

- Verify: `src/components/CategoryGrid.tsx`
- Verify: `src/components/CategoryGrid.test.tsx`
- Verify: `e2e/transaction-entry-carousel.spec.ts`
- Preserve untracked: `output/playwright/transaction-flow/`

- [ ] **Step 1: Run the full automated verification suite**

Run each command independently so failures remain attributable:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts
```

Expected:

- Biome reports no errors.
- TypeScript exits successfully without output.
- All Vitest files pass, with at least the 1,033 baseline tests plus the new regressions.
- The production build and browser OAuth boundary check pass.
- Both configured Playwright projects pass the transaction-entry carousel spec.

- [ ] **Step 2: Audit the diff against the approved PR boundary**

Run:

```bash
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- \
  src/components/CategoryGrid.tsx \
  src/components/CategoryGrid.test.tsx \
  e2e/transaction-entry-carousel.spec.ts
```

Expected: the implementation diff is limited to the three scoped files, plus the approved fix specification and this plan. `output/playwright/transaction-flow/` remains untracked and unstaged. No haptic adapter, snap pulse, style, `StepCategory`, or `RadialMenu` changes appear.

- [ ] **Step 3: Request a two-stage code review**

Invoke `superpowers:requesting-code-review`. The reviewer must check spec compliance first, then code quality, with special attention to:

- matching `Touch.identifier` through `changedTouches`;
- never preventing default before activation;
- removing identical document listener references;
- ignoring touch in every React pointer handler;
- active cancellation suppressing only the immediate synthetic click;
- retaining mouse/stylus pointer capture;
- excluding haptic work from PR 1.

Resolve every confirmed issue and rerun the affected focused tests before continuing.

- [ ] **Step 4: Rebase safely and rerun the merge-sensitive checks**

```bash
git fetch origin
git rebase origin/main
npm test -- \
  src/components/CategoryGrid.test.tsx \
  src/components/TransactionFlow/StepCategory.carousel.test.tsx
VITE_DEV_MODE=true npx playwright test e2e/transaction-entry-carousel.spec.ts \
  --project="Mobile Chrome" \
  --grep "keeps a native quick-note drag alive"
```

Expected: the rebase is conflict-free and all focused checks pass. Never force-push over another branch state; this branch is new and receives its first push only after the rebase.

- [ ] **Step 5: Push and open the fix PR**

Invoke the `github:yeet` publishing workflow and create a PR with:

- Base: `main`
- Head: `fix/ios-quicknote-touch-lifecycle`
- Title: `fix: preserve iOS quick-note dragging`
- Summary: native Touch Events own activated touch gestures; mouse/stylus retain pointer capture; deterministic unit and browser regressions cover iOS cancellation.
- Test evidence: exact lint, typecheck, unit, build, and Playwright results.
- Manual checklist: installed iPhone PWA hold → drag outside tile → release exact quick note; normal category swipe still changes type; record iOS version.

Do not include or push `output/playwright/transaction-flow/`.

- [ ] **Step 6: Hand off real-device validation**

Provide the PR URL and the deployed preview URL if CI supplies one. Ask the user to run the five-step installed-iPhone checklist from the specification. Do not claim the iPhone behavior is confirmed until the user reports the device result.

Stop after PR 1 is open and handed off. Do not write or execute the haptics implementation plan until PR 1 is complete, per the requested one-by-one workflow.
