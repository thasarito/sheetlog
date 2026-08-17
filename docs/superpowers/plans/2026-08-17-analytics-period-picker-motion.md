# Analytics Period Picker Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Analytics period strip move smoothly under touch and navigation controls, commit one period only after motion settles, and avoid duplicate Analytics aggregation while the detail drawer is closed.

**Architecture:** Replace the picker viewport's manual `scrollLeft` plus mandatory snap combination with an overflow-hidden track moved by imperative `translate3d` updates. A focused motion controller owns axis locking, velocity, momentum, centering, cancellation, wheel settling, and reduced-motion behavior while the controlled `periodOffset` remains unchanged until the final centered destination is locked. Gate detailed drawer derivation on `open`, retaining only the last rendered values needed for the drawer's close animation.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright, date-fns.

---

## File Structure

- Modify `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx` to own horizontal transform motion and settled commits.
- Modify `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx` to specify touch, momentum, navigation, cancellation, wheel, and reduced-motion behavior.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.tsx` to skip expensive derivation while closed.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.test.tsx` to prove closed drawers do not aggregate.
- Modify `e2e/home-carousel.spec.ts` to assert continuous picker movement and delayed arrow commits in Mobile Chrome.

### Task 1: Specify settled horizontal motion

**Files:**
- Test: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Replace scroll-snap expectations with transform-motion expectations**

Create a geometry helper that gives the viewport a 256px width and each option a fixed 128px
position. Add a `data-testid="analytics-period-track"` expectation and require the viewport to use
`overflow-hidden`, `touch-action: pan-y`, and no `snap-mandatory` class.

```tsx
function setPickerGeometry() {
  const picker = screen.getByTestId('analytics-period-picker');
  Object.defineProperty(picker, 'clientWidth', { configurable: true, value: 256 });
  screen.getAllByRole('option').forEach((option, index) => {
    Object.defineProperties(option, {
      offsetLeft: { configurable: true, value: index * 128 },
      offsetWidth: { configurable: true, value: 128 },
    });
  });
  fireEvent(window, new Event('resize'));
  return {
    picker,
    track: screen.getByTestId('analytics-period-track'),
  };
}
```

- [ ] **Step 2: Add failing touch tests**

Specify that several horizontal touch moves change the track transform without calling `onChange`,
then release and advance animation frames until exactly the nearest final offset is emitted. Add
separate cases proving vertical gestures and mouse drags are inert, and pointer cancellation returns
to the controlled option without emission.

```tsx
fireEvent.pointerDown(picker, {
  pointerId: 2,
  pointerType: 'touch',
  clientX: 100,
  clientY: 20,
});
fireEvent.pointerMove(picker, {
  pointerId: 2,
  pointerType: 'touch',
  clientX: 180,
  clientY: 21,
});
vi.advanceTimersByTime(17);
expect(track.style.transform).not.toBe(initialTransform);
expect(onChange).not.toHaveBeenCalled();
fireEvent.pointerUp(picker, {
  pointerId: 2,
  pointerType: 'touch',
  clientX: 180,
  clientY: 21,
});
vi.advanceTimersByTime(1000);
expect(onChange).toHaveBeenCalledTimes(1);
```

- [ ] **Step 3: Add failing unified-navigation tests**

Use fake timers to require chevrons, option clicks, ArrowLeft/ArrowRight/Home/End, and horizontal
wheel input to move the track first and delay `onChange` until centering completes. Add a repeated
chevron case that commits only the final pending destination. Mock `matchMedia` with reduced motion
and require immediate centering and emission.

- [ ] **Step 4: Run the picker test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: FAIL because the current component has no transform track, commits navigation
immediately, and retains mandatory scroll snapping.

- [ ] **Step 5: Commit the failing behavioral specification**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
git commit -m "test: specify smooth analytics period motion"
```

### Task 2: Implement the horizontal motion controller

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsPeriodPicker.tsx`
- Test: `src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx`

- [ ] **Step 1: Add geometry and imperative transform helpers**

Use option DOM geometry rather than assuming three visible values. Maintain the current transform
in a ref and update the track directly so drag frames do not rerender Analytics.

```ts
const CENTER_DURATION_MS = 240;
const AXIS_LOCK_THRESHOLD_PX = 6;
const MOMENTUM_MIN_VELOCITY = 0.02;
const MOMENTUM_DECAY = 0.95;

const centeredTranslate = (index: number) => {
  const viewport = viewportRef.current;
  const option = optionRefs.current[index];
  if (!viewport || !option) return translateRef.current;
  return viewport.clientWidth / 2 - (option.offsetLeft + option.offsetWidth / 2);
};

const applyTranslate = (next: number) => {
  translateRef.current = next;
  trackRef.current?.style.setProperty('transform', `translate3d(${next}px, 0, 0)`);
};
```

- [ ] **Step 2: Add cancellable requestAnimationFrame motion**

Implement one animation-frame owner for momentum and centering. Centering uses an ease-out curve and
emits the option offset only on the final frame. Reduced motion applies the final transform and
emits synchronously. Momentum decays velocity, applies edge resistance, and hands its final
translation to nearest-option centering.

```ts
const centerIndex = (index: number, commit: boolean) => {
  cancelMotion();
  const from = translateRef.current;
  const to = centeredTranslate(index);
  if (prefersReducedMotion()) {
    applyTranslate(to);
    if (commit) commitIndex(index);
    return;
  }
  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / CENTER_DURATION_MS);
    const eased = 1 - (1 - progress) ** 3;
    applyTranslate(from + (to - from) * eased);
    if (progress < 1) motionFrameRef.current = requestAnimationFrame(step);
    else if (commit) commitIndex(index);
  };
  motionFrameRef.current = requestAnimationFrame(step);
};
```

- [ ] **Step 3: Route touch, wheel, and navigation through the controller**

Keep `touch-action: pan-y` and pointer capture. During horizontal dragging, coalesce transform writes
through `requestAnimationFrame`, calculate smoothed velocity, and suppress the synthesized click.
On release, start momentum or center the nearest option. On cancellation, center the controlled
selection without committing. Use the pending visual index for arrows and repeated navigation.
Horizontal wheel input updates the transform and uses a short settle timer; mouse-button pointer
movement remains ignored.

- [ ] **Step 4: Render the transform track without scroll snap**

```tsx
<div
  ref={viewportRef}
  data-testid="analytics-period-picker"
  data-home-carousel-swipe-lock="true"
  className="min-w-0 flex-1 overflow-hidden [touch-action:pan-y]"
>
  <div
    ref={trackRef}
    data-testid="analytics-period-track"
    className="flex min-w-max will-change-transform motion-reduce:transition-none"
  >
    {options.map(renderOption)}
  </div>
</div>
```

Retain the fade mask, listbox/option semantics, 44px chevrons, controlled `aria-selected`, exact
labels, focus styles, and no-shadow styling.

- [ ] **Step 5: Run the focused picker tests and verify GREEN**

```bash
npx vitest run src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
```

Expected: PASS with one settled commit per gesture or navigation sequence.

- [ ] **Step 6: Commit the motion implementation**

```bash
git add src/components/TransactionFlow/AnalyticsPeriodPicker.tsx src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx
git commit -m "fix: smooth analytics period navigation"
```

### Task 3: Defer closed-drawer aggregation

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`

- [ ] **Step 1: Write a failing aggregation-boundary test**

Spy on the real `buildAnalyticsSummary`, render `AnalyticsDrawer` with `open={false}`, and assert it
is not invoked. Rerender open and assert it runs for the active scope.

```tsx
it('does not aggregate analytics while the drawer is closed', () => {
  const buildSummary = vi.spyOn(analytics, 'buildAnalyticsSummary');
  const { rerender } = renderDrawer({ open: false });
  expect(buildSummary).not.toHaveBeenCalled();

  rerender(<AnalyticsDrawer {...baseProps} open />);
  expect(buildSummary).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the drawer test and verify RED**

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because the current `useMemo` aggregates independently of `open`.

- [ ] **Step 3: Gate and retain drawer derivation**

Return `null` from summary, scope, filtered-transaction, and flattened-item memoization while closed.
Keep the last non-null derived values in refs for the visual close transition, but never recompute
them from changing period or transaction props until the drawer opens again. Guard the initial
closed render where no retained summary exists.

```ts
const activeSummary = useMemo(
  () =>
    open && hasCompleteHistory
      ? buildAnalyticsSummary({ transactions, range, currency, now, customPeriod, periodOffset })
      : null,
  [currency, customPeriod, hasCompleteHistory, now, open, periodOffset, range, transactions],
);
const retainedSummary = useRef(activeSummary);
if (activeSummary) retainedSummary.current = activeSummary;
const summary = activeSummary ?? retainedSummary.current;
```

Apply the same active/retained boundary to scope and transaction items. Preserve scope-change and
close-time filter clearing.

- [ ] **Step 4: Run picker, drawer, and carousel tests and verify GREEN**

```bash
npx vitest run \
  src/components/TransactionFlow/AnalyticsPeriodPicker.test.tsx \
  src/components/TransactionFlow/AnalyticsDrawer.test.tsx \
  src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the computation boundary**

```bash
git add src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "perf: defer closed analytics drawer derivation"
```

### Task 4: Verify native-feel behavior end to end

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Add a failing Mobile Chrome motion assertion**

Instrument the picker during a synthesized touch gesture and collect its track transform at several
animation frames. Assert there are more than two distinct intermediate positions, the Analytics
carousel dot stays active, and the selected option remains unchanged until motion settles. Click a
chevron and assert the track moves before the selected offset changes, then wait for the final
selection.

- [ ] **Step 2: Run the focused E2E test**

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project='Mobile Chrome' --retries=0
```

Expected before implementation: FAIL because the current picker exposes only snapped `scrollLeft`
positions and arrow selection changes before any animation.

- [ ] **Step 3: Adjust only timing-independent implementation details if required**

Use observable states—distinct transforms, unchanged selection during active motion, and final
selected offset—rather than fixed frame timestamps. Do not weaken the assertions to accept stepped
motion or immediate arrow commits.

- [ ] **Step 4: Run complete verification**

```bash
npm test -- --reporter=dot
npm run lint
npx tsc --noEmit
npm run build
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project='Mobile Chrome' --retries=0 --repeat-each=3
git diff --check
```

Expected: 76 test files and 1,065-or-more tests pass; lint, TypeScript, build, three Mobile Chrome
runs, and whitespace validation all pass.

- [ ] **Step 5: Browser-profile the repaired gesture**

Run the local app with representative 50-row and 5,000-row mock histories. Confirm one visual
transform update per delivered pointer frame, no period selection during drag, one selection after
settle, no closed-drawer duplicate aggregation, and visible chevron centering. Preserve the trace
numbers in the implementation handoff.

- [ ] **Step 6: Commit E2E coverage**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover smooth analytics period navigation"
```
