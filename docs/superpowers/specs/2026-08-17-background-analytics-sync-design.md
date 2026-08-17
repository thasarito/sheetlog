# Background Analytics Sync Design

## Summary

SheetLog will prepare transaction history and foreign-exchange data continuously in the
background so opening Analytics or changing `W`, `M`, `Q`, `Y`, or `C` never starts a network
request. Home and Settings remain interactive while synchronization runs.

Analytics will render from locally available data. A transaction that requires an unavailable
FX rate is silently omitted from totals, comparisons, bars, categories, and transaction lists.
When its rate arrives, the transaction appears automatically without user action.

Settings will expose the combined analytics synchronization state and a non-blocking `Resync`
action. A foreign-currency transaction create or edit will immediately enqueue its required rate
without delaying the transaction mutation.

## Baseline and Root Cause

Three independent read-only benchmarks were run at commit `82c5578`.

The browser benchmark used 1,208 transactions spanning January 2025 through August 2026, with
594 USD expenses and THB as the base currency:

| Range | Click to ready | Loading duration | Frankfurter duration |
| --- | ---: | ---: | ---: |
| Week | 1,613 ms | 1,118 ms | 776 ms |
| Month | 1,592 ms | 1,537 ms | 1,470 ms |
| Quarter | 1,221 ms | 1,162 ms | 1,074 ms |
| Year | 4,760 ms | 4,714 ms | 4,557 ms |
| Custom, 19.5 months | 9,571 ms | 9,499 ms | 9,084 ms |

A warm Week revisit took 84 ms and made no request. At 50,000 synthetic transactions, the pure
analytics pipeline took about 120–240 ms median depending on range. Network waiting therefore
dominates normal histories, while repeated full-history scans become a secondary concern only at
very large histories.

The current range-dependent query has three compounding behaviors:

1. Each range produces a distinct TanStack Query key containing its period bounds.
2. A new key has no in-memory data, even when IndexedDB already holds useful rates.
3. The online loader reads IndexedDB but withholds those rows until a full network refresh and
   write finish.

Range selection therefore controls network work and replaces usable analytics with a loading
skeleton. The new design removes that dependency.

## Goals

- Render Home immediately; neither history synchronization nor FX synchronization may gate its
  first useful render.
- Start full transaction-history synchronization after an authenticated Sheet scope is available,
  without waiting for the user to open Analytics.
- Fill missing FX rates continuously from cached and newly downloaded history.
- Start a background lookup immediately after a foreign-currency transaction is created or its
  currency/date is edited.
- Make all analytics range changes local-only operations.
- Render correct partial analytics by silently excluding unresolved foreign-currency rows.
- Update visible analytics automatically as rates become available.
- Show the combined history/FX state and a manual `Resync` action in Settings.
- Preserve account and Sheet scoping, offline behavior, and TanStack Query ownership of server
  synchronization.

## Non-goals

- Do not make transaction creation or editing wait for an FX request.
- Do not prefetch five range-specific requests.
- Do not issue one unbounded request covering the entire transaction history.
- Do not display an exclusion label, warning, or count inside Analytics.
- Do not approximate a missing conversion or mix unconverted amounts into base-currency totals.
- Do not change Week, Month, Quarter, Year, or Custom calendar semantics.

## Architecture

### One persistent analytics synchronization owner

A synchronization hook mounted at the `TransactionFlow` root will own the background process for
the active verified account, Sheet, and analytics base currency. It remains mounted while the user
moves between Home and transaction-entry steps.

The hook will expose a small state contract:

- locally available reconciled transaction history;
- locally available rates for the active base currency;
- `syncing`, `synced`, `incomplete`, or `offline` status;
- the last successful combined synchronization time;
- a `resync()` action.

HomeDashboardCarousel will consume local history and rates from this owner. Header will pass the
status and action into SettingsDrawer. Range state remains owned by HomeDashboardCarousel.

### Non-blocking full-history synchronization

The existing transaction-history queries will be enabled as soon as the authenticated Sheet scope
exists. IndexedDB and local pending/error transactions will publish first. The Google Sheet
snapshot refresh will continue in the background.

Home rendering will not depend on `history.isLoading`, `history.isDownloading`, or remote
completion. Analytics can render from the locally reconciled subset while more history arrives.
The combined state cannot become `synced` until the remote history refresh for the current manual
or automatic run has completed successfully.

### Transaction-driven FX requirements

FX work will be derived from real transaction requirements rather than selected analytics periods.
A requirement is the tuple:

```text
base currency + transaction currency + local transaction date
```

Only valid expense and income rows whose currency differs from the analytics base currency create
requirements. Transfers do not contribute to analytics and create no FX work.

Requirements come from two sources:

1. the complete locally reconciled history; and
2. the record returned by a successful local create or update mutation.

The second source invalidates or wakes the same background query immediately. It applies to normal
transactions and reimbursements. Mutation success is independent of rate-fetch success.

### Local resolution and bounded fetch chunks

The synchronizer first reads cached rates from IndexedDB. A transaction date is locally resolvable
when the cache contains a valid rate for the same quote on that date or within the preceding seven
calendar days. This accommodates weekends and market holidays without accepting arbitrarily old
observations.

Unresolved requirements are grouped by transaction calendar month. Each request contains only the
quotes needed in that month and spans from seven days before the earliest unresolved date through
the latest unresolved date. Requests are bounded to at most one transaction month plus the
lookback. At most three chunks run concurrently, preventing both a long serial queue and an
uncontrolled burst against Frankfurter.

Each completed chunk is validated and written to IndexedDB immediately. The local-rates query is
then invalidated so Analytics and Settings re-evaluate incrementally. Duplicate requirements and
overlapping work share TanStack Query keys and do not start duplicate requests.

Automatic runs fetch only unresolved requirements. Manual `Resync` first refreshes the Sheet
history and then force-refreshes all currently required chunks, still with bounded concurrency.

### Range-local analytics

`W`, `M`, `Q`, `Y`, and applied `C` selections will never call a fetch function or enable a new
network query. They synchronously select rows from the locally reconciled history and convert them
using the current local-rate snapshot.

Summary construction will partition relevant rows into resolvable and unresolved rows. Unresolved
foreign rows are omitted before computing:

- current and comparison totals;
- percentage comparisons;
- positive and negative bar segments;
- category shares;
- selected-bucket details;
- drawer transaction groups.

The UI exposes no missing-rate label or count. When a local-rate invalidation makes an omitted row
resolvable, the same selected range recomputes and includes it automatically.

Range changes also stop constructing a range-shaped FX request, removing the current duplicate
full-history scan. Summary conversion will build one per-quote sorted rate index and memoize each
currency/date resolution instead of linearly scanning every cached rate for every foreign row.
Bucket construction remains unchanged unless the repeated benchmark proves it is needed to meet
the stated threshold.

## Settings Experience

The existing Analytics group in Settings gains a `Currency data` row beneath the base-currency and
big-spending controls. It uses the existing settings-row visual language and does not introduce a
shadow.

The detail text has four states:

- `Syncing…` — a Sheet history refresh or FX chunk is active;
- `Synced · <time>` — the latest Sheet history refresh succeeded and every discovered requirement
  is locally resolvable;
- `Incomplete` — the run finished or failed with one or more unresolved requirements;
- `Offline · waiting` — current history freshness or unresolved work cannot be confirmed offline.

The row includes a `Resync` button. Pressing it starts the combined history-then-FX process in the
background, sets `aria-busy` while active, and never closes or blocks Settings. The button is
disabled while the same manual run is active and while offline.

The last successful combined completion time is stored locally under the active Sheet/base-currency
scope so the Settings detail survives reloads. Changing base currency starts a new scoped
evaluation and cannot reuse an incompatible completion marker.

## Status Rules

Status precedence is deterministic:

1. `offline` when connectivity is unavailable and current completeness cannot be verified;
2. `syncing` while remote history or any FX chunk for the active run is pending;
3. `incomplete` after an attempted run has an error or unresolved requirement;
4. `synced` only after the current Sheet snapshot succeeds and all requirements resolve locally.

When a Sheet, account, or base currency changes, prior in-memory status is discarded and the new
scope begins independently. Generic historical FX rows may remain cached because rates contain no
transaction data, but completion metadata is scope-specific.

## Failure and Offline Behavior

- A Google history failure leaves locally cached history usable and sets Settings to `Incomplete`.
- A Frankfurter failure leaves already resolvable rows usable and sets Settings to `Incomplete`.
- An unsupported or persistently unavailable rate keeps its transaction silently excluded.
- Going offline never deletes cached history or rates. Missing work remains derivable and retries
  after connectivity returns.
- Creating or editing a foreign transaction offline succeeds according to the existing transaction
  queue. Its FX requirement is picked up from local history and fetched after reconnect.
- Manual Resync does not clear good cached data before attempting refresh.

## Performance Requirements

The post-change benchmark will reuse the exact baseline fixtures and measurement boundaries.

- Home must become interactive without waiting for history or FX network responses.
- Once local history is available, each range switch must issue zero Frankfurter requests.
- A range switch with 1,208 benchmark rows must become ready within 250 ms locally.
- The 50,000-row CPU benchmark must not regress beyond its baseline median for any range.
- A populated IndexedDB cache must publish before a controlled 120 ms refresh completes.
- A newly saved foreign transaction must enqueue background FX work without extending the awaited
  transaction mutation by the simulated FX delay.

The PR will report the original browser table, the post-change browser table, request counts, the
50,000-row CPU medians, and Settings/manual-resync behavior.

## Test Strategy

### Unit tests

- Derive and deduplicate FX requirements from expense/income history while excluding transfers and
  base-currency rows.
- Mark exact-date and preceding-seven-day cached observations as resolved.
- Group unresolved requirements into bounded monthly chunks with the expected quotes and ranges.
- Filter unresolved rows consistently from current totals, comparison totals, buckets, categories,
  and drawer transactions.
- Resolve repeated currency/date pairs through one indexed lookup rather than repeated full-array
  scans.
- Transition combined status through syncing, synced, incomplete, offline, and scope changes.

### Hook and component tests

- Publish cached history and rates before delayed remote work finishes.
- Start eager history synchronization without gating Home.
- Ensure range changes perform no FX query or fetch.
- Invalidate background requirements after foreign creates, reimbursements, and currency/date edits;
  base-currency-only mutations create no FX request.
- Update a visible summary when a newly cached rate resolves an omitted row.
- Render Settings status and timestamp, disable Resync under the defined conditions, and verify a
  click runs history before forced FX refresh.

### Browser regression and re-benchmark

A Mobile Chrome scenario will delay both Google-history and Frankfurter responses, assert that Home
and Settings remain usable, and verify that analytics range changes make zero network requests.
It will confirm that a foreign row is absent before its rate arrives and present afterward, then
exercise Settings Resync and wait for `Synced`.

The read-only Playwright CLI benchmark will be repeated with the original 1,208-row fixture. The
same CPU harness will be repeated at 1,000, 10,000, and 50,000 rows.

## Rollout

The change requires no server deployment, Google Sheet schema change, or user migration. Existing
rate rows remain valid. Local completion metadata is additive. The Cloudflare Pages preview check
must pass before merge.
