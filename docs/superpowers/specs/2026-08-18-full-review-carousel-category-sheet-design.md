# Full Review Carousel and Category Sheet Design

## Goal

Replace the compact home dashboard on the Category step with a full-height review carousel whose
two slides directly contain the complete Transactions and Analytics experiences. Move the existing
transaction type and category chooser into a non-modal Vaul sheet above the carousel.

The category sheet opens at today's content-fit height. It can be dragged down to a persistent
`Log transaction` bar so the review carousel is almost entirely visible, then tapped or dragged
back up. The review content remains interactive at both snap points.

Selecting a category still enters the current full-screen Amount and Receipt flow. Selecting an
existing transaction still enters the current edit flow. This change affects only the step-zero
Category/dashboard presentation.

## Existing State

On step zero, `TransactionFlow` uses a two-row grid:

- `HomeDashboardCarousel` occupies the remaining upper space and renders compact `TopDashboard`
  and `AnalyticsSlide` slides; and
- `StepCategory` sits inline beneath the carousel.

The compact slides open separate near-full-height `TransactionHistoryDrawer` and
`AnalyticsDrawer` detail sheets through `View all`. The transaction detail sheet owns complete
history search and refresh. The analytics detail sheet owns the full chart, overview, category,
filter, and transaction experience. `HomeDashboardCarousel` already owns the complete-history and
historical-rate query state needed by Analytics, while `TopDashboard` uses the recent transaction
path.

`StepCategory` owns the Expense/Income/Transfer carousel, category grid, quick-note gestures, and
the date drawer used after a category choice. The Amount and Receipt steps replace the complete
step-zero layout when active.

## Step-Zero Layout

The area below the existing Sheetlog header becomes a layered composition:

1. A full-height horizontal review carousel is the base layer.
2. A persistent, non-modal category-entry sheet is the foreground layer.

The review carousel fills all remaining app-canvas height regardless of the category sheet's snap
point. It keeps the current mobile `max-w-md` canvas and does not introduce a card, backdrop,
gradient, background scaling, or shadow.

Transactions is slide 1 and the initial slide whenever step zero mounts. Analytics is slide 2.
Each slide has its own vertical scroller and occupies one complete carousel viewport width. Native
horizontal scrolling and CSS scroll snapping remain the primary slide interaction. The two current
position indicators move into a fixed strip beneath the active slide header so they cannot be
covered by either category-sheet position. Indicator targets remain at least 44 by 44 CSS pixels.

The existing Sheetlog header remains outside and above the review carousel. The review surfaces
retain their own `Transactions` and `Analytics` headings, but remove drawer-only handles, close
buttons, and modal framing.

## Full Review Slides

### Transactions

The Transactions slide directly contains the current complete-history experience:

- `Transactions` heading and refresh action;
- search by category, note, or account;
- transaction count and saved/refresh status;
- cached-data, partial-history, offline, loading, empty, and error treatments;
- newest-first virtualized history grouped by date; and
- the current transaction-row selection behavior.

There is no compact recent-only mode, `View all` action, or outer transaction-history drawer on
step zero. Tapping a transaction calls the existing edit handler, which replaces step zero with the
current full-screen Amount editor.

### Analytics

The Analytics slide directly contains the current detailed analytics experience:

- W/M/Q/Y/Custom range controls and period selection;
- no-big-spending control;
- the interactive stacked trend chart and bucket filter;
- Overview totals and half-donut;
- Top categories and category filtering;
- matching Transactions and filter clearing; and
- current loading, offline, missing-rate, stale-data, and retry treatments.

There is no compact analytics summary, `View all` action, or outer analytics drawer on step zero.
The custom-range picker remains a temporary nested Vaul sheet. Selecting a transaction calls the
existing edit handler.

Both slide surfaces stay mounted while step zero is active. Switching slides therefore preserves
search text, analytics filters, vertical scroll positions, and loaded query state. The inactive
slide is inert and hidden from assistive technology.

## Category Entry Sheet

The existing `StepCategory` content is placed inside a dedicated Vaul wrapper with these rules:

- The drawer is always open while step zero is mounted.
- It is non-modal, non-dismissible, and does not render an overlay or scale the review layer.
- The upper snap point is active by default.
- The lower snap point is a persistent collapsed launcher rather than a closed drawer.
- The drawer cannot be dragged below the collapsed launcher.
- No shadow is used.

### Expanded snap point

The upper snap point is measured from the rendered category content, drawer handle, and bottom
safe-area inset. This preserves today's content-fit category height rather than turning category
selection into another near-full-height sheet.

Use a resize-aware measurement so category configuration, text wrapping, orientation, and viewport
changes can update the pixel snap point. Clamp the result to the available app-canvas height. If a
short viewport cannot show the complete category content, the category body scrolls internally
while its handle, type tabs, and safe-area spacing remain reachable.

### Collapsed snap point

The lower point contains:

- the Vaul grab handle;
- a `Log transaction` label;
- an expansion affordance; and
- bottom safe-area padding.

The whole launcher is a button labeled `Expand transaction entry`. Activating it returns the sheet
to the expanded point. The expanded handle exposes `Collapse transaction entry` for equivalent
keyboard and assistive-technology operation.

### Interaction with review content

The uncovered review surface remains fully interactive at both snap points. Users can switch
carousel slides, vertically scroll, search, change analytics controls, or select a transaction
without first collapsing the category sheet.

The review scrollers receive bottom padding and `scroll-padding-bottom` equal to the category
sheet's current occluded height. The drawer publishes this value through shared layout state or a
CSS custom property whenever its snap point or measured height changes. This lets the end of a
list and keyboard-focused controls scroll above the foreground sheet rather than remaining hidden
behind it.

## Gesture Contract

Gesture ownership follows dominant axis and interaction origin:

- Horizontal-dominant gestures in review content change Transactions/Analytics slides.
- Vertical gestures in a review slide scroll that slide.
- Vertical dragging from the category sheet's handle or non-interactive chrome changes snap
  points.
- Category tiles, type tabs, quick-note long presses, search inputs, chart buckets, period controls,
  and other interactive content keep their current gesture behavior.
- A committed horizontal carousel drag cannot select a transaction.
- A category-sheet drag cannot activate a category tile or quick note.
- The Analytics period picker and other nested horizontal controls keep their existing carousel
  swipe lock.

Interactive drawer content is excluded from Vaul drag initiation where necessary. The existing
category-carousel and radial-menu arbitration remains authoritative inside `StepCategory`.

Reduced-motion mode settles programmatic carousel and drawer changes immediately. Direct touch
scrolling continues to follow the user's gesture.

## State Transitions

Step zero mounts with Transactions active and the category sheet expanded. Drawer snapping,
review scrolling, search, and analytics interaction do not mutate the transaction form.

Selecting a category invokes the existing `openCreateAmountStep` path. Selecting a review row
invokes the existing `handleEditTransaction` path. Either transition unmounts the review carousel
and category sheet and renders the unchanged full-screen Amount flow. Receipt handling, sync,
undo, reimbursement, deletion, place suggestions, date editing, and submission behavior remain
unchanged.

Returning to step zero mounts the default Transactions slide with the category sheet expanded.
TanStack Query caches remain available, so remounting does not discard downloaded history or rates.

## Component Boundaries

### `TransactionFlow`

- Continues to own create, edit, reimbursement, Amount, and Receipt state.
- Mounts the layered review carousel and category sheet only when `step === 0`.
- Supplies the existing category-confirm and transaction-edit callbacks.
- Does not take ownership of review queries or analytics filters.

### `HomeDashboardCarousel`

- Owns active-slide state, native horizontal scrolling, indicators, keyboard navigation, inert
  slides, and slide announcements.
- Owns the single complete-history query and the existing analytics range, period, custom-range,
  no-big-spending, and rate state.
- Renders `TransactionHistoryView` and `AnalyticsView` directly rather than compact slides.
- Keeps both views mounted until step zero unmounts.

The component may be renamed to reflect its new review role if doing so makes call sites and tests
clearer. A rename is not itself a product requirement.

### `TransactionHistoryView`

- Is extracted from the current transaction-history drawer body.
- Owns search/debounce presentation, refresh controls, virtualized history rendering, and base
  amount presentation.
- Receives the shared history result and callbacks instead of creating a second history query.
- Contains no Vaul root, backdrop, close action, or modal focus behavior.

### `AnalyticsView`

- Is extracted from the current analytics drawer body.
- Owns selected bucket/category filters and detailed analytics presentation.
- Receives transactions, derived summary, query states, period state, and callbacks from the
  carousel owner.
- Retains the custom-range nested drawer and removes only the outer detail drawer behavior.

### `CategoryStepSheet`

- Owns Vaul configuration, active snap point, content measurement, collapsed/expanded controls,
  and the published occlusion inset.
- Renders the existing `StepCategory` content without changing its form or quick-note contract.
- Does not own transaction form values or step transitions.

Compact-only components and drawer wrappers may be removed after their callers and tests migrate,
provided they are not used elsewhere.

## Data and Query Behavior

The carousel enables the existing `useTransactionHistoryQuery` immediately when step zero mounts.
The full Transactions slide renders complete cached/local history at once and refreshes remote
Sheet history in the background. This intentionally replaces the compact slide's recent-only query;
a full history surface cannot truthfully rely on the latest 50 rows.

The same merged, deduplicated history result feeds Transactions and Analytics. No second remote
history fetch or non-query data path is added. Existing query keys, cache persistence, mutation
invalidation, local pending/error rows, and base-amount conversion remain authoritative.

Historical exchange-rate queries remain lazy until Analytics is first activated, then stay enabled
for the remainder of that step-zero mount. Analytics derivation continues to use the existing pure
aggregation functions and memoized rate/history inputs.

No transaction mutation, Google Sheet schema, analytics formula, or sync behavior changes.

## Loading, Error, Offline, and Measurement Failure

- Complete history with cache shows cached/local rows while a refresh runs.
- Partial local history keeps its current explanatory status and remains searchable.
- History failure with cache keeps cached rows and exposes Retry; failure without complete cache
  keeps the current unavailable/offline treatments.
- Analytics preserves current loading skeletons, missing-rate messages, offline freshness, stale
  data, empty results, and Retry actions.
- Review failures never block category selection or the Amount flow.
- Before the expanded category height is measured, the sheet renders expanded at its natural
  content height. Measured snap points are clamped to finite, positive values before being applied.
- Resize or orientation changes recompute the upper point without allowing the drawer below its
  collapsed launcher or above the app canvas.

## Accessibility

- The review region remains a labeled two-slide carousel.
- Indicators are real buttons with slide names and selected state; Left and Right Arrow keys work
  from the carousel controls.
- Settled slide changes announce `Transactions, slide 1 of 2` or `Analytics, slide 2 of 2` without
  moving focus.
- The inactive slide is inert and `aria-hidden`.
- The category sheet is explicitly non-modal and does not trap focus away from visible review
  controls.
- Expand and collapse actions expose their state and have at least 44-by-44-pixel targets.
- Dynamic review scroll padding ensures focused controls can be brought above the drawer.
- Existing chart descriptions, live analytics totals, search labels, refresh labels, and row
  semantics are preserved.
- The nested custom-range drawer retains modal focus management and returns focus to its trigger.

## Verification

Implementation proceeds test-first and preserves the existing test contracts while moving them to
the extracted surfaces.

### Component and integration tests

- Assert the category sheet starts expanded, exposes exactly two snap points, cannot dismiss, and
  toggles through its launcher and handle controls.
- Assert content measurement updates and clamps the expanded point, including short viewport and
  safe-area behavior.
- Assert step zero directly renders complete Transactions and Analytics views without `View all`
  actions or outer detail dialogs.
- Assert complete history is enabled on initial display and shared by both slides.
- Assert historical rates remain disabled until Analytics is first activated.
- Preserve transaction search, refresh, count, cache, partial-history, empty, loading, error,
  offline, virtualization, base-amount, and edit-selection tests after extraction.
- Preserve analytics range, period, custom range, chart bucket, category, no-big-spending,
  transaction filtering, loading, error, offline, and transaction-selection tests after extraction.
- Assert horizontal carousel gestures do not steal vertical scrolling or nested control gestures.
- Assert drawer gestures do not activate category tiles or quick notes.
- Assert visible review controls remain operable while the category sheet is expanded.
- Assert selecting a category enters the existing Amount flow and returning to step zero restores
  the expanded sheet.
- Assert inactive slides are inert and slide announcements remain correct.

### Browser coverage

Mobile Playwright coverage captures and exercises:

1. the default content-fit expanded category sheet over Transactions;
2. the collapsed launcher over full Transactions;
3. the collapsed launcher over full Analytics;
4. touch drag down and drag up between snap points;
5. vertical history scrolling versus horizontal carousel swiping;
6. category taps and quick-note gestures while the sheet is expanded; and
7. bottom safe-area and short-viewport behavior.

The implementation finishes by running focused tests during development, the full test suite,
`npm run lint`, and `npx tsc --noEmit`.

## Non-Goals

- Changing the Amount, Receipt, edit, reimbursement, undo, delete, place, or sync flows.
- Changing analytics calculations, range semantics, chart design, or transaction row design.
- Adding a third carousel slide, autoplay, looping, or a new carousel dependency.
- Adding a new data-fetching path outside TanStack Query.
- Persisting carousel or drawer UI state across step-zero mounts.
- Restyling unrelated settings, onboarding, or desktop surfaces.
