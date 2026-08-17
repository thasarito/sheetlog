# Category Gesture Arbitration and Live Tab Animation

## Goal

Restore quick-note long-press dragging inside the category carousel and make the Expense, Income, and Transfer tab presentation follow the carousel continuously during a swipe.

## Gesture Contract

- A stationary category press remains eligible for quick notes for 400 ms.
- Movement beyond the existing tolerance before 400 ms cancels long press and remains available to the carousel.
- When the 400 ms threshold fires, the category gesture becomes locked to quick notes until pointer release or cancellation.
- While locked, native horizontal and vertical scrolling must not take ownership of the gesture. Pointer movement updates the radial-menu selection and release selects or dismisses the quick note.
- Releasing a locked long press must not select the underlying category.
- Ordinary taps, horizontal carousel swipes, and vertical category scrolling remain unchanged when no long press has activated.

## Carousel and Tab Contract

- The carousel viewport remains the source of truth for live visual progress.
- Scroll progress is a bounded fractional slide index from `0` through `2`.
- The compact tab selection background translates continuously using that fractional progress, including native touch scrolling and programmatic tab navigation.
- Icon and label emphasis follows the nearest visual slide during the gesture.
- `aria-pressed`, form type, category clearing, and place clearing remain tied to the committed slide after the existing settle delay; visual preview must not mutate form data mid-swipe.
- Reduced-motion mode may jump for programmatic navigation, while direct user scrolling still reflects its current position.

## Component Boundaries

- `CategoryGrid` owns the long-press lifecycle and exposes activation, movement, release, and cancellation without changing the full-tile hit target.
- `StepCategory` owns carousel gesture arbitration and fractional scroll progress. It suppresses native scrolling only while a quick-note gesture is locked.
- `AnimatedTabs` accepts optional compact-variant visual progress. Other variants and callers retain their current behavior.

## Failure and Cleanup

- Pointer cancellation clears the quick-note lock and closes any active radial menu.
- Unmounting removes non-passive touch listeners and pending settle timers.
- Progress is clamped at the first and last tab so overscroll cannot move the indicator outside the control.

## Verification

- Unit-test the pre-threshold swipe path and post-threshold quick-note lock path.
- Unit-test fractional tab-indicator position independently from committed `aria-pressed` state.
- Browser-test hold, drag, and release on a category tile and assert that the carousel does not move.
- Browser-test a partial horizontal swipe and assert that the tab indicator moves before the form type commits.
- Re-run existing tap, swipe, vertical scrolling, keyboard, reduced-motion, long-press, layout, contrast, and accessibility regressions.
