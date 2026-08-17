# Home Transactions and Analytics Carousel Design

## Goal

Turn the existing transaction area at the top of the Money home screen into a two-slide,
borderless carousel:

1. Transactions remains the default slide and keeps its current full-width appearance and edit
   behavior.
2. Analytics adds week, month, and quarter spending summaries derived from the user's transaction
   history.

Two position indicators sit beneath the carousel. Each slide has a subtle `View all` action that
opens a dedicated, near-full-height detail sheet. The lower Expense/Income/Transfer selector,
category grid, and transaction-entry flow remain stationary and unchanged.

Budgeting, category limits, recurring bills, cross-currency conversion, and new budget-related
Google Sheet data are explicitly deferred.

## Existing State

`TransactionFlow` renders the home state as a `1fr / 3fr` grid. The upper region contains
`TopDashboard`; the lower region contains the existing category-entry step.

`TopDashboard` currently:

- reads up to 50 remote rows through `useRecentTransactionsQuery`;
- reads pending local transactions directly from Dexie;
- merges and deduplicates those sources;
- groups rows by date;
- updates the visible date and total as its vertical list scrolls; and
- calls the existing edit flow when a transaction row is tapped.

The recent 50-row response is sufficient for the compact transaction list but is not an
authoritative source for week, month, or quarter analytics. Transactions may also be entered with
past dates, so sheet row order cannot be treated as date order when determining whether a period is
complete.

## Home Carousel

### Structure

The upper `1fr` region becomes one fixed-height carousel containing two equal-width slides and a
small indicator row. The lower `3fr` entry region retains its current location and behavior.

The carousel is flush with the page:

- no outer card, border, background fill, corner radius, inset, neighboring-slide peek, gradient,
  or shadow;
- no autoplay, infinite looping, or automatic slide changes;
- one full-width slide moves per horizontal gesture; and
- Transactions is the initial slide whenever the home flow is mounted.

Use native horizontal scrolling and CSS scroll snapping as the primary interaction. This keeps the
gesture native-feeling and avoids recreating browser scrolling physics. Dot buttons scroll to the
corresponding slide. The active slide updates after the viewport settles.

The two visible indicators are centered beneath the slides inside the existing upper-region
height. The active mark is a short emerald capsule and the inactive mark is a small slate circle.
Their invisible button targets are at least 44 by 44 CSS pixels. The indicator row consumes space
inside the upper region rather than moving the lower entry panel.

### Gesture priority

The Transactions slide retains its vertical scrolling list inside the horizontally scrollable
carousel. The browser's dominant-axis gesture handling determines intent:

- horizontal intent changes slides;
- vertical intent scrolls the transaction list;
- a tap with negligible movement edits the selected transaction; and
- a committed horizontal drag must not activate a transaction row or `View all`.

The detail sheets own their gestures while open. Scrolling or swiping inside a sheet must not move
the home carousel.

### Accessibility and motion

Expose the container as a labeled carousel region. Announce each settled user-initiated change as
`Transactions, slide 1 of 2` or `Analytics, slide 2 of 2` without moving focus.

Each indicator is a real button with an accessible slide name and selected state. Left and Right
Arrow keys change slides when focus is within the carousel controls. Offscreen slide content is
removed from the keyboard and assistive-technology navigation order.

Reduced-motion mode changes slides immediately. Otherwise, programmatic changes use a short native
smooth scroll. Nothing auto-advances.

## Transactions Slide

The default slide preserves the current `TopDashboard` visual treatment:

- current transparent, full-width surface;
- `Today so far` and the visible-date currency totals;
- existing divider, date headings, typography, spacing, and row columns;
- current vertical scrolling and visible-date tracking; and
- direct row taps into the existing transaction editor.

Do not wrap this content in a new carousel card or restyle its rows.

Add `View all` as a quiet text action aligned to the right of the first visible date heading. It is
not a pill and has no icon beyond the text. Hide it when there are no transactions. The interactive
target is larger than the visible label and owns its pointer gesture so it cannot start a carousel
drag.

### Transactions detail sheet

`View all` opens a near-full-height modal bottom sheet without resetting the active carousel slide,
compact-list scroll position, or unfinished transaction form.

The sheet contains:

1. A drag handle, `Transactions` heading, Search action/input, and explicit Close button.
2. Single-select type filters: All, Expense, Income, and Transfer.
3. A date-range filter.
4. A newest-first transaction history grouped by date. Date headings show expense totals by
   currency, and rows reuse the compact home-row layout.
5. A quiet end-of-history state. The UI may reveal cached rows in chunks to avoid mounting a very
   large list at once, but filtering and search operate on the complete loaded history.

Search matches category, note, and account. Filters affect only this sheet. Tapping a row closes the
sheet and invokes the existing editor; editing and confirmed deletion remain in that existing flow.
There are no new swipe-row actions or inline mutation controls.

Close, Back/Escape, or a downward drag from the handle dismisses the sheet. Focus returns to
`View all`.

## Analytics Slide

The Analytics slide uses the same full width, white page surface, and fixed height as Transactions.
It has no enclosing panel or border.

### Compact hierarchy

1. Top row: `Analytics` at left and a compact W/M/Q single-select control at right.
2. Primary metric: expense total for the selected currency and period in large tabular numerals.
3. Period label and explicit prior-period comparison, such as
   `12% below previous 7 days`.
4. A small range-appropriate bar chart.
5. Footer: top expense category and amount at left; quiet `View all` action at right.

W is selected initially. The selected range remains stable while the home flow is mounted and is
shared with the Analytics detail sheet.

Period definitions are:

| Control | Current period | Comparison | Compact chart |
| --- | --- | --- | --- |
| W | Rolling seven local calendar days including today | Previous seven days | Seven daily bars |
| M | Current local calendar month to date | Same elapsed portion of the previous month, capped at that month's end | Up to five weekly buckets |
| Q | Current local calendar quarter to date | The same elapsed-day count in the previous quarter, capped at its end | Three monthly bars |

Changing W/M/Q recomputes the total, comparison, chart, and top category together. If the prior
period's net expense is zero or negative, show `No prior-period data` rather than an undefined or
misleading percentage. If signed adjustments make the current period negative, preserve the signed
total and replace percentage copy with `Net refunds exceeded expenses`.

The compact slide uses the transaction form's current currency. It never combines currencies or
performs implicit conversion. When data contains other currencies, the Analytics detail sheet
provides the currency selector.

The compact metric and category ranking sum finite signed expense rows. Negative compensating rows
created by undo/delete reduce the applicable period and category total instead of leaving deleted
spend counted. Categories whose net total is not positive are omitted from the ranking. Income and
transfers do not affect compact spending totals.

### Analytics detail sheet

`View all` opens a near-full-height modal bottom sheet and preserves the carousel, range, compact
list, and unfinished form state.

The sheet contains:

1. Sticky header with `Analytics`, Close, W/M/Q, and currency selection when more than one currency
   is present.
2. Overview metrics for Expenses, Income, and Net flow. Net is income minus expenses; transfers are
   excluded and that rule is stated in helper text.
3. A larger range-appropriate trend chart with textual bucket values.
4. The five largest expense categories, including amount and share of expense spend. Remaining
   categories are grouped as Other.
5. Newest-first transactions matching the selected period, currency, and any selected chart bucket
   or category. Active filtering is explicit and can be cleared.

Selecting a chart bucket or category filters the transaction section. Selecting a transaction
closes the sheet and opens the existing editor. Close, Back/Escape, and downward drag from the
handle dismiss the sheet and return focus to `View all`.

Charts use color only as a secondary cue. Each has a concise textual summary and accessible bucket
values. W/M/Q exposes expanded names and selected state, has 44-pixel touch targets, and announces
the updated period and total politely.

## Data and Query Architecture

### Complete history query

Add a TanStack Query history path keyed by the connected sheet, for example
`["transactions", "history", sheetId]`. It reads the complete `Transactions!A2:K` value range and
parses rows through the same transaction parser used by the recent query.

The query is disabled during boot and while Transactions is the only visited slide. Activate it on
the first Analytics visit or either `View all` action. Cache the successful result so reopening a
sheet or changing W/M/Q is local and immediate. Refetch after relevant sync, add, edit, delete, or
undo events. Do not block initial home rendering or transaction entry on this request.

Reading complete history is intentional: the existing 50-row tail cannot prove period coverage,
and backdated entries mean row position cannot prove date coverage. This is acceptable for the
personal-sheet scope. Loading and rendering remain separate, so a large cached result can be shown
in incremental UI chunks.

### Local transactions and merging

Replace the pending-count-triggered Dexie effect used by the upper dashboard with a focused TanStack
local-transactions query. Include pending and error records so locally logged work remains visible
and contributes to analytics while it awaits correction or synchronization.

Merge local and remote records by transaction ID, preferring the local record when it represents a
newer unsynced state. Sort by transaction date for views and groupings. Every relevant transaction
mutation and sync transition invalidates recent, history, and local transaction query keys.

### Aggregation

Keep period and aggregation functions pure and independent from React. They receive transactions,
the selected range, currency, and a `now` value, then return:

- current and comparison boundaries;
- expense, income, and net totals;
- comparison percentage or no-prior-data state;
- compact and detailed chart buckets;
- category ranking; and
- matching transactions.

Use the user's local calendar boundaries. Deduplicate before aggregation. Ignore malformed,
non-finite, or zero amounts. Sum finite signed expense and income values so compensating undo/delete
rows reverse the corresponding totals; never silently drop negative adjustments. Transfers remain
available in transaction history but are excluded from expense, income, net, comparison, chart, and
category calculations.

## Component Boundaries

- The carousel shell owns active-slide state, horizontal scrolling, indicators, keyboard control,
  and slide announcements. It does not fetch or aggregate data.
- The Transactions slide owns the existing compact list behavior and `onEditTransaction` callback.
- The Analytics slide owns selected range/currency presentation and consumes derived analytics.
- A shared transaction-history query owns complete remote history and local merge behavior.
- Pure analytics utilities own period boundaries and aggregation.
- Transactions and Analytics detail sheets own only their open state and view-specific filters.
- `TransactionFlow` remains the owner of create/edit/receipt state. Opening, closing, or interacting
  with the carousel cannot reset that state.

Use existing drawer primitives for the detail sheets and TanStack Query for all new reads and
mutations. No new carousel, chart, or state-management dependency is required.

## Loading, Empty, Error, and Offline States

### Transactions

- Loading retains the current total/header and three-row skeleton treatment.
- Empty retains `—` and `No transactions yet`; hide `View all`.
- A refresh error with cached data keeps cached and local rows visible and offers a compact Retry.
- An error without data remains inside the slide and never displaces the lower entry workflow.
- The detail sheet distinguishes no history from no filter/search matches.

### Analytics

- First activation shows fixed-height headline and chart skeletons without shifting the lower UI.
- No expenses shows `No expenses in this period` and suggests logging an expense below.
- No prior data shows the explicit no-comparison message.
- A refresh error with complete cache keeps results visible with `Couldn't refresh · showing saved
  data`.
- Offline with complete cache shows cached results and freshness. If complete history has never
  loaded, show `Full range unavailable offline` instead of presenting recent rows as authoritative.
- An error without cache shows `Analytics unavailable` and Retry inside the slide.

Dots remain usable while either slide loads or fails. Errors never disable the lower logging flow.

## Testing and Acceptance Criteria

### Carousel and Transactions

- The home screen renders exactly two full-width slides and two indicators.
- Transactions is initially selected and retains its current visual structure.
- Horizontal gestures, indicator taps, and Left/Right keys select one slide without looping.
- Vertical transaction scrolling does not change slides; horizontal dragging does not edit a row.
- Reduced motion avoids animated programmatic scrolling.
- Offscreen slide controls are not keyboard- or screen-reader-reachable.
- Transaction row taps still open the existing editor.
- `View all` is hidden for an empty list and opens history otherwise.
- Search, type, and date filters do not alter compact-list or entry-form state.
- Selecting a detail row closes the sheet and opens the intended transaction.

### Analytics

- W, M, and Q use the approved local-calendar boundaries, including shorter prior months and
  quarter boundaries.
- Comparison percentages handle increases, decreases, zero current spend, and zero prior spend.
- Expenses, income, transfers, currencies, malformed values, signed compensating rows, and
  pending/error deduplication follow the approved rules.
- Compact bars use daily, weekly, and monthly buckets for W, M, and Q respectively.
- Top-category rankings and Other grouping are deterministic.
- Changing range updates all compact and detailed values together.
- The detail sheet's chart/category filters update its transaction list and can be cleared.
- Currency selection never combines values or implies exchange rates.
- Cached, offline, empty, partial-coverage, and error states use the approved copy and do not move
  the entry controls.

### Verification

Run:

```bash
npm run test
npx tsc --noEmit
npm run lint
CI=1 VITE_DEV_MODE=true npx playwright test --project="Mobile Chrome"
```

Manually verify at a mobile viewport:

- horizontal carousel swipe versus vertical transaction scrolling;
- unchanged transaction-row appearance and editing;
- W/M/Q updates;
- both detail sheets, dismissal, and focus restoration;
- unfinished form preservation;
- offline cached and uncached analytics states; and
- no shadow styles or lower-panel layout movement.

## Explicit Assumptions and Deferred Work

- This phase has exactly two slides: Transactions and Analytics.
- Transactions remains the default on each newly mounted home flow.
- W is the initial analytics range; selection lasts for the mounted home session.
- Analytics is descriptive only and does not create or mutate transaction data.
- Complete history is read lazily and cached; recent 50-row data is never labeled as complete
  analytics.
- The compact slide follows the transaction form's current currency; the detail sheet can switch
  among currencies present in history.
- Budget plans, category limits, safe-to-spend, recurring bills, and bill coverage are deferred.
- Cross-currency totals and exchange-rate fetching are deferred.
- The existing lower transaction-entry workflow is outside redesign scope.
