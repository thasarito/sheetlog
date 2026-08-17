# Analytics Period Picker iOS Touch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the analytics period row track an iOS PWA finger one-to-one and retain natural multi-period momentum while committing Analytics only after the final period settles.

**Architecture:** Keep `AnalyticsPeriodPicker`'s imperative transform, shared centering path, controlled value, and settle-before-compute boundary. Replace only its touch-facing Pointer Events controller with a non-passive Touch Events controller modeled on `Picker`, then remove the fixed momentum duration cap while preserving velocity expiry, edge resistance, cancellation, and all non-touch inputs.

**Tech Stack:** React 18, TypeScript, native Touch Events, requestAnimationFrame, Vitest, Testing Library, Playwright, Vite PWA.

---

## File Map

- Modify `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx`: own the iOS Touch Events lifecycle, axis arbitration, one-to-one transform updates, velocity momentum, settling, and existing non-touch navigation.
- Modify `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`: replace touch-shaped Pointer Event coverage with actual Touch Event coverage and add iOS-specific tracking, momentum, multi-touch, and lifecycle regressions.
- Modify `e2e/home-carousel.spec.ts`: record the real touch stream and post-release motion while preserving the outer-carousel and settle-before-chart assertions.
- Keep `src/components/TransactionFlow/HomeDashboardCarousel.tsx`, analytics builders, drawers, charts, and dependencies unchanged.

### Task 1: Specify native Touch Events and axis ownership

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx:1-452`
- Test: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Add deterministic Touch Event helpers**

Add `createEvent` to the Testing Library import and define these helpers below `advanceMotion`:

```tsx
type TestTouch = {
  identifier: number;
  pageX: number;
  pageY: number;
  clientX: number;
  clientY: number;
};

function testTouch(identifier: number, x: number, y: number): TestTouch {
  return { identifier, pageX: x, pageY: y, clientX: x, clientY: y };
}

function startTouch(element: Element, point: TestTouch, extraTouches: TestTouch[] = []) {
  const touches = [point, ...extraTouches];
  fireEvent.touchStart(element, {
    touches,
    targetTouches: touches,
    changedTouches: touches,
  });
}

function moveTouch(element: Element, point: TestTouch, extraTouches: TestTouch[] = []) {
  const touches = [point, ...extraTouches];
  const event = createEvent.touchMove(element, {
    bubbles: true,
    cancelable: true,
    touches,
    targetTouches: touches,
    changedTouches: [point],
  });
  fireEvent(element, event);
  return event;
}

function endTouch(element: Element, point: TestTouch) {
  fireEvent.touchEnd(element, {
    touches: [],
    targetTouches: [],
    changedTouches: [point],
  });
}

function cancelTouch(element: Element, point: TestTouch) {
  fireEvent.touchCancel(element, {
    touches: [],
    targetTouches: [],
    changedTouches: [point],
  });
}

function transformX(element: HTMLElement): number {
  const match = element.style.transform.match(/translate3d\(([-\d.]+)px/);
  if (!match) throw new Error(`Missing horizontal transform: ${element.style.transform}`);
  return Number(match[1]);
}
```

- [ ] **Step 2: Write the failing one-to-one tracking test**

Add this test after the render-contract test. It starts from a middle option so edge resistance is not involved:

```tsx
it('tracks an in-bounds horizontal Touch Event one-to-one without committing', () => {
  useMotionClock();
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
  const { picker, track } = setPickerGeometry();
  const initialX = transformX(track);

  startTouch(picker, testTouch(11, 100, 20));
  advanceMotion(16);
  const move = moveTouch(picker, testTouch(11, 180, 22));
  advanceMotion(17);

  expect(move.defaultPrevented).toBe(true);
  expect(transformX(track) - initialX).toBe(80);
  expect(onChange).not.toHaveBeenCalled();
});
```

Update the render-contract assertion so the picker is expected not to declare `[touch-action:pan-y]`.

- [ ] **Step 3: Write the failing vertical-pass-through test**

```tsx
it('leaves vertical Touch Events available to the drawer scroller', () => {
  useMotionClock();
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
  const { picker, track } = setPickerGeometry();
  const initialTransform = track.style.transform;

  startTouch(picker, testTouch(12, 100, 20));
  const move = moveTouch(picker, testTouch(12, 103, 80));
  endTouch(picker, testTouch(12, 103, 80));
  advanceMotion(400);

  expect(move.defaultPrevented).toBe(false);
  expect(track.style.transform).toBe(initialTransform);
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Convert existing touch-shaped Pointer Event regressions**

Convert the current touch-drag, cancellation, controlled-update-during-drag, stationary-pause, and
non-horizontal-interruption tests to real Touch Events. Use `startTouch` for each old `pointerDown`,
`moveTouch` for each old `pointerMove`, `endTouch` for each old `pointerUp`, and `cancelTouch` for
each old `pointerCancel`, preserving identifiers, coordinates, clock advances, and assertions. In
the mixed vertical/mouse test, convert only the vertical touch sequence and keep the mouse pointer
sequence unchanged.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: FAIL because the current component has no Touch Events motion listener, the transform delta remains `0`, and the horizontal move is not prevented.

- [ ] **Step 6: Commit the failing behavior specification**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
git commit -m "test: specify iOS analytics period touch"
```

### Task 2: Replace touch Pointer Events with an iOS Touch Events controller

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx:20-426`
- Test: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Change the gesture identity and add a TouchList lookup**

Replace `pointerId` with `identifier` in `TouchDrag`, and add this module helper:

```tsx
function findTouch(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index];
    if (touch.identifier === identifier) return touch;
  }
  return null;
}
```

- [ ] **Step 2: Add a single active-touch cancellation path**

Add this callback immediately after `centerIndex`. It retains the gesture until `touchend`, so
click suppression is cleared in the normal lifecycle:

```tsx
const cancelActiveTouch = useCallback(() => {
  const drag = touchDragRef.current;
  if (!drag || drag.cancelled) return;
  drag.cancelled = true;
  if (drag.axis === 'horizontal') suppressClickRef.current = true;
  cancelDragFrame();
  centerIndex(controlledIndexRef.current, false);
}, [cancelDragFrame, centerIndex]);
```

- [ ] **Step 3: Replace pointer start/move/finish with touch handlers**

Remove `handlePointerDown`, `handlePointerMove`, pointer-capture calls, and `finishPointerGesture`. Add the following handlers in their place:

```tsx
const handleTouchStart = useCallback(
  (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.targetTouches.length !== 1) {
      cancelActiveTouch();
      return;
    }
    const touch = event.targetTouches[0];
    cancelMotion();
    clearWheelTimer();
    cancelDragFrame();
    if (clickResetTimerRef.current !== null) {
      window.clearTimeout(clickResetTimerRef.current);
      clickResetTimerRef.current = null;
    }
    suppressClickRef.current = false;
    touchDragRef.current = {
      identifier: touch.identifier,
      startX: touch.pageX,
      startY: touch.pageY,
      startTranslate: translateRef.current,
      lastX: touch.pageX,
      lastTime: performance.now(),
      velocity: 0,
      axis: null,
      cancelled: false,
    };
  },
  [cancelActiveTouch, cancelDragFrame, cancelMotion, clearWheelTimer],
);

const handleTouchMove = useCallback(
  (event: TouchEvent) => {
    const drag = touchDragRef.current;
    if (!drag || drag.cancelled) return;
    if (event.targetTouches.length !== 1) {
      cancelActiveTouch();
      return;
    }
    const touch = findTouch(event.targetTouches, drag.identifier);
    if (!touch) {
      cancelActiveTouch();
      return;
    }
    const deltaX = touch.pageX - drag.startX;
    const deltaY = touch.pageY - drag.startY;
    if (drag.axis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_THRESHOLD_PX) return;
      drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }
    if (drag.axis !== 'horizontal') return;

    if (event.cancelable) event.preventDefault();
    suppressClickRef.current = true;
    const now = performance.now();
    const elapsed = now - drag.lastTime;
    if (elapsed > 0) {
      const instantVelocity = (touch.pageX - drag.lastX) / elapsed;
      drag.velocity = drag.velocity * 0.75 + instantVelocity * 0.25;
      drag.lastX = touch.pageX;
      drag.lastTime = now;
    }
    scheduleDragTranslate(applyEdgeResistance(drag.startTranslate + deltaX));
  },
  [applyEdgeResistance, cancelActiveTouch, scheduleDragTranslate],
);
```

Implement `finishTouchGesture(endX, cancelled)` by preserving the existing release-idle decay, momentum/settle branches, non-horizontal recentering, and click-reset timer. Replace its pointer-coordinate access with the supplied `endX`:

```tsx
const finishTouchGesture = useCallback(
  (endX: number | null, cancelled: boolean) => {
    const drag = touchDragRef.current;
    if (!drag) return;
    touchDragRef.current = null;

    if (cancelled || drag.cancelled) {
      cancelDragFrame();
      centerIndex(controlledIndexRef.current, false);
    } else if (drag.axis === 'horizontal') {
      flushDragTranslate();
      const releaseElapsed = Math.max(0, performance.now() - drag.lastTime);
      const idleDecay = Math.max(0, 1 - releaseElapsed / RELEASE_VELOCITY_IDLE_MS);
      drag.velocity *= idleDecay;
      if (endX !== null && releaseElapsed > 0 && endX !== drag.lastX) {
        const releaseVelocity = (endX - drag.lastX) / releaseElapsed;
        drag.velocity = drag.velocity * 0.75 + releaseVelocity * 0.25;
      }
      if (Math.abs(drag.velocity) > MOMENTUM_MIN_VELOCITY) {
        startMomentum(drag.velocity);
      } else {
        settleNearest();
      }
    } else {
      centerIndex(controlledIndexRef.current, false);
    }

    if (clickResetTimerRef.current !== null) {
      window.clearTimeout(clickResetTimerRef.current);
    }
    clickResetTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  },
  [cancelDragFrame, centerIndex, flushDragTranslate, settleNearest, startMomentum],
);

const handleTouchEnd = useCallback(
  (event: React.TouchEvent<HTMLDivElement>) => {
    const drag = touchDragRef.current;
    if (!drag || findTouch(event.targetTouches, drag.identifier)) return;
    const endedTouch = findTouch(event.changedTouches, drag.identifier);
    finishTouchGesture(endedTouch?.pageX ?? null, false);
  },
  [finishTouchGesture],
);
```

- [ ] **Step 4: Register `touchmove` as non-passive and update JSX**

Add this effect:

```tsx
useEffect(() => {
  const viewport = viewportRef.current;
  if (!viewport) return;
  viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
  return () => viewport.removeEventListener('touchmove', handleTouchMove);
}, [handleTouchMove]);
```

On the viewport, remove all four pointer handlers and `[touch-action:pan-y]`; keep `overflow-hidden`, the edge mask, and `data-home-carousel-swipe-lock`. Add:

```tsx
onTouchStart={handleTouchStart}
onTouchEnd={handleTouchEnd}
onTouchCancel={(event) => {
  const drag = touchDragRef.current;
  const cancelledTouch = drag ? findTouch(event.changedTouches, drag.identifier) : null;
  finishTouchGesture(cancelledTouch?.pageX ?? null, true);
}}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
npx tsc --noEmit
```

Expected: the new Touch Events tracking and vertical tests pass; TypeScript reports no errors.

- [ ] **Step 6: Commit the iOS input-path change**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.tsx
git commit -m "fix: use native touch events for analytics periods"
```

### Task 3: Extend momentum and protect touch lifecycle edge cases

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx:32-260`
- Test: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Add enough periods for an unbounded momentum test**

Define this fixture next to `replacementOptions`:

```tsx
const longOptions: AnalyticsPeriodOption[] = Array.from({ length: 12 }, (_, index) => {
  const offset = index - 11;
  return {
    key: `week-${offset}`,
    offset,
    label: `Week ${index + 1}`,
    accessibleLabel: `Week ${index + 1}`,
    period: {
      start: new Date(2026, 4, 1 + index * 7),
      end: new Date(2026, 4, 7 + index * 7, 23, 59, 59, 999),
    },
  };
});
```

Update `setPickerGeometry` to accept the current option count from the rendered DOM, which it
already obtains via `screen.getAllByRole('option')`; no fixed count is permitted in the helper.

- [ ] **Step 2: Write the failing long-fling test**

```tsx
it('keeps a fast multi-period fling moving beyond the old duration cutoff', () => {
  useMotionClock();
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={longOptions} value={0} onChange={onChange} />);
  const { picker, track } = setPickerGeometry();

  startTouch(picker, testTouch(21, 100, 20));
  advanceMotion(16);
  moveTouch(picker, testTouch(21, 180, 21));
  advanceMotion(17);
  endTouch(picker, testTouch(21, 180, 21));
  const releaseX = transformX(track);

  advanceMotion(800);
  expect(transformX(track)).toBeGreaterThan(releaseX);
  expect(onChange).not.toHaveBeenCalled();

  advanceMotion(2_000);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toBeLessThanOrEqual(-2);
});
```

- [ ] **Step 3: Add multi-touch, click-suppression, and reduced-motion coverage**

Add:

```tsx
it('cancels an active period gesture when a second touch appears', () => {
  useMotionClock();
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
  const { picker, track } = setPickerGeometry();
  const controlledTransform = track.style.transform;

  startTouch(picker, testTouch(31, 100, 20));
  moveTouch(picker, testTouch(31, 150, 21));
  advanceMotion(17);
  moveTouch(picker, testTouch(31, 170, 21), [testTouch(32, 200, 24)]);
  advanceMotion(400);
  endTouch(picker, testTouch(31, 170, 21));
  advanceMotion(400);

  expect(track.style.transform).toBe(controlledTransform);
  expect(onChange).not.toHaveBeenCalled();
});
```

Add explicit click-suppression coverage:

```tsx
it('suppresses the click synthesized by a horizontal touch gesture', () => {
  useMotionClock();
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
  const { picker } = setPickerGeometry();

  startTouch(picker, testTouch(41, 100, 20));
  moveTouch(picker, testTouch(41, 120, 21));
  advanceMotion(217);
  endTouch(picker, testTouch(41, 120, 21));
  fireEvent.click(screen.getByRole('option', { name: 'May 2026' }));
  advanceMotion(500);

  expect(onChange).not.toHaveBeenCalled();
});
```

Add touch-specific reduced-motion coverage using the same `matchMedia` stub as the existing reduced
motion test:

```tsx
it('settles a touch immediately when reduced motion is requested', () => {
  useMotionClock();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  const onChange = vi.fn();
  render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
  const { picker } = setPickerGeometry();

  startTouch(picker, testTouch(42, 180, 20));
  moveTouch(picker, testTouch(42, 80, 21));
  advanceMotion(17);
  endTouch(picker, testTouch(42, 80, 21));

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(0);
});
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: the long-fling test fails because momentum settles at the legacy 520ms cutoff. Any
converted lifecycle failure must identify a missing Touch Events branch rather than a test setup
error.

- [ ] **Step 5: Remove the duration cutoff and clamp release velocity**

Replace the duration constant and the start of `startMomentum` with:

```tsx
const MOMENTUM_MAX_VELOCITY = 2.5;

const startMomentum = useCallback(
  (initialVelocity: number) => {
    if (prefersReducedMotion()) {
      settleNearest();
      return;
    }
    cancelMotion();
    let velocity = Math.max(
      -MOMENTUM_MAX_VELOCITY,
      Math.min(MOMENTUM_MAX_VELOCITY, initialVelocity),
    );
    let lastTime = performance.now();

    const step = (now: number) => {
      const elapsed = Math.max(1, Math.min(32, now - lastTime));
      lastTime = now;
      const { min, max } = getBounds();
      const rawTranslate = translateRef.current + velocity * elapsed;
      const beyondBounds = rawTranslate < min || rawTranslate > max;
      applyTranslate(applyEdgeResistance(rawTranslate));
      velocity *= MOMENTUM_DECAY ** (elapsed / 16);
      if (beyondBounds) velocity *= 0.6;

      if (Math.abs(velocity) < MOMENTUM_MIN_VELOCITY) {
        motionFrameRef.current = null;
        settleNearest();
        return;
      }
      motionFrameRef.current = window.requestAnimationFrame(step);
    };
    motionFrameRef.current = window.requestAnimationFrame(step);
  },
  [applyEdgeResistance, applyTranslate, cancelMotion, getBounds, settleNearest],
);
```

Delete `MOMENTUM_MAX_DURATION_MS` and `startedAt`. Keep `RELEASE_VELOCITY_IDLE_MS = 120`, edge
resistance, and the `0.6` out-of-bounds damping.

- [ ] **Step 6: Run all picker, drawer, and carousel component tests**

Run:

```bash
npm test -- --run \
  src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx \
  src/components/TransactionFlow/AnalyticsDrawer.test.tsx \
  src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: all focused tests pass, including the existing option replacement, filter reset, custom
range, and carousel gesture ownership cases.

- [ ] **Step 7: Commit momentum and lifecycle protection**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.tsx \
  src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
git commit -m "fix: extend analytics period touch momentum"
```

### Task 4: Strengthen the browser interaction trace

**Files:**
- Modify: `e2e/home-carousel.spec.ts:72-109,168-209`
- Test: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Record touch lifecycle boundaries in the motion trace**

Inside `touchSwipeWithMotionTrace`, add native listeners before the frame loop and return their
counts:

```tsx
const touchEvents = { start: 0, move: 0, end: 0, cancel: 0 };
element.addEventListener('touchstart', () => {
  touchEvents.start += 1;
});
element.addEventListener('touchmove', () => {
  touchEvents.move += 1;
});
element.addEventListener('touchend', () => {
  touchEvents.end += 1;
});
element.addEventListener('touchcancel', () => {
  touchEvents.cancel += 1;
});
```

Return `{ transforms, selectedOffsets, touchEvents }` and assert after the picker swipe:

```tsx
expect(motionTrace.touchEvents.start).toBe(1);
expect(motionTrace.touchEvents.move).toBeGreaterThan(3);
expect(motionTrace.touchEvents.end).toBe(1);
expect(motionTrace.touchEvents.cancel).toBe(0);
```

Keep the existing assertions that selection stays unchanged through initial motion, there are more
than three pre-commit transforms, the outer Analytics carousel dot remains selected, and the chart
changes only after the picker commits.

- [ ] **Step 2: Run the mobile browser test repeatedly**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts \
  --project='Mobile Chrome' --retries=0 --repeat-each=3
```

Expected: 3/3 passes with a real synthesized touch stream and no outer-carousel movement.

- [ ] **Step 3: Commit the browser regression**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: trace analytics touch momentum"
```

### Task 5: Verify, preview on iOS PWA, and prepare review

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run all repository verification**

Run:

```bash
npm test -- --reporter=dot
npm run lint
npx tsc --noEmit
npm run build
git diff --check origin/main...HEAD
```

Expected: all tests pass, Biome reports no errors, TypeScript reports no errors, Vite/PWA build
completes, and the diff check is silent. Existing informational dependency or bundle-size warnings
may remain but must not introduce a failing exit code.

- [ ] **Step 2: Start the preview server**

Run in the implementation worktree and keep the returned process session active:

```bash
VITE_DEV_MODE=true npm run dev -- --host 0.0.0.0
```

Expected: Vite listens on `http://127.0.0.1:6157`.

- [ ] **Step 3: Expose only the preview port through Tailscale**

Run:

```bash
tailscale serve --bg --yes --https=6157 http://127.0.0.1:6157
tailscale serve status
```

Expected: Tailscale reports `https://agentic-hetzner.tail58f24f.ts.net:6157` proxying to the local
Vite server without changing the existing `8443` or `10000` handlers.

- [ ] **Step 4: Complete the real iOS PWA acceptance check**

On the Tailscale URL in the installed iOS PWA, verify all four acceptance cases:

1. A middle-history horizontal drag follows the finger one-to-one.
2. A fast release can cross multiple periods and then centers once.
3. A vertical gesture beginning on the picker still scrolls the Analytics sheet.
4. The first and current-period boundaries resist and return without switching the home carousel.

Do not publish or merge until the user confirms the iOS interaction.

- [ ] **Step 5: Request final code review**

Use `superpowers:requesting-code-review` with base `origin/main`, head `HEAD`, this plan, and the
approved design spec. Resolve every Critical or Important issue, rerun the affected focused tests,
then repeat Step 1 before reporting completion.
