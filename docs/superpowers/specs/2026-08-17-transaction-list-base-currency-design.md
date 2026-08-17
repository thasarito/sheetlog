# Transaction-List Base-Currency Subline Design

**Date:** 2026-08-17

## Summary

Every transaction list will keep the recorded amount as its primary, authoritative value. When a
transaction was recorded in a currency other than the workspace analytics base currency, the row
will add one quiet, right-aligned approximation beneath it, for example `≈ −฿100.00`.

The approximation uses the same historical Frankfurter reference-rate data, IndexedDB cache, and
closest-prior-date lookup as multi-currency analytics. It is display-only: the saved transaction,
Google Sheet, editing flow, and recorded amount remain unchanged.

## Goals

- Make foreign-currency transactions immediately understandable in the selected base currency.
- Show the same treatment in Home > Recent, the full Transactions sheet, and the Analytics sheet.
- Preserve the original amount as the visually dominant and authoritative value.
- Reuse the existing TanStack Query and IndexedDB historical-rate path.
- Continue working from cached rates while offline.
- Clearly distinguish a missing conversion from a base-currency transaction.

## Non-goals

- Replacing, rewriting, or persisting a converted transaction amount.
- Displaying the provider name, exchange-rate equation, fee, card settlement amount, or rate date
  inside transaction rows.
- Adding a pill, badge, `Base` label, disclosure control, or per-row Retry action.
- Changing analytics totals, charts, filters, or their existing missing-rate behavior.
- Showing a second line for transactions already recorded in the base currency.
- Claiming that a daily reference rate equals the rate used by a bank or card network.

## Surfaces and Row Presentation

Apply the treatment to all three transaction-list surfaces:

1. Home carousel > Recent.
2. The full Transactions drawer opened by `View all`.
3. The transaction section inside the Analytics drawer, including filtered drill-down lists.

The right-hand amount column becomes a right-aligned vertical stack. The recorded amount remains
first, with its current sign, color, weight, currency symbol/code, and precision. A foreign-currency
row adds a smaller muted line below it:

```text
−$3.00
≈ −฿100.00
```

Income and transfer rows keep their positive sign on both lines. Expense rows use the existing
minus sign on both lines. The approximation contains no branch glyph, chip, label, provider, or
visible rate. Base-currency rows remain single-line and do not reserve blank second-line space.

The row remains one button with the same editability, focus, active, pending, error, and read-only
behavior. No `shadow` utility or visual shadow is introduced. The full Transactions virtual list
continues to measure real row heights so foreign rows may be slightly taller without overlapping
the following item.

## Formatting and Conversion Semantics

For a valid foreign-currency row:

1. Resolve the transaction's local calendar date using the existing date parser.
2. Find the latest historical rate whose date is on or before that transaction date.
3. Treat the Frankfurter row as `1 base currency = rate × recorded currency`.
4. Calculate `base amount = recorded amount / rate`.
5. Round only for display and render exactly two fractional digits.

Use `฿` for THB, `$` for USD, and the three-letter ISO code plus a separating space for other
currencies, matching the transaction-list convention. The visible approximation starts with `≈`
because it is a daily reference-rate estimate rather than a settled payment amount.

The conversion helper returns values only for foreign-currency rows with a finite amount, valid
date, and positive historical rate. It never mutates `TransactionRecord`. Base-currency rows do not
need a lookup and never receive an approximate subline.

## Rate Request and Data Flow

Add a small pure transaction-list conversion module shared by Recent and the full Transactions
drawer. It will:

- collect unique foreign currencies from the supplied rows;
- find the earliest and latest valid transaction dates;
- request the range from seven calendar days before the earliest date through the latest date, so
  weekends and market holidays can use the closest earlier published rate;
- build a map from transaction ID to converted base amount; and
- identify foreign rows that are still loading or cannot be converted.

The module will use the existing `useHistoricalRatesQuery` TanStack Query hook. That hook already
loads from the IndexedDB exchange-rate store, refreshes from Frankfurter when online, retains cached
data if refresh fails, and avoids retries that would generate request storms.

Data ownership follows each list's existing source:

- `TopDashboard` receives `baseCurrency`, creates a bounded request from its reconciled Recent rows,
  and passes per-row conversion state into its existing row markup.
- `TransactionHistoryDrawer` receives `baseCurrency`, creates a request from the loaded/filtered
  history records, and passes per-row conversion state into `TransactionHistoryRow`. Searching may
  narrow rendering, but the rate request remains based on the drawer's loaded records so search
  keystrokes do not create new query keys or network requests.
- `AnalyticsDrawer` does not create a duplicate rate query. Extend the existing analytics request
  to include foreign currencies used by every current-period display row, including transfers,
  while keeping the comparison request limited to rows that affect analytics. Extend
  `AnalyticsSummary.convertedAmounts` with every successfully resolved current-period row and pass
  those values plus `baseCurrency` to `TransactionHistoryRow`.

`TransactionHistoryRow` remains presentational. It receives optional base-currency display state
and never fetches data itself. This keeps virtualized rows free of per-row queries and guarantees
that every rendered row in a surface uses one shared rate result.

Changing the base currency changes the TanStack Query key and recomputes the map. Recorded amounts
remain stable while the new approximations load.

## Loading, Offline, and Missing Rates

A foreign-currency row always reveals that a second value is expected:

- While the rate query is pending, render a short muted skeleton in the second-line position.
- When cached data contains the needed rate, render the approximation immediately, including while
  offline or while an online refresh fails.
- When loading has finished but no usable rate exists, render a quiet currency-aware placeholder,
  such as `≈ ฿—`, rather than silently making the row look like a base-currency transaction.
- A missing or failed list conversion never blocks scrolling, searching, editing, or opening a row.
- No provider error text or nested Retry control appears inside the row.

The Analytics drawer keeps its existing all-or-nothing summary state when a rate required for a
chart or total is missing. A display-only transfer rate does not block the summary; if it is absent,
that transfer row uses the same unavailable placeholder as another list. Once a ready or retained
summary is rendering transaction rows, each visible foreign row uses that summary's corresponding
converted amount.

## Accessibility

The visible line may use symbols, but the row's accessible name will append a spoken phrase after
the recorded amount, for example `approximately minus 100.00 THB`. Loading conversions are omitted
from the accessible name. An unresolved foreign conversion adds `base amount unavailable in THB`.

The approximation is not a separate focus target. Existing button semantics, disabled state,
keyboard activation, focus rings, and drawer focus restoration remain unchanged.

## Testing

### Pure conversion and formatting

- Build no request when all rows already use the base currency.
- Deduplicate currencies and cover the earliest-to-latest date range with a seven-day lookback.
- Ignore invalid dates without expanding the request.
- Convert with the base-to-quote division rule and closest-prior-date lookup.
- Preserve finite source amounts without mutating source records.
- Report missing rates separately from base-currency rows.
- Format THB, USD, and another ISO currency with exactly two decimals and the correct transaction
  sign.

### Components

- A base-currency row remains single-line.
- A foreign row renders the muted approximate amount beneath the recorded amount.
- Expense, income, and transfer signs match across both lines.
- Pending, unavailable, and cached conversion states render correctly.
- Accessible names speak the approximation or its unavailable state.
- Selection, disabled/read-only behavior, sync statuses, and original amount styling stay intact.

### Surface integration

- Home Recent requests and displays conversions using the selected base currency.
- The full Transactions drawer displays conversions and does not change its rate request while the
  user searches.
- The Analytics drawer uses `summary.convertedAmounts` without issuing a second query, includes
  foreign transfer rates for display, and does not let a missing transfer-only rate block totals.
- Changing the base currency removes same-currency sublines and recomputes newly foreign rows.
- Cached rates continue to display offline; missing cached rates show the placeholder.
- Virtualized full-history rows remain correctly measured after conversion state resolves.

Run focused Vitest suites while implementing, then the full test suite, `npm run lint`,
`npx tsc --noEmit`, the production build, and the relevant mobile Playwright flow.

## Delivery

Commit the design, plan, implementation, and tests on top of the current `origin/main`. Rebase once
more immediately before publishing, rerun verification if the rebase changes the tree, push the
result directly to `origin/main`, and use `gh` to confirm the resulting commit and CI conclusion.
