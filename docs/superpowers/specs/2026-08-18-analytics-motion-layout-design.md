# Analytics Motion, Layout, and Bucket Swipe Design

**Date:** 2026-08-18

**Base:** freshly fetched `origin/main` at `401a3871abd5308a5ba6b0eff4d3ec4d5ade0425`

## Goal

Refine the direct Analytics view so its range control is left-aligned, its period picker sits
immediately beneath the stacked bar chart, and its changing data feels like one coordinated native
interface. Range, period, selected bucket, custom range, and No Big Spending changes animate the
chart, half donut, Analytics metrics, and Top categories without delaying the underlying state.
Touch users can swipe the chart one bucket at a time, and the half donut renders with its complete
top stroke visible.

## Verified Context

- `AnalyticsView` owns the detailed Analytics layout and the selected bucket/category state.
- The current control row right-aligns W/M/Q/Y/C beside the No Big Spending button, and the period
  picker appears before the chart.
- `AnalyticsBarChart` already exposes one accessible listbox, supports tap-to-nearest-bucket and
  keyboard selection, and visually mutes unselected buckets.
- `AnalyticsHalfDonut` uses an 18px stroke on an arc whose highest painted point extends above the
  current `0 0 200 108` viewBox, which clips the top edge.
- `AnalyticsCategories` keeps range-level series positions stable inside a summary but currently
  replaces amounts, percentages, and segmented tracks without motion.
- Sheetlog already depends on Framer Motion and already uses a native non-passive Touch Events path
  in `AnalyticsPeriodPicker` to arbitrate horizontal gestures inside the vertically scrolling iOS
  PWA.
- No query or mutation changes are needed. Analytics continues to derive from the existing local
  transaction/query state and pure summary builder.

## Approved Direction

Use a coordinated presentation layer:

1. Add [`@number-flow/react`](https://number-flow.barvian.me/) for changing Analytics metrics.
2. Use the existing Framer Motion dependency for bar geometry, donut arcs, category rows, and
   segmented category tracks.
3. Add a small chart-local Touch Events controller that commits exactly one adjacent bucket after
   a horizontal release.
4. Keep all Analytics state, calculations, filters, accessible announcements, and error handling in
   their existing owners.

This provides direct, data-shaped motion without introducing a chart library, a second source of
truth, a query, or a whole-screen transition.

## Layout

The Analytics content order becomes:

1. One control row with the existing W/M/Q/Y/C segmented control aligned left and the existing
   icon-only No Big Spending control aligned right.
2. Spending trend stacked bar chart.
3. Non-custom period picker directly beneath the chart.
4. The selected-bucket chip, when present.
5. Overview with the half donut and Expenses, Income, and Net metrics.
6. Top categories.
7. Transactions and existing status text.

Custom range keeps its current behavior: selecting C opens the range sheet, and no period picker is
rendered while custom mode is active. Moving the controls does not change their 44px targets,
labels, pressed states, focus behavior, or the Analytics scroll-padding contract. No shadow is
introduced.

## Motion Triggers and Behavior

The following committed state changes form one coordinated transition:

| Trigger | Bar chart | Half donut | Metrics | Top categories |
| --- | --- | --- | --- | --- |
| W/M/Q/Y/C change | New topology enters from the baseline; old topology fades | Arc shares morph | Values roll | Rows enter, exit, reorder, and update |
| Period or applied custom-range change | New buckets enter from the baseline; old buckets fade | Arc shares morph | Values roll | Rows enter, exit, reorder, and update |
| Bucket selection by tap, key, or swipe | Selected emphasis moves between bars | Scoped arc shares morph | Scoped values roll | Scoped values/tracks update |
| No Big Spending toggle | Filtered bar heights/segments morph | Filtered arc shares morph | Filtered values roll | Filtered rows and values update |

Animations do not run on the initial Analytics render. Data and accessible text update immediately;
motion is a visual interpolation of the new committed state and never holds stale calculations on
screen. The common visual transition is 320ms with a quick ease-out. Category entry/exit uses a
shorter 240ms transition. NumberFlow digit transforms use 350ms and character opacity uses 180ms so
the metrics settle with the charts.

When bucket count and identity stay compatible, bar containers and their signed category segments
morph height and proportion. When a period/range changes bucket identity or count, outgoing bars
fade while incoming bars rise from the baseline. Bucket selection keeps the existing truthful bar
geometry and animates only the existing color/opacity emphasis; it does not rescale the chart to the
selected bucket.

The half donut animates each semantic category arc's dash length and offset. Arcs that leave the new
summary fade out; new arcs fade in from zero visible share. Category color, name, and series order
remain the non-motion cues.

## NumberFlow Metrics

Create a focused `AnalyticsNumber` presentation component around `@number-flow/react`. It accepts a
numeric value plus either a currency or percentage presentation and centralizes the timing and
format contract.

Currency output must remain byte-for-byte consistent with the visible `formatAnalyticsAmount`
contract:

- THB uses `฿`;
- USD uses `$`;
- other currencies use their ISO code as the prefix;
- negative values put `-` before the prefix;
- values use the runtime locale's grouping and at most two fractional digits.

The wrapper passes the absolute numeric value to NumberFlow and supplies the signed currency prefix,
which preserves output such as `-฿300`. Percentages use an integer value and `%` suffix. Each
NumberFlow instance is isolated from unrelated layout motion. The visible Analytics metrics covered
are:

- the selected-bucket chip total;
- the half-donut center expense total;
- Overview Expenses, Income, and Net;
- each Top category amount and percentage.

Axis/date labels, excluded-count text that is accessible but not visible, and transaction-row
amounts are not animated metrics. Existing live-region and control accessible labels continue to
use immediate formatted strings, so assistive technology receives one settled state rather than
digit-by-digit announcements.

## Chart Swipe Interaction

Touch swipe augments rather than replaces the chart's tap and keyboard behavior:

- swipe left selects exactly one later bucket;
- swipe right selects exactly one earlier bucket;
- when no bucket is selected, swipe left enters at the earliest bucket and swipe right enters at the
  latest bucket, matching the existing unselected ArrowRight/ArrowLeft behavior;
- a swipe at a history boundary leaves the boundary bucket selected;
- one touch gesture can emit at most one `onSelect` call, after release;
- there is no momentum, continuous scrubbing, or per-move Analytics recomputation;
- mouse-button dragging remains disabled.

Use the same iOS-safe gesture ownership model as `AnalyticsPeriodPicker`: record one identified
touch, wait through a small axis-lock threshold, and attach a native `touchmove` listener with
`passive: false`. Horizontal ownership prevents the move and suppresses the compatibility click;
vertical ownership never prevents default and leaves Analytics scrolling intact. A cancelled or
multi-touch interaction makes no selection.

The plot carries `data-home-carousel-swipe-lock="true"`, so a chart gesture never moves the outer
Transactions/Analytics carousel. A horizontal displacement of 32px is required to
commit; a shorter movement remains a tap candidate. The existing position-based click handler,
Left/Right/Home/End/Escape keys, listbox semantics, option descriptions, and selected-bucket chip
remain authoritative.

## Half-Donut Clipping Fix

Expand the SVG viewBox upward and slightly increase its vertical extent, using
`viewBox="0 -3 200 112"`, while retaining the same `M 12 96 A 88 88 0 0 1 188 96` arc and 18px
stroke. The painted arc top is then inside the coordinate viewport with additional clearance.
Retain an overflow-visible SVG class as a defensive presentation rule. The figure's centered total,
label, maximum width, and surrounding layout remain unchanged.

## Component Boundaries and Data Flow

### `AnalyticsView.tsx`

- Reorders the range control, chart, and period picker.
- Keeps selected bucket/category state and existing filter-reset effects.
- Passes the existing summary/scope values directly to animated presentation components.
- Uses `AnalyticsNumber` for the selected-bucket and Overview metrics.
- Does not introduce duplicated transition state or delay `onRangeChange`, `onPeriodChange`, custom
  range application, or the No Big Spending toggle.

### `AnalyticsBarChart.tsx`

- Owns animated signed stack geometry and selected-bar emphasis.
- Owns chart-local touch refs and cleanup.
- Resolves adjacent selection through one pure helper so direction, no-selection entry, and bounds
  are unit-testable.
- Preserves compact read-only chart behavior when no selection callback is supplied.

### `AnalyticsHalfDonut.tsx`

- Owns the expanded SVG viewBox and animated arc dash geometry.
- Uses semantic category identity for arc entry and exit.
- Uses `AnalyticsNumber` for the center expense total.

### `AnalyticsCategories.tsx`

- Uses semantic row identity so changed categories enter/exit instead of visually becoming another
  category in place.
- Applies Framer Motion layout transitions when category order changes.
- Uses `AnalyticsNumber` for amounts and percentages.
- Transitions the existing sixteen track segments to their new filled state.

### `AnalyticsNumber.tsx`

- Owns NumberFlow formatting and motion timing only.
- Does not replace `formatAnalyticsAmount` in pure calculations, accessible descriptions, or tests.

## Reduced Motion, Accessibility, and Failure States

NumberFlow keeps its default reduced-motion preference support. Framer Motion uses the same user
preference to render final chart, donut, and category geometry immediately. Gesture selection,
tap, and keyboard behavior remain functional when animation is disabled.

Loading skeletons, offline history messaging, unavailable/retry states, stale-data text, and empty
categories remain unchanged and do not animate as if they were numeric data. A newly ready summary
renders its final state without an initial flourish. Existing polite Analytics announcements remain
atomic. Focus is never moved by an animation, and exiting rows/arcs are removed from interaction and
the accessibility tree.

## Testing and Verification

Implementation follows test-driven development.

### Component tests

- `AnalyticsView` asserts the control row precedes the chart, W/M/Q/Y/C is the left item in that row,
  and the period picker follows the chart for non-custom ranges.
- `AnalyticsNumber` covers THB, USD, ISO-prefix, negative, fractional, and percentage output while
  keeping accessible text settled.
- `AnalyticsBarChart` covers left/right adjacency, both no-selection entry points, history bounds,
  one commit per release, compatibility-click suppression, vertical pass-through, cancellation,
  multi-touch, and the read-only compact chart.
- Bar tests verify data updates expose motion endpoints without changing accessible descriptions.
- `AnalyticsHalfDonut` covers the expanded viewBox and arc motion endpoints.
- `AnalyticsCategories` covers semantic row entry/exit/reorder identity, NumberFlow metrics, and
  animated track endpoints.
- Reduced-motion tests verify immediate final geometry.

### Integration and browser checks

- Existing Analytics filter tests continue to prove that range, period, bucket, custom range, and
  No Big Spending state produce the same summaries and transaction populations.
- A mobile Playwright flow swipes the chart in both directions, verifies exactly one bucket change,
  confirms a vertical gesture scrolls rather than selects, and confirms the outer carousel remains
  on Analytics.
- A mobile screenshot confirms the left-aligned range control, chart-before-picker order, and full
  half-donut stroke.
- Run focused Vitest suites during each red-green cycle, then the complete `npm test`,
  `npm run lint`, `npx tsc --noEmit`, `npm run build`, and relevant Mobile Chrome browser flows.

## Dependency and Repository Contract

Add `@number-flow/react` as an application dependency and keep both committed npm and pnpm lockfiles
consistent. Continue using the existing Framer Motion dependency. Do not add a gesture or chart
library. The work remains isolated on `feat/analytics-motion-layout`, created from the freshly
fetched `origin/main` commit recorded at the top of this document.

## Out of Scope

- No changes to Analytics range definitions, period-option generation, category aggregation,
  currency conversion, comparison calculations, or No Big Spending rules.
- No query, mutation, synchronization, persistence, or TanStack Query change.
- No transaction-row number animation.
- No continuous chart scrubbing, momentum, mouse drag, chart pan, or zoom.
- No redesign of the home carousel, header, category-entry sheet, custom-range sheet, or
  Transactions view.
- No border, card, or shadow redesign.
