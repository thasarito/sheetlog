# No Big Spending Analytics Mode Design

**Date:** 2026-08-17

## Summary

The analytics detail sheet will gain an icon-only mode that temporarily removes unusually large
expenses from the active analytics view. Users configure one cutoff in Settings, expressed in the
workspace analytics base currency introduced by `feat/multi-currency-analytics`.

The mode applies only while the analytics detail sheet is open. It does not alter the compact home
analytics carousel, transaction data, or the saved cutoff. Closing the detail sheet always turns
the mode off so an exclusion cannot silently remain active on a later visit.

## Goals

- Let users inspect day-to-day spending without large one-off expenses dominating the analytics
  chart and totals.
- Keep the analytics interaction to one icon button with a clear active state and accessible name.
- Configure and persist one reusable cutoff under Settings > Analytics.
- Interpret the cutoff only in the current analytics base currency and apply it after historical
  currency conversion.
- Apply the same exclusion rule to the selected period and its comparison period.
- Keep the compact analytics carousel complete and unfiltered.

## Non-goals

- Automatically detecting outliers.
- Configuring a different cutoff for every transaction currency.
- Persisting whether the mode is on.
- Applying the mode to the compact home carousel or transaction-history sheet.
- Deleting, editing, annotating, or otherwise changing excluded transactions.
- Excluding income, transfers, refunds, or negative expense adjustments.
- Adding a visible excluded-count badge, banner, label, or second analytics control.

## Analytics Interaction

Add one icon button to the analytics detail sheet's existing range-control row. Use Lucide's
`BadgeDollarSign` icon. The control has a minimum 44-by-44-pixel target, no shadow, and no visible
text.
It uses `aria-pressed` to expose state and a selected surface/text treatment to distinguish on from
off without changing layout.

When a cutoff is configured for the current analytics base currency, pressing the icon toggles the
mode immediately. Its accessible label identifies the action and cutoff. When active, the label
also reports how many current-period expenses were excluded, for example:

```text
No big spending mode on; 3 expenses at or above ฿10,000 excluded
```

The excluded count is not rendered as visible UI. The existing analytics live region announces
the recalculated expense summary after a toggle.

When no valid cutoff is configured for the current base currency, pressing the icon leaves the
mode off and shows the existing toast style with `Set a big spending cutoff in Settings.` The
button's accessible label communicates the same requirement.

The mode turns off whenever the analytics detail sheet closes. Opening it again always starts with
complete analytics. Range changes do not turn the mode off while the same sheet remains open.
Existing chart-bucket and category filters clear or recalculate through their current summary-change
behavior.

## Settings Interface

Extend the existing `ANALYTICS` group on the main Settings screen. Keep `Base currency` first, add a
separator, and add a `Big spending cutoff` row beneath it. The row shows the active base-currency
prefix or ISO code next to a decimal numeric input. A blank value means the cutoff is not
configured.

The input uses a local draft so typing does not write on every keystroke. Blur or Enter commits a
trimmed value. A committed value must be finite and greater than zero; otherwise the durable value
is retained and the existing toast style reports `Enter an amount greater than zero.` Clearing the
input removes the configured cutoff. Escape restores the last durable value without saving.

Disable repeat commits while the settings mutation is pending. Use the existing TanStack
onboarding settings query and mutation path so the control updates the query cache, persists
offline, and reconciles with the Google Sheet just like the analytics base currency.

Changing the analytics base currency clears the cutoff in the same settings mutation. This avoids
reinterpreting a value such as `10000 THB` as `10000 USD`. Settings then shows a blank cutoff for
the new base currency, and the analytics icon cannot enable the mode until a new value is saved.

## Persistence Contract

Add one workspace-scoped analytics big-spending setting to local onboarding state and the Google
Sheet `Settings` tab. The durable setting carries:

- one positive decimal amount or no amount;
- the analytics base currency for which that amount was configured; and
- an ISO-8601 update timestamp used by the existing reconciliation flow.

The Google Sheet row uses the recognized key `analyticsBigSpendingThreshold`. Its value stores the
single amount together with its currency stamp. The update column stores the reconciliation
timestamp. A cleared value remains an explicit timestamped tombstone so another device cannot
restore a stale cutoff.

Legacy local records and workbooks without the key default to no configured cutoff. Unknown
Settings rows remain untouched. If a stored threshold's stamped currency differs from the current
analytics base currency, treat it as unconfigured rather than applying it with the wrong unit.

The setting is portable and per Sheet; the mode's pressed state remains component-local and is
never persisted or synchronized.

## Analytics Calculation

Extend the pure analytics builder with an optional big-spending threshold expressed in its
`baseCurrency`. The historical-rate request remains unchanged because every foreign-currency
expense still needs conversion before the builder can decide whether it meets the cutoff.

After all required conversion rates resolve, classify a row as excluded only when all of the
following are true:

1. Its transaction type is `expense`.
2. Its converted amount is positive.
3. Its converted amount is greater than or equal to the configured threshold.

Apply this rule independently to current-period rows and prior comparison-period rows. Use the
remaining rows for expense totals, income, net, comparison percentage, chart buckets, categories,
category shares, bucket transaction IDs, `hasExpenseRows`, and the detail transaction list.
Because the comparison period uses the same cutoff, the comparison remains like-for-like.

Income and transfers remain present according to existing analytics semantics. Negative expense
amounts remain present as refunds or adjustments. Original transaction amounts and currencies are
not modified.

Return the current-period excluded expense count as summary metadata for the icon's accessible
label. The compact carousel continues to use an unfiltered summary built without the optional
threshold.

## Component and Data Flow

`TransactionFlow` passes the current durable cutoff and toast callback into
`HomeDashboardCarousel`. The carousel retains the temporary mode state because it owns the
analytics-sheet open state and both summary inputs. It builds:

- the existing unfiltered summary for `AnalyticsSlide`; and
- a drawer summary using the cutoff only while the mode is active.

`AnalyticsDrawer` receives the controlled mode state, configured cutoff, toggle callback, and
drawer summary. It renders the icon and otherwise consumes the summary through its existing UI.
Closing the drawer clears the controlled mode state before focus returns to the original trigger.

This separation prevents the compact slide and detail sheet from accidentally sharing filtered
results while keeping currency conversion, exclusion, and aggregation in the pure analytics
module.

## Loading and Errors

- Existing history and exchange-rate loading, offline, cached-data, missing-rate, and Retry states
  remain authoritative.
- A foreign-currency row cannot be classified against a base-currency cutoff without a rate, so a
  missing required rate continues to block the complete summary rather than silently include or
  exclude the row.
- A failed settings write follows the existing offline/pending reconciliation behavior and toast
  messaging; it does not enable the mode with an uncommitted cutoff.
- Invalid or currency-mismatched stored settings behave as no configured cutoff.
- Toggling the mode performs no query or mutation. It recomputes from already loaded transaction
  and rate query data.

## Testing

### Pure analytics

- Expenses below the threshold remain included.
- Expenses exactly equal to and above the threshold are excluded.
- Foreign-currency expenses are compared after historical conversion into the base currency.
- The same threshold filters current and comparison periods.
- Income, transfers, negative expense adjustments, and original transaction records remain intact.
- Totals, net, comparison, buckets, categories, shares, transaction IDs, detail rows, and excluded
  count use the filtered population.
- Omitting the threshold preserves existing analytics results exactly.

### Settings and persistence

- Legacy settings default to no cutoff.
- A valid cutoff saves through the TanStack settings mutation and round-trips through IndexedDB
  and the Google Sheet setting row.
- Blank input writes a timestamped clear operation.
- Invalid input does not mutate durable settings.
- Changing the base currency clears the cutoff atomically.
- A threshold stamped with another currency is not applied.
- Offline and conflicting updates follow the existing timestamp reconciliation rules.

### Components and flow

- Analytics renders one icon-only mode control with correct accessible names and `aria-pressed`.
- An unconfigured press leaves the mode off and shows the Settings guidance toast.
- A configured press recalculates every detailed analytics section.
- The icon's accessible label reports the cutoff and excluded count while active.
- Closing and reopening the analytics sheet resets the mode off.
- Range changes retain the active mode within the same open sheet.
- The compact analytics carousel remains unfiltered while the detail sheet is filtered.
- Existing drill-down filters, drawer focus restoration, and mobile carousel gestures remain intact.

Run focused Vitest suites throughout implementation, then the complete test suite,
`npm run lint`, `npx tsc --noEmit`, and the production build.

## Delivery

Develop and publish this feature as a stacked pull request whose base branch is
`feat/multi-currency-analytics`. The stacked branch must contain only this feature's spec, plan,
implementation, and tests beyond that base.
