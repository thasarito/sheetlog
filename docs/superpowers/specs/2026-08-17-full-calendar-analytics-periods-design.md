# Full-Calendar Analytics Periods Design

## Goal

Change Analytics in both the home carousel and detail sheet from rolling or elapsed ranges to full
local calendar periods. Week, Month, Quarter, and Year show their complete current span, compare
against the complete immediately preceding span, and keep existing historical period navigation.

Quarter retains weekly bars and adds a grouped month axis beneath them. Each month is presented as
a centered abbreviated label with a quiet horizontal rule on each side, for example
`—— Apr ——`. The detail sheet's visible `Transfers are excluded from totals.` helper is removed,
while transfers remain excluded from every aggregate.

## Confirmed Behavior

| Range | Current period | Comparison period | Chart buckets |
| --- | --- | --- | --- |
| Week | Monday 00:00 through Sunday 23:59:59.999 | Immediately preceding Monday–Sunday week | Seven daily bars |
| Month | First through last local day of the selected month | Complete preceding calendar month | One daily bar for every day |
| Quarter | First through last local day of the selected quarter | Complete preceding calendar quarter | Consecutive seven-day buckets, with a final partial bucket when needed |
| Year | January 1 through December 31 of the selected year | Complete preceding calendar year | Twelve monthly bars |

The current period includes its future days or months. A valid future-dated transaction inside the
selected calendar period therefore contributes to totals and buckets. Historical offsets continue
to select adjacent periods, but Week offsets now move between Monday-aligned calendar weeks rather
than rolling seven-day windows.

Custom ranges keep their existing explicit boundaries, comparison behavior, date-range sheet, and
navigation rules.

## Period Model

Update the pure analytics helpers so `getAnalyticsPeriods` is the single authority for the full
calendar boundaries. Use local-time date-fns helpers and an explicit Monday week start. Current and
historical W/M/Q/Y periods follow the same full-boundary rule; there is no special to-date branch
for offset zero.

`buildAnalyticsPeriodOptions` continues to build every continuous period from the earliest valid
transaction through the current period. Week distance and labels must use the same Monday-aligned
calendar-week definition as `getAnalyticsPeriods`. Period option accessible labels announce both
complete boundary dates.

Comparisons use the complete immediately preceding calendar period. Comparison text uses
`previous week`, `previous month`, `previous quarter`, or `previous year`; all references to
`previous 7 days`, `same days`, or `same elapsed days` are removed for W/M/Q/Y.

## Buckets and Quarter Axis

Week, Month, and Year keep their existing daily or monthly bucket shapes but extend them through
the full selected period. Quarter keeps the existing seven-day chunks anchored at the quarter
start, with each bucket clipped to the quarter end. This preserves the current weekly drill-down
granularity and bucket selection behavior.

Add explicit presentation metadata to the analytics summary for grouped x-axis labels. A quarter
summary provides one ordered group for each of its three months. Each group records its abbreviated
month label and the consecutive bucket span whose bucket start dates fall in that month. A weekly
bucket that crosses a month boundary belongs to the month in which the bucket starts. Other ranges
provide no grouped axis and retain their existing bucket labels.

`AnalyticsBarChart` accepts the optional axis-group metadata. For Quarter it renders a second,
non-interactive row beneath the weekly bars:

- the group width matches the number of weekly buckets assigned to that month;
- the abbreviated month label is centered;
- a one-pixel quiet rule fills the space on both sides of the label; and
- no border box, background band, gradient, or shadow is introduced.

The shared chart component is used by both the carousel and sheet, so the month axis cannot diverge
between views. Existing compact-bar activation, detailed selection, keyboard navigation, category
stacks, negative adjustments, and transaction drill-down remain unchanged.

## Interface Copy

W/M/Q/Y controls remain available in both Analytics views, along with Custom in the current
upstream interface. Remove rolling and to-date language from their accessible labels,
announcements, comparison text, and the small spending-period label. The spending-period label
uses the selected full period's existing concrete label, such as `Aug 17–23`, `August 2026`,
`Q3 2026`, or `2026`, rather than `last 7 days` or `month to date`.

Remove the visible `Transfers are excluded from totals.` sentence below the overview metrics in the
Analytics detail sheet. This is a copy-only removal: transfers remain present where transaction
history expects them and remain excluded from expense, income, and net calculations.

## Data Flow and State

No new query or mutation path is needed. The existing TanStack transaction-history and conversion
queries remain authoritative. `HomeDashboardCarousel` continues to own the selected range, period
offset, custom range, and sheet-opening handoff. Both views continue to derive their summaries
through the same pure analytics builder.

Changing range or period continues to clear drill-down selection as it does now. Currency
conversion, cached/offline behavior, custom range state, and period picker motion are outside this
calculation and presentation change.

## Accessibility

The month-group axis is supplemental visual context and is hidden from assistive technology. The
figure's existing accessible summary continues to name and value every weekly bucket. Interactive
bars keep their existing listbox semantics, focus treatment, arrow-key behavior, activation, and
focus return.

Range controls and live announcements identify full periods without rolling or elapsed wording.
Complete period start and end dates remain available through the period picker and chart bucket
descriptions.

## Loading, Empty, and Error States

Existing loading, offline, stale-cache, unavailable, and no-expense states remain unchanged. Empty
future portions of a full period render zero-value bars wherever the chart is shown. The detail
sheet still renders the month-group axis for an empty Quarter; the compact carousel keeps its
existing no-expense message instead of rendering a chart.

## Testing

Add or update focused tests that prove:

- Week uses Monday through Sunday across ordinary, month-boundary, and year-boundary dates.
- Current and historical Month, Quarter, and Year periods use complete boundaries.
- Every comparison is the complete immediately preceding calendar period.
- Period options and accessible labels use the same full boundaries.
- Current Week, Month, Quarter, and Year include valid future-dated rows inside their span.
- Current charts contain 7 Week days, every Month day, every Quarter weekly chunk, and all 12 Year
  months.
- Quarter summaries produce the correct three ordered month groups and bucket spans.
- The shared chart renders `—— month ——` groups for Quarter and no grouped row for other ranges.
- Both the carousel and detail sheet pass the quarter groups into the shared chart.
- Rolling/to-date copy is absent while concrete full-period labels remain.
- The transfer-exclusion helper is absent, while transfer rows still do not affect totals.
- Existing custom range, conversion, historical navigation, chart selection, compact drill-down,
  loading, offline, and error tests continue to pass.

Run focused Vitest suites during implementation, then the full test suite, `npm run lint`, and
`npx tsc --noEmit`. Search the changed production files for forbidden `shadow` classes before
completion.

## Out of Scope

This change does not alter transaction queries, exchange-rate conversion, custom range semantics,
category-series ranking, chart colors, period-picker gestures, sheet structure, or transfer
calculation rules. It does not add fiscal calendars, user-configurable week starts, projections, or
proration for future portions of the current period.
