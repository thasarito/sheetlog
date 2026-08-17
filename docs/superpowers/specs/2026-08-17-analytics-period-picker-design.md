# Analytics Period Picker and Responsive Chart Design

## Goal

Refine the existing Analytics home slide and detail sheet with three coordinated behaviors:

1. The compact home chart expands vertically to use the height left after its controls, metrics,
   and footer.
2. Closing the Analytics sheet clears its selected chart bucket and category drill-down filters.
3. W/M/Q/Y gain a shared, horizontally swipeable period picker that exposes every continuous
   period from the earliest locally available transaction through the current period.
4. The Analytics sheet's Transactions section uses the same day headers and transaction-row
   presentation as the full Transactions sheet.

The approved stacked-category model, custom date picker, borderless home carousel, no-shadow rule,
and transaction-entry layout remain unchanged.

## Approved Direction

Use one period selection owned by `HomeDashboardCarousel` and shared by the compact Analytics slide
and the Analytics detail sheet. Represent selection as an offset from the current period, where
`0` is current and negative values address history. Pure analytics helpers resolve that offset into
the current and comparison date boundaries.

Create a dedicated horizontal `AnalyticsPeriodPicker` instead of adding a horizontal mode to the
generic vertical `Picker`. The new control follows `InlinePicker` presentation semantics—selected
text is centered and emphasized, surrounding values are muted, and the edges fade—but uses native
horizontal scrolling and scroll snapping. This keeps the feature focused and avoids risking every
existing account, currency, and recipient picker.

## Period Inventory

For W/M/Q/Y, build one chronological option list from the earliest valid local transaction date
through the current period. The bound uses every locally available transaction regardless of type
or currency because it describes available local history, while the chart itself remains filtered
to the active currency. A valid bound has a parseable date and is not a structurally invalid Sheet
row. Future-dated transactions do not extend the list beyond today.

Include every intervening period even when it contains no transactions. This makes navigation
continuous and prevents arrows or swipes from unexpectedly jumping across time. If no valid local
transaction exists, expose only the current period. When a more complete local history result
arrives, prepend any newly discovered earlier periods without changing the selected offset.

| Range | Current option | Historical options | Label example |
| --- | --- | --- | --- |
| W | Rolling seven days ending today | Adjacent, non-overlapping seven-day blocks | `Aug 11–17` |
| M | Calendar month to date | Complete calendar months | `August 2026` |
| Q | Calendar quarter to date | Complete calendar quarters | `Q3 2026` |
| Y | Calendar year to date | Complete calendar years | `2026` |
| C | Existing inclusive custom range | No horizontal period inventory | `Aug 1–17` |

W preserves the approved rolling-seven-day meaning. Moving one step backward from August 11–17
selects August 4–10. Historical M/Q/Y selections use their complete calendar boundaries. Current
M/Q/Y remain to-date so they never include future days.

Comparison periods remain immediately prior and structurally equivalent to the selected period.
Current M/Q/Y compare the same elapsed portion of the prior period, preserving the existing copy.
Historical M/Q/Y compare the complete prior calendar month, quarter, or year. W always compares the
immediately preceding seven-day block.

Metric captions, comparison text, and live announcements describe the resolved period rather than
only the W/M/Q/Y toggle. Current selections may retain `month to date`, `quarter to date`, and
`year to date`; historical selections use their exact label and compare against the complete
previous period. A historical July total must never be described as the current month to date.

Changing W/M/Q/Y resets the period offset to `0`. Selecting C keeps its existing range and opens the
existing Radix date-range flow. Returning from C to W/M/Q/Y starts at the current period.

## Horizontal Picker Interaction

`AnalyticsPeriodPicker` renders the complete option list in one horizontally scrollable strip. It
does not cap the list at three options. The viewport naturally reveals as many neighboring labels
as fit, while the selected option snaps to the horizontal center. Leading and trailing spacer
items allow the first and last real options to center correctly.

Presentation follows the existing inline picker:

- selected text uses the primary color and stronger weight;
- surrounding periods use muted text and fade toward the viewport edges;
- no card, selected-item border, or shadow is introduced;
- a previous chevron sits to the left and a next chevron sits to the right;
- each chevron has a minimum 44px target even though the visible icon is small; and
- the next action is disabled when the current period is selected, while previous is disabled at
  the earliest available period.

Touch swiping uses native momentum and scroll snapping. Tapping an option selects and centers it.
The chevrons move exactly one period. Left and Right Arrow keys do the same when focus is within the
picker. Home and sheet render separate picker instances backed by the same parent state, so a
selection made in either place is reflected immediately in the other.

Desktop mouse dragging is not added. Mouse users can click options or chevrons, and trackpad
horizontal scrolling remains native.

The nested period strip owns horizontal gestures that start within it. `HomeDashboardCarousel`
must ignore those pointer sequences so swiping dates does not switch between Transactions and
Analytics. Horizontal gestures elsewhere on the Analytics slide continue to switch home slides.

## Compact Analytics Layout

The compact slide keeps its existing hierarchy:

1. Analytics title and W/M/Q/Y/C toggle.
2. Expense total and comparison.
3. Horizontal period picker, or a static custom-range label for C.
4. Stacked bar chart.
5. Top-category summary and `View all` footer.

Replace the chart's fixed `h-10` sizing with a flex-growing region that has a small minimum height.
The title, metric, picker, notices, and footer retain their intrinsic height; the chart receives all
remaining height inside the fixed home carousel area. It does not increase the carousel height or
move the lower transaction-entry panel. Loading, error, offline, and empty states keep their current
bounded behavior.

## Detail Sheet Behavior

Place the same period picker immediately above the detail sheet's stacked chart. The range and
currency controls remain above it. The selected period scopes the chart, Overview half donut,
Top categories, and Transactions together, just as the current W/M/Q/Y/C range scopes them.

Changing period, range, currency, or custom dates clears selected bucket and category drill-down
state because those selections belong to the old scope. Dismissing the sheet through Close,
Back/Escape, a permitted downward drag, or an external controlled close also clears both drill-down
filters. Range, currency, custom dates, and selected period are not cleared; they remain shared with
the compact slide.

Selecting a transaction still closes the sheet and enters the existing editor. The filter reset
must also occur on that close path rather than depending only on the explicit Close button.

## Grouped Transactions in Analytics

The Analytics sheet keeps its current filtered result set: the selected range, historical period,
chart bucket, category, and currency continue to determine which transactions appear. It does not
gain the full Transactions sheet's search, refresh, independent query, or nested scrolling
behavior.

Extract the full Transactions sheet's existing day-header and transaction-row presentation into
reusable primitives. Both sheets render those primitives so time, category/note, account/status,
amount sign/color, read-only behavior, focus treatment, and `Today`/`Yesterday`/calendar-day
labels cannot drift. The full Transactions sheet retains virtualization for large histories;
Analytics renders its already-filtered rows directly within its existing sheet scroller. This
avoids a nested virtual scroll area while reusing the visible design and date-label logic.

Analytics transactions remain sorted newest first and grouped by local calendar day. Selecting an
editable row clears Analytics drill-down state, closes the Analytics sheet, and enters the existing
transaction editor. If the active filters produce no rows, retain `No matching transactions`.

## Component and Data Boundaries

- `analytics.ts` owns period-option generation, offset-to-boundary resolution, comparison periods,
  labels, and the existing chart/category aggregation.
- `AnalyticsPeriodPicker.tsx` owns horizontal rendering, centering, snapping, arrows, keyboard
  behavior, and accessible selection semantics. It receives fully derived options and emits one
  selected offset.
- `HomeDashboardCarousel.tsx` owns the shared range and period offset, resets the offset on range
  changes, and prevents nested picker gestures from activating the outer carousel.
- `AnalyticsSlide.tsx` renders the shared picker above a flex-growing read-only chart.
- `AnalyticsDrawer.tsx` renders the shared picker above the selectable chart and resets local
  bucket/category state when its scope changes or the sheet closes. It maps its filtered rows
  through the shared transaction day-header and row primitives.
- The transaction-history presentation module owns reusable day labels, day headers, and row
  rendering. `TransactionHistoryDrawer.tsx` keeps ownership of search, fetching, virtualization,
  and its scroll container.

No new query, mutation, charting, carousel, or state-management dependency is needed. The existing
TanStack Query transaction-history result remains the source of locally available records.

## Accessibility and Motion

- Expose the period strip as a labeled single-select control with real options, one selected value,
  and an exact accessible period label.
- Chevron buttons name the destination period, expose disabled boundaries, and retain 44px targets.
- Selection changes update the existing polite Analytics summary announcement once.
- Keyboard Left/Right, Home, and End navigate without requiring a pointer.
- Edge fades and primary color are supplementary; selected state is also exposed semantically and
  through font weight/position.
- Reduced-motion mode centers immediately. Other modes may use short native smooth scrolling.
- The picker remains horizontally contained at mobile width and does not create page overflow.

## Loading, Offline, and History Expansion

Build options from whatever local transaction records are currently available. While complete
history loads, the current-period option remains usable. When earlier records become available, add
their periods to the beginning of the strip and preserve the selected offset and chart scope.

An empty selected period is valid and shows the existing `No expenses in this period` treatment.
Network or refresh errors do not remove locally derived period options. Existing uncached error and
offline messaging remain inside their current slide or sheet bounds.

## Testing and Acceptance Criteria

- Period helpers generate every continuous W/M/Q/Y option from the earliest valid local date
  through today, including empty gaps and only the current option when history is empty.
- Future-dated and structurally invalid rows do not extend the period inventory.
- W moves through adjacent rolling seven-day blocks.
- Current M/Q/Y remain to-date; historical M/Q/Y and their comparison periods are complete calendar
  periods.
- Range changes reset to the current period, while sheet close preserves range and period.
- Home and sheet reflect one shared selected offset.
- All locally bounded options render in the horizontal strip and the selected option centers.
- Touch swipe, option tap, chevrons, and keyboard navigation select the expected period.
- Previous and next controls disable at the earliest and current boundaries.
- Swiping the period picker does not move the outer home carousel; swiping elsewhere still does.
- C retains the existing custom range picker and does not expose historical arrows.
- The compact chart grows into the remaining vertical space without changing overall carousel or
  lower-panel geometry.
- Closing the sheet through every close path clears selected bucket and category filters; reopening
  shows the unfiltered selected period.
- Analytics transactions use the same day headers and row presentation as the Transactions sheet,
  stay grouped newest-day first after every drill-down change, and preserve the existing edit flow.
- Analytics does not add search, refresh, a second history query, or a nested virtualized scroller.
- No new border, shadow, or desktop mouse-drag behavior is introduced.
- Focused unit/component tests, the full test suite, lint, TypeScript, production build, Mobile
  Chrome E2E, and Cloudflare Pages all pass before merge.
