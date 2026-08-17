# Analytics Period Picker Motion Design

## Goal

Make `AnalyticsPeriodPicker` track a touch swipe smoothly, settle to one period, and only then
recompute Analytics. Chevron, option-click, and keyboard navigation must use the same centering
animation. The change must preserve vertical page scrolling, nested home-carousel gesture
ownership, all locally derived periods, reduced-motion behavior, and the existing prohibition on
mouse dragging and shadows.

## Verified Cause

The current picker combines a manual touch handler that writes `scrollLeft` with mandatory CSS
scroll snapping. In a browser trace, a 250px touch gesture delivered 55 pointer frames but only two
scroll positions, each separated by the fixed 128px option width. Disabling snap at runtime yielded
53 scroll positions for the same gesture. The stepped drag is therefore caused by scroll snapping
quantizing the manual writes, not by Analytics aggregation.

Aggregation is already deferred until the swipe's settle callback, but it can delay the final
feedback. A controlled period change rebuilds the summary in `HomeDashboardCarousel` and again in
the mounted-but-closed `AnalyticsDrawer`. A diagnostic data set of 5,000 rows produced a 68ms main
thread task after selection. Chevron navigation also jumps because controlled centering explicitly
uses `behavior: "auto"`.

## Approved Direction

Adapt the existing vertical `Picker` motion model into a focused horizontal controller inside
`AnalyticsPeriodPicker`. Keep touch motion local and visual while a gesture or centering animation
is active. Resolve and emit exactly one controlled period only after momentum and centering have
settled. Do not change the parent home carousel's touch-action contract.

Two alternatives are intentionally rejected:

- Keeping `scrollLeft` and toggling snap would repair the stepping but would still require a second,
  custom momentum system and two centering paths.
- Enabling native horizontal panning through the parent carousel would change gesture ownership for
  the whole home layout and risks the period strip switching dashboard slides at its boundaries.

## Motion Model

Render the period options in one fixed-width horizontal row inside an overflow-hidden viewport.
Move the row with an imperative `translate3d(x, 0, 0)` transform so pointer frames do not rerender
the period list or its Analytics parents. Calculate the centered translation from the viewport and
option geometry, and recalculate it when the viewport or controlled selection changes.

The controller has four phases:

1. **Idle:** the controlled period is centered and is the only option with `aria-selected="true"`.
2. **Dragging:** after horizontal intent wins the axis threshold, pointer movement updates only the
   row transform. Vertical intent remains available to the browser. The old controlled selection
   and Analytics remain unchanged.
3. **Momentum:** release velocity advances the visual row with `requestAnimationFrame` and bounded
   decay. Movement beyond the first or last option receives resistance and then resolves back to a
   valid option.
4. **Centering:** the nearest valid option animates to the viewport center with a short transform
   transition. When the transition finishes, emit its offset once. Reduced-motion mode skips
   momentum and transition, centers immediately, and emits immediately.

Pointer cancellation returns to the controlled period without changing Analytics. A horizontal
drag suppresses the click synthesized by that gesture. Mouse pointer drags remain inert.

Chevron clicks, option clicks, and Left/Right/Home/End keys call the same centering function rather
than changing the controlled value directly. Repeated navigation during centering retargets from
the pending visual index and commits only the final destination. Previous/next availability and
destination labels follow that pending index while motion is active. This preserves responsive
controls without exposing an intermediate controlled Analytics period.

Trackpad or horizontal wheel input updates the same visual transform, settles after input stops,
and commits once. It does not add mouse-button dragging.

## Computation Boundary

`HomeDashboardCarousel` remains the owner of `periodOffset`. It receives one `onChange` only after
the picker locks its final period, so `buildAnalyticsSummary` does not run during dragging,
momentum, or centering.

`AnalyticsDrawer` must skip summary, scope, category, and transaction-list derivation while closed.
Opening the drawer computes its current scope; closing it retains the existing filter-reset
behavior and releases the derived view. This removes duplicate closed-drawer work from home picker
commits without changing data ownership or adding a query.

## Accessibility and Motion Preferences

- Keep the listbox and option semantics, exact accessible period labels, and one controlled
  `aria-selected` option.
- Keep 44px chevron targets and disabled states at the real history boundaries.
- Do not announce or recompute transient periods crossed during touch or momentum.
- Commit and announce the locked destination once.
- Honor `prefers-reduced-motion: reduce` by centering without momentum or transition.
- Preserve `data-home-carousel-swipe-lock="true"` and vertical touch scrolling.

## Testing

Component tests will verify that:

- many pointer moves change the visual transform without calling `onChange`;
- touch release starts settling and emits only the nearest final option;
- a vertical gesture and mouse drag neither move nor select periods;
- cancellation restores the controlled period;
- chevrons, option clicks, and keyboard input animate first and emit after settling;
- repeated navigation commits only the last destination;
- reduced motion emits immediately;
- the picker no longer uses mandatory scroll snap or automatic jump centering; and
- the closed Analytics drawer does not invoke summary aggregation.

Mobile browser verification will compare pointer-frame and visual-position counts, confirm the
outer carousel remains fixed during a picker swipe, and verify that arrow navigation visibly moves
the central label before the chart changes. The focused tests, full test suite, lint, TypeScript,
production build, and existing home-carousel Playwright flow must pass.

## Out of Scope

- No mouse-button dragging.
- No change to W/M/Q/Y/C period definitions or locally bounded option generation.
- No worker, new state library, chart library, or query.
- No parent-carousel gesture rewrite, layout redesign, border, or shadow.
