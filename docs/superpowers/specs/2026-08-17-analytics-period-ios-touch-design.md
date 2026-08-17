# Analytics Period Picker iOS Touch Design

## Goal

Make `AnalyticsPeriodPicker` follow an iOS PWA touch gesture one-to-one and carry a natural,
multi-period fling after release. The visual design, locally bounded period list, arrow behavior,
settle-before-compute boundary, vertical sheet scrolling, and lack of mouse-button dragging must
remain unchanged.

Success means a horizontal finger movement visibly moves the row by the same distance, a quick
release can travel across several locally available periods, and Analytics receives exactly one
period change after the row locks to its final centered option.

## Verified Context and Diagnostic Conclusion

The merged transform implementation behaves correctly under Mobile Chromium: with 60 weekly
options, a 240px synthesized touch gesture delivered 32 pointer-move events, produced 76 distinct
visual transforms, and settled two periods away. The user reports that the same picker always
tracks weakly and stops too soon in the installed iOS PWA, including from the middle of history.
The issue is therefore specific to the WebKit touch-input path rather than Analytics aggregation,
option bounds, or the transform geometry.

The current picker uses Pointer Events, `touch-action: pan-y`, pointer capture, and custom momentum
capped at 520ms. It lives inside a vertically scrolling drawer. Under the Pointer Events model, a
user agent may claim an allowed viewport pan and suppress the pointer stream; preventing a
`pointermove` does not itself override viewport manipulation. See the W3C Pointer Events sections
on [direct manipulation](https://www.w3.org/TR/pointerevents/#declaring-direct-manipulation-behavior)
and [pointer suppression](https://www.w3.org/TR/pointerevents/#suppress-a-pointer-event-stream).
That arbitration is consistent with weak tracking in iOS when a horizontal gesture contains normal
vertical finger drift. The fixed 520ms momentum ceiling independently explains why a successful
release loses energy early.

The app's existing vertical `Picker`, used by `InlinePicker`, takes a different and already proven
iOS path: a native non-passive `touchmove` listener, explicit touch coordinates, and momentum that
settles based on velocity rather than a short fixed duration. The approved direction is to adapt
that input model horizontally while retaining the newer picker's imperative transform and
settle-before-compute architecture.

## Considered Approaches

### 1. Horizontal Touch Events controller — approved

Replace the touch portion of `AnalyticsPeriodPicker` with a horizontal version of the existing
`Picker` Touch Events controller. Use a non-passive native `touchmove` listener so horizontal
ownership can be claimed reliably on iOS. Keep direct `translate3d` writes, axis locking, controlled
selection, and all non-touch navigation in the existing component.

This approach matches an interaction pattern already used by the product, addresses WebKit's input
path directly, adds no dependency, and does not reintroduce per-frame Analytics work.

### 2. Native horizontal overflow without CSS snap — rejected

Let WebKit provide scrolling and inertia, debounce its settled position, then center the nearest
period. This offers native physics but brings back two synchronization domains—native scrolling and
controlled selection—and makes deterministic arrow animation, cancellation, and nested-carousel
ownership more complex.

### 3. Retune the Pointer Events controller — rejected

Increase the momentum duration and reduce decay while keeping pointer capture. This would improve
the short fling but would not address iOS gesture arbitration, so weak finger tracking could remain.

## Touch Interaction Model

The viewport registers `touchmove` with `{ passive: false }`; `touchstart`, `touchend`, and
`touchcancel` complete the lifecycle. The active gesture stores the touch identifier, starting X/Y,
starting transform, last X/time sample, velocity, axis decision, and cancellation state. A second
touch cancels the interaction and returns to the controlled period.

The gesture has four phases:

1. **Undecided:** movement below the existing small threshold does not move the row or prevent
   browser behavior.
2. **Vertical:** when vertical distance wins, the picker never calls `preventDefault`; the drawer
   retains native vertical scrolling and the row returns to the controlled center if necessary.
3. **Horizontal:** when horizontal distance wins, subsequent cancelable `touchmove` events call
   `preventDefault`. The row transform is `startTransform + (currentX - startX)`, coalesced to one
   imperative write per animation frame. This is one-to-one tracking and does not rerender the
   picker or Analytics parents.
4. **Release:** recent horizontal velocity continues through `requestAnimationFrame`. Momentum
   decays until it falls below the settle threshold, without the 520ms cutoff. Bounds retain soft
   resistance and stronger out-of-range decay. The nearest valid option then centers and emits one
   `onChange`.

Release velocity still expires after a short stationary pause so an old sample cannot cause a
surprise fling. Initial velocity is clamped to a safe maximum, which permits multi-period travel
without allowing a single event spike to traverse the entire history. Reduced-motion mode skips
momentum and centering animation, resolves the nearest option immediately, and emits once.

## Gesture Ownership and Other Inputs

- Keep `data-home-carousel-swipe-lock="true"`, so a period gesture never switches the outer home
  carousel.
- Keep `data-vaul-no-drag` behavior inherited from the Analytics sheet; the picker must not drag the
  sheet itself.
- Remove the picker's Pointer Events touch controller and its pointer capture. Do not run both touch
  controllers for the same gesture.
- Keep mouse-button dragging disabled.
- Keep horizontal wheel/trackpad input, option clicks, arrows, and Left/Right/Home/End keyboard
  navigation on the existing shared settle path.
- Keep synthesized-click suppression after a horizontal touch gesture.

## Controlled State and Computation Boundary

`HomeDashboardCarousel` remains the owner of `periodOffset`. Touch movement, momentum, and final
centering are visual state local to the picker. Only the locked destination emits `onChange`, so
`buildAnalyticsSummary` still runs once after settlement rather than during the gesture.

A controlled value change, range change, same-length option replacement, resize, or unmount cancels
the active touch and pending momentum before recentering. A cancelled or multi-touch gesture never
emits a period change. The closed `AnalyticsDrawer` derivation guard and close-time filter reset are
unchanged.

## Accessibility and Visual Design

There is no layout or styling change. Preserve the listbox/options semantics, one controlled
`aria-selected` option, exact accessible labels, 44px arrow targets, faded neighboring labels,
edge mask, current colors, and no-shadow rule. Transient periods crossed during movement are not
selected or announced; only the settled period is announced.

## Testing and Verification

Component tests will use Touch Events and verify:

- a horizontal touch delta produces the same transform delta before release;
- many touch moves do not call `onChange`;
- a fast release continues beyond 520ms, can cross multiple periods, and emits only the final one;
- a stationary pause before release does not reuse stale velocity;
- vertical movement is not prevented, does not select a period, and leaves sheet scrolling intact;
- touch cancellation and multi-touch restore the controlled period without emitting;
- controlled value and same-length option-set changes abort an active touch safely;
- a horizontal touch suppresses its synthetic click;
- mouse drag remains inert; and
- wheel, arrow, option, keyboard, and reduced-motion paths retain their current behavior.

The home-carousel browser test will confirm that a picker touch does not move the outer carousel and
that chart data changes only after the picker settles. Local WebKit verification will exercise the
Touch Events path, but it is not treated as a full substitute for an installed iOS PWA. Before
merging, expose the branch through the existing preview workflow for a real iOS PWA check of
one-to-one tracking, multi-period fling, vertical sheet scrolling, and both history boundaries.

The focused tests, full test suite, lint, TypeScript, production build, and Mobile Chrome browser
flow must pass before publishing.

## Out of Scope

- No visual redesign, period-definition change, chart change, or Analytics data-flow rewrite.
- No native scroll/snap restoration.
- No mouse-button dragging.
- No gesture library or new dependency.
- No change to the home carousel, drawer layout, custom range flow, filters, borders, or shadows.
