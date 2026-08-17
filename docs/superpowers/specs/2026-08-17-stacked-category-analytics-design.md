# Stacked Category Analytics Design

## Goal

Refine the existing Sheetlog Analytics carousel slide and detail sheet so their bar charts show
category composition over time. Week and month use daily buckets; quarter uses weekly buckets.
The chart uses the selected range's four largest expense categories plus a neutral `Other`
remainder, with stable category colors across every bucket.

Selecting a chart bucket in the Analytics detail sheet updates Overview, Top categories, and
Transactions together. Budget, forecasting, exchange-rate conversion, and mouse-drag carousel
behavior remain out of scope.

## Approved Direction

Use one category-aware analytics model shared by the compact slide and detail sheet. Compute the
top four categories once for the complete selected W/M/Q range, assign their colors once, and reuse
that identity, order, and color in every time bucket. All remaining expense categories are grouped
into `Other` and rendered with a neutral color.

This keeps the chart, category rows, filters, and accessible descriptions synchronized. It avoids
duplicating aggregation inside presentation components or maintaining separate compact and detail
chart implementations.

## Visual References

- The [stacked chart reference](https://cdn.dribbble.com/userupload/8438209/file/original-218d58b2d7a3417fcaf92c52ebf4a8a5.jpg?resize=2048x1536&vertical=center)
  contributes slim segmented columns, bright but restrained category colors, clear rhythm, and
  compact labels.
- The [category-list reference](https://i.pinimg.com/736x/84/18/22/8418220358288ac0fa8049c665453643.jpg)
  contributes colored category markers, a strong name/amount row, a secondary percentage, and a
  segmented progress track.

Sheetlog retains its existing light surface, typography, emerald accent, borderless carousel, and
no-shadow rule. The references guide chart and category treatment only; they do not introduce a
dark card, new navigation, or unrelated financial features.

## Time Buckets

| Range | Period | Chart buckets | Visible labels |
| --- | --- | --- | --- |
| W | Rolling seven days including today | Seven daily buckets | Every weekday |
| M | Calendar month to date | One bucket per elapsed day | Day 1, 8, 15, 22, and the final elapsed day |
| Q | Calendar quarter to date | Consecutive seven-day buckets, with the final bucket truncated at today | Month boundaries or every fourth week |

Every bucket has an exact accessible date or date-range label even when its visual label is omitted.
Changing W/M/Q resets the selected bucket and category filter because both belong to the previous
time scale.

## Category Stack Model

For the complete selected range:

1. Include valid transactions in the active currency.
2. Aggregate signed expense amounts by category.
3. Rank positive net category totals by amount, with category name as the deterministic tie-breaker.
4. Keep the first four as named chart series.
5. Aggregate every remaining expense category into `Other`.

Each time bucket contains one signed segment for each named series and one neutral `Other` segment.
Series remain in the same order for every bar. Positive segments stack above the baseline; net
negative segments stack below it so refunds and compensating rows remain truthful. Segment geometry
does not impose a fake minimum height; exact values are available through selection and accessible
text.

The palette uses four distinguishable category colors that fit Sheetlog's existing theme: emerald,
cyan, violet, and rose. `Other` uses a muted slate. Color is reinforced by fixed series order,
category names, and textual values.

## Chart Interaction

The compact carousel chart is a read-only trend preview. The larger detail-sheet chart supports
bucket selection.

Dense month charts cannot provide an independent 44px target for each of 31 thin bars. The detail
plot therefore behaves as one position-selectable control:

- a tap chooses the nearest bar based on horizontal position;
- Left and Right Arrow keys move selection by one bucket;
- a high-contrast outline and baseline marker identify the selected bar;
- a text chip below the chart shows the exact selected day/range and total;
- tapping the selected bar again or activating the chip's clear action removes only the bucket
  filter and preserves any selected category;
- no scrubbing or dragging is required.

The chart exposes an accessible name for each current selection containing the full date, expense
total, and category breakdown. The visible Overview, category list, and Transactions section are
the complete textual equivalent of the selected visual bar.

## Coordinated Detail-Sheet Filtering

With no bucket selected, the detail sheet shows the complete W/M/Q range. Selecting a bucket derives
one scoped transaction set from that bucket's date boundaries, including expenses, income, and
transfers.

That scoped set updates:

- **Overview:** Expenses, Income, and Net are recomputed for the bucket. Transfers remain excluded
  from totals.
- **Top categories:** the same four range-level category identities retain their colors and order,
  while amounts, percentages, and progress tracks recompute for the bucket. `Other` remains last
  when present.
- **Transactions:** all transactions in the bucket are shown newest first.

Selecting a category intersects the category and bucket filters for Transactions. Selecting
`Other` matches every expense category outside the stable range-level top four. The Overview remains
bucket-scoped rather than category-scoped so it continues to describe the selected time interval.
The sheet-level Clear filters action removes both bucket and category selection and restores the
complete range.

## Top Categories Presentation

Each category is an interactive row with:

1. a color marker and category name on the left;
2. amount and percentage on the right;
3. a segmented progress track below, filled in the series color;
4. selected state communicated with text/outline as well as color; and
5. a minimum 44px target.

The progress denominator is the current bucket- or range-scoped positive category total. Rows with
no positive scoped spend remain visible but subdued while a bucket is selected, preserving the
stable chart legend. A short empty state replaces the list when the scope has no positive category
spend.

## Component and Data Boundaries

- `analytics.ts` owns time boundaries, daily/weekly bucket construction, stable top-four series,
  `Other`, signed segment totals, and selected-scope summaries.
- `AnalyticsBarChart.tsx` renders category stacks and the optional composite selection control. It
  receives fully derived data and does not rank categories.
- `AnalyticsSlide.tsx` keeps the compact chart read-only and preserves the current headline,
  comparison, toggle, and View all action.
- `AnalyticsDrawer.tsx` owns bucket/category selection state and renders the coordinated Overview,
  category rows, and Transactions sections.
- `HomeDashboardCarousel.tsx` continues to own W/M/Q state and lazy transaction-history loading.

No new charting or state-management dependency is required. Existing TanStack Query history data
and drawer primitives remain in use.

## States and Accessibility

- Loading, offline, error, empty, focus restoration, and read-only transaction behavior remain as
  currently implemented.
- The selected bucket is announced politely once; recomputed sections do not each produce competing
  live-region announcements.
- Sparse visual labels never replace exact accessible labels.
- Category identity never relies on hue alone.
- Reduced-motion mode removes nonessential transitions.
- The chart and category rows remain usable at mobile width without horizontal page overflow.

## Testing and Acceptance Criteria

- W returns exactly seven daily category-stacked buckets.
- M returns one daily bucket per elapsed calendar day, including short months.
- Q returns consecutive weekly buckets and truncates the final bucket at today.
- The same four category series and colors are reused across all buckets for a selected range.
- Every expense outside the top four contributes to `Other`.
- Signed adjustments are reflected in category segments and bucket totals.
- Selecting a bucket recomputes Overview and category amounts and filters Transactions.
- Bucket plus category selection intersects correctly, including `Other`.
- Range changes clear stale selections.
- Pointer and keyboard selection expose the exact bucket label and value.
- The compact analytics area remains within its fixed carousel height.
- No border, shadow, lower-panel movement, or desktop mouse-drag behavior is introduced.
- Unit/component tests, TypeScript, lint, production build, and Mobile Chrome E2E all pass.

## Prototype Scope

The temporary HTML prototype demonstrates the approved visual hierarchy and coordinated W/M/Q,
bar, and category interactions with representative data. It is not production code and does not
change application files, persistence, query behavior, or live financial data.
