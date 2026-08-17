# Dense Month Chart Axis Design

## Problem

The Month analytics chart fits 28–31 daily buckets into the same mobile width used by shorter ranges. Its current 4px inter-column gap and 4px horizontal inset on each bar leave the bars nearly invisible. Each date label is also constrained to a single daily column and truncated, so double-digit dates render as ellipses.

## Goals

- Keep one bar per calendar day in Month analytics.
- Make Month bars visibly wider in both the carousel and analytics sheet.
- Keep every x-axis cell aligned one-to-one with its daily bar.
- Show enough date anchors to locate any day while also exposing weekday rhythm.
- Preserve the existing Week, Quarter, Year, and Custom presentations.

## Non-goals

- Do not change analytics periods, aggregation, comparisons, currency conversion, or transfer handling.
- Do not introduce horizontal scrolling or weekly aggregation.
- Do not change Quarter month grouping.

## Shared chart rendering

`AnalyticsBarChart` will receive the selected analytics range from both callers. When the range is `month`, it will use a dense daily presentation:

- 1px gaps between daily columns;
- no horizontal inset inside each daily column, allowing the bar to use the full column width;
- the existing stacked colors, vertical scaling, selection behavior, and rounded bar ends;
- a dedicated single-row x-axis rather than the existing per-column date labels.

The carousel and sheet already share `AnalyticsBarChart`, so the same dense presentation will appear in both without duplicated rendering logic.

## Month axis labels

The Month axis will contain one cell for every daily bucket and use the same gap and flex sizing as the bars above it.

- Days `1`, `8`, `15`, `22`, and `29` display their date number.
- Every other day displays its narrow weekday initial: `M`, `T`, `W`, `T`, `F`, `S`, or `S`.
- Numeric anchors replace the weekday initial in that cell.
- Labels never use truncation or ellipses.

For a month beginning on Monday, the row starts:

`1 T W T F S S 8 T W T F S S 15 …`

For months beginning on another weekday, initials follow the actual local calendar. The pattern still lets a user infer the weekday of each numeric anchor from the adjacent sequence.

The axis is decorative (`aria-hidden`) because interactive bars already expose complete weekday and date labels to assistive technology.

## Other ranges

- Week keeps its existing daily labels and spacing.
- Quarter keeps weekly bars and the grouped line–month–line axis.
- Year keeps month labels.
- Custom keeps its current daily or weekly behavior.

## Testing

- Add chart tests for dense Month gaps, full-width bars, and the exact one-row label sequence using a month that starts on Monday.
- Confirm double-digit anchors render without truncation.
- Confirm Week and Quarter rendering remain unchanged.
- Confirm both `AnalyticsSlide` and `AnalyticsDrawer` pass the active range to the shared chart.
- Extend the mobile carousel E2E check to verify Month bars have useful rendered width and the dense axis has no ellipses.
- Run the focused analytics tests, mobile E2E, full test suite, lint, and TypeScript checks.

## Acceptance criteria

- Month shows one visibly wider bar per day in carousel and sheet.
- Month uses a single aligned axis row with `1`, `8`, `15`, `22`, and `29` anchors and weekday initials elsewhere.
- No Month axis label is truncated.
- Existing analytics behavior and all other range layouts remain unchanged.
