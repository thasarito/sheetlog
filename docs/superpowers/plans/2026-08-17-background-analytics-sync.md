# Background Analytics Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every analytics range render immediately from local data, synchronize full transaction history and required FX rates silently in the background, expose trustworthy sync state plus Resync in Settings, and immediately enqueue FX work after foreign-currency writes.

**Architecture:** `TransactionFlow` owns one persistent `useAnalyticsSync` controller. The controller eagerly reconciles cached/local/remote history, reads FX data from IndexedDB, derives missing month-sized FX chunks, and runs network fills through TanStack Query with concurrency three. `HomeDashboardCarousel` consumes only controller snapshots and never starts network work. Missing-rate rows are omitted from every analytics surface until the indexed resolver can convert them. Settings consumes the same controller for status and a background resync mutation.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Dexie, date-fns, Vitest/Testing Library, Playwright, Biome.

---

## Task 1: Encode FX requirements, bounded lookup, and chunking

**Files:**

- Create: `src/components/TransactionFlow/analyticsSync.ts`
- Create: `src/components/TransactionFlow/analyticsSync.test.ts`
- Modify: `src/components/TransactionFlow/exchangeRates.ts`
- Modify: `src/components/TransactionFlow/exchangeRates.test.ts`

- [ ] **Step 1: Write failing requirement and resolver tests**

Cover these contracts in `analyticsSync.test.ts`:

```ts
it('discovers unique foreign expense and income dates but ignores transfers and base rows', () => {
  expect(buildAnalyticsRateRequirements(records, 'THB')).toEqual([
    { base: 'THB', quote: 'EUR', date: '2026-07-01' },
    { base: 'THB', quote: 'USD', date: '2026-08-17' },
  ]);
});

it('resolves the closest observation within seven calendar days only', () => {
  const resolve = buildHistoricalRateResolver(rates, 'THB');
  expect(resolve('USD', '2026-08-17')).toBe(0.03);
  expect(resolve('EUR', '2026-08-17')).toBeNull();
});

it('groups unresolved requirements by transaction month with stable quote ordering', () => {
  expect(buildAnalyticsRateChunks(requirements)).toEqual([
    {
      key: 'THB:2026-08:EUR,USD:2026-08-03:2026-08-17',
      request: { base: 'THB', quotes: ['EUR', 'USD'], from: '2026-08-03', to: '2026-08-17' },
    },
  ]);
});
```

Also verify invalid dates, non-finite amounts, duplicate requirements, and future transactions do not destabilize sorting or keys.

- [ ] **Step 2: Run the focused tests and confirm they fail for missing exports**

Run: `npx vitest run src/components/TransactionFlow/analyticsSync.test.ts`

Expected: FAIL because `analyticsSync.ts` and its functions do not exist.

- [ ] **Step 3: Implement the pure requirement/index/chunk helpers**

Export exact types and functions:

```ts
export type AnalyticsRateRequirement = {
  base: string;
  quote: string;
  date: string;
};

export type AnalyticsRateChunk = {
  key: string;
  request: HistoricalRateRequest;
};

export function buildAnalyticsRateRequirements(
  transactions: TransactionRecord[],
  baseCurrency: string,
  today?: Date,
): AnalyticsRateRequirement[];

export function buildHistoricalRateResolver(
  rates: ExchangeRateRecord[],
  baseCurrency: string,
): (quote: string, date: string) => number | null;

export function unresolvedAnalyticsRateRequirements(
  requirements: AnalyticsRateRequirement[],
  resolveRate: (quote: string, date: string) => number | null,
): AnalyticsRateRequirement[];

export function buildAnalyticsRateChunks(
  requirements: AnalyticsRateRequirement[],
): AnalyticsRateChunk[];

export function buildAnalyticsRateReadRequest(
  requirements: AnalyticsRateRequirement[],
): HistoricalRateRequest | null;
```

Use sorted arrays plus binary search in the resolver. Reject an observation more than seven calendar days before the transaction date. Chunk by `${base}:${yyyy-MM}`, with `from` seven days before that chunk's earliest unresolved transaction and `to` at its latest date.

- [ ] **Step 4: Make the legacy rate finder use the indexed/bounded semantics**

Add failing coverage in `exchangeRates.test.ts` showing `findHistoricalQuoteRate` returns `null` when the nearest prior observation is eight days old, then implement the bounded check. Keep this compatibility export until all callers migrate.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/components/TransactionFlow/analyticsSync.test.ts src/components/TransactionFlow/exchangeRates.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the pure domain layer**

```bash
git add src/components/TransactionFlow/analyticsSync.ts src/components/TransactionFlow/analyticsSync.test.ts src/components/TransactionFlow/exchangeRates.ts src/components/TransactionFlow/exchangeRates.test.ts
git commit -m "feat: model background analytics rate requirements"
```

## Task 2: Add incremental, concurrency-limited FX backfill

**Files:**

- Modify: `src/components/TransactionFlow/exchangeRates.ts`
- Modify: `src/components/TransactionFlow/exchangeRates.test.ts`
- Modify: `src/components/TransactionFlow/exchangeRateQueries.ts`

- [ ] **Step 1: Write failing loader tests**

Add tests proving:

- cached reads resolve before a delayed online refresh;
- a chunk runner never exceeds three simultaneous fetches;
- each successful chunk writes immediately and calls an `onChunkStored` callback;
- one chunk failure does not discard successful chunks and is returned in a structured result;
- offline execution makes zero network requests.

Use controlled promises rather than timers for the concurrency assertion.

- [ ] **Step 2: Confirm the loader tests fail**

Run: `npx vitest run src/components/TransactionFlow/exchangeRates.test.ts`

Expected: FAIL for the new incremental APIs.

- [ ] **Step 3: Implement separate cache reads and background writes**

Keep `fetchHistoricalRates` as the provider boundary and add:

```ts
export async function readHistoricalRates(
  request: HistoricalRateRequest,
  store: ExchangeRateStore = exchangeRateStore,
): Promise<HistoricalRateData>;

export type HistoricalRateChunkResult = {
  completed: HistoricalRateRequest[];
  failed: Array<{ request: HistoricalRateRequest; error: Error }>;
};

export async function backfillHistoricalRateChunks(
  requests: HistoricalRateRequest[],
  options?: {
    concurrency?: number;
    store?: ExchangeRateStore;
    fetcher?: RateFetcher;
    now?: Date;
    onChunkStored?: (request: HistoricalRateRequest) => void | Promise<void>;
  },
): Promise<HistoricalRateChunkResult>;
```

Use a worker-pool loop capped at `options.concurrency ?? 3`. Fetch and write each request independently. Do not make cached query publication wait for this function.

- [ ] **Step 4: Replace the range-shaped query keys**

In `exchangeRateQueries.ts`, expose stable cache and backfill key builders:

```ts
export const exchangeRateKeys = {
  all: ['exchangeRates'] as const,
  cached: (request: HistoricalRateRequest | null) => /* normalized local read key */,
  backfill: (sheetId: string | null, base: string, chunkKeys: string[]) => /* stable key */,
};
```

Delete `useHistoricalRatesQuery`; the persistent sync hook added next will own both local reads and network work.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/components/TransactionFlow/exchangeRates.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the loader**

```bash
git add src/components/TransactionFlow/exchangeRates.ts src/components/TransactionFlow/exchangeRates.test.ts src/components/TransactionFlow/exchangeRateQueries.ts
git commit -m "perf: fill analytics rates incrementally"
```

## Task 3: Build the persistent analytics sync controller

**Files:**

- Create: `src/components/TransactionFlow/analyticsSyncMetadata.ts`
- Create: `src/components/TransactionFlow/analyticsSyncMetadata.test.ts`
- Create: `src/components/TransactionFlow/useAnalyticsSync.ts`
- Create: `src/components/TransactionFlow/useAnalyticsSync.test.tsx`
- Modify: `src/components/TransactionFlow/useTransactionHistoryQuery.ts`
- Modify: `src/components/TransactionFlow/useTransactionHistoryQuery.test.tsx`

- [ ] **Step 1: Write failing metadata tests**

Define completion metadata scoped by Sheet and base currency:

```ts
export type AnalyticsSyncMetadata = {
  sheetId: string;
  baseCurrency: string;
  historyCapturedAt: string;
  completedAt: string;
};
```

Test key generation, corrupt JSON fallback, scope isolation, read, and write against an injected settings store.

- [ ] **Step 2: Implement metadata persistence in `db.settings`**

Use the key `analytics-sync:${sheetId}:${baseCurrency}` and validate parsed strings before treating the record as complete. This is local sync bookkeeping, not a Google Settings row.

- [ ] **Step 3: Expose local and remote history readiness**

First extend hook tests, then return these fields from `useTransactionHistoryQuery`:

```ts
{
  hasLocalSnapshot: cacheQuery.isSuccess || localQuery.isSuccess,
  remoteStatus: remoteQuery.status,
  remoteFetchedAt: remoteQuery.dataUpdatedAt || undefined,
  remoteError: remoteQuery.error instanceof Error ? remoteQuery.error : null,
}
```

Keep `refresh` as the remote query's `refetch` function. A cached or local snapshot must remain renderable during a failed refresh.

- [ ] **Step 4: Write failing controller tests**

Render `useAnalyticsSync` with a real `QueryClient` and mocked providers/history/rate store. Cover:

- history starts enabled as soon as Sheet, user, and base currency scope exist;
- cached history and cached rates publish before delayed remote promises settle;
- automatic sync fetches only unresolved chunks, never already-resolved requirements;
- chunk writes invalidate/re-read the local rate query so rows appear incrementally;
- no online work is started offline, and reconnect resumes it;
- status precedence is `Offline · waiting`, `Syncing…`, `Incomplete`, then `Synced · <time>`;
- `Synced` is written only after a successful latest history refresh and zero unresolved requirements;
- `resync()` refreshes history and force-fetches every discovered chunk in the refreshed snapshot;
- an automatic or manual sync error leaves local analytics usable;
- a newly inserted foreign row changes requirements and schedules its chunk without awaiting the network.

- [ ] **Step 5: Implement the controller with TanStack Query**

Export a presentation-safe contract:

```ts
export type AnalyticsSyncStatus = 'syncing' | 'synced' | 'incomplete' | 'offline';

export type AnalyticsSyncController = {
  records: TransactionRecord[];
  rates: ExchangeRateRecord[];
  hasLocalHistory: boolean;
  status: AnalyticsSyncStatus;
  lastSyncedAt?: string;
  isResyncing: boolean;
  resync: () => void;
};

export function useAnalyticsSync(baseCurrency: string): AnalyticsSyncController;
```

Implementation rules:

- call `useTransactionHistoryQuery(true)` unconditionally inside the controller;
- derive requirements from all reconciled records with `useMemo`;
- use `useQuery` with `networkMode: 'always'` and infinite staleness for IndexedDB reads;
- use a second `useQuery` for automatic online missing-chunk backfill;
- invalidate only the cached-rate query after each chunk write;
- use `useMutation` for manual resync;
- use refs or query data to prevent identical automatic chunks from looping after a provider returns no observation;
- clear failed-attempt suppression when history, base currency, connectivity, or manual resync changes;
- never throw controller errors into Home rendering.

- [ ] **Step 6: Run controller tests**

Run: `npx vitest run src/components/TransactionFlow/analyticsSyncMetadata.test.ts src/components/TransactionFlow/useTransactionHistoryQuery.test.tsx src/components/TransactionFlow/useAnalyticsSync.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the controller**

```bash
git add src/components/TransactionFlow/analyticsSyncMetadata.ts src/components/TransactionFlow/analyticsSyncMetadata.test.ts src/components/TransactionFlow/useAnalyticsSync.ts src/components/TransactionFlow/useAnalyticsSync.test.tsx src/components/TransactionFlow/useTransactionHistoryQuery.ts src/components/TransactionFlow/useTransactionHistoryQuery.test.tsx
git commit -m "feat: sync analytics data in the background"
```

## Task 4: Make analytics cache-only and silently partial

**Files:**

- Modify: `src/components/TransactionFlow/analytics.ts`
- Modify: `src/components/TransactionFlow/analytics.test.ts`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

- [ ] **Step 1: Replace missing-rate expectations with silent filtering**

Change the existing failing analytics test to assert:

```ts
expect(result.status).toBe('ready');
if (result.status !== 'ready') throw new Error('Expected ready analytics');
expect(result.summary.expenseTotal).toBe(baseCurrencyOnlyAmount);
expect(result.summary.transactions.map(({ id }) => id)).toEqual(['resolved-base-row']);
expect(result.summary.buckets.flatMap(({ transactionIds }) => transactionIds))
  .not.toContain('unresolved-foreign-row');
```

Add combined current/comparison, income, categories, selected bucket, and big-spending cases to ensure an unresolved foreign row is absent everywhere. Add a rerender test where inserting the matching cached rate makes it reappear.

- [ ] **Step 2: Confirm the summary tests fail under all-or-nothing behavior**

Run: `npx vitest run src/components/TransactionFlow/analytics.test.ts`

Expected: FAIL because the current builder returns `missing-rates`.

- [ ] **Step 3: Filter unresolved rows before every summary calculation**

Use `buildHistoricalRateResolver` once per build. Define `hasUsableRate(row)` and filter both current and comparison rows before thresholds, totals, series, buckets, categories, `convertedAmounts`, and `transactions`. Base-currency rows and transfers retain existing behavior. Keep the `{ status: 'ready', summary }` shape for compatibility, but remove `MissingAnalyticsRate`, the `missing-rates` variant, `getAnalyticsRateRequest`, and its tests.

- [ ] **Step 4: Refactor Home to consume controller snapshots only**

Change props to include:

```ts
analyticsSync: Pick<
  AnalyticsSyncController,
  'records' | 'rates' | 'hasLocalHistory' | 'lastSyncedAt'
>;
```

Delete `historyActivated`, `useTransactionHistoryQuery`, `getAnalyticsRateRequest`, `useHistoricalRatesQuery`, and all range-driven loading/error logic. A range change must only recompute `buildAnalyticsPeriodOptions` and `buildAnalyticsSummary` from `analyticsSync.records` and `analyticsSync.rates`. Use a local-history loading state only before the first IndexedDB read; never show an FX-specific error.

- [ ] **Step 5: Remove unavailable-rate UI**

Remove the `missingRate` prop and branches from `AnalyticsSlide` and `AnalyticsDrawer`. Preserve the existing empty state for a period whose only contributing rows are currently unresolved. Do not add an exclusion label, badge, toast, or count.

- [ ] **Step 6: Prove range selection performs no FX I/O**

Refactor `HomeDashboardCarousel.test.tsx` to pass controller data rather than mock data hooks. Assert W/M/Q/Y/C clicks do not call history or FX request functions and that each selection renders synchronously from the supplied snapshot.

- [ ] **Step 7: Run focused UI tests**

Run: `npx vitest run src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the cache-only analytics UI**

```bash
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "perf: render analytics from local snapshots"
```

## Task 5: Mount sync globally and keep transaction saves non-blocking

**Files:**

- Modify: `src/components/TransactionFlow/index.tsx`
- Modify: `src/components/TransactionFlow/useAddTransactionMutation.ts`
- Modify: `src/components/TransactionFlow/useAddTransactionMutation.test.tsx`
- Modify: `src/components/TransactionFlow/useUpdateTransactionMutation.ts`
- Modify: `src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx`
- Modify: `src/components/TransactionFlow/useCreateReimbursementMutation.ts`
- Modify: `src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`

- [ ] **Step 1: Mount one persistent controller**

Immediately after onboarding scope is available:

```ts
const analyticsSync = useAnalyticsSync(onboarding.analyticsBaseCurrency);
```

Pass the same object to `HomeDashboardCarousel` and `Header`. It stays mounted through transaction logging, editing, reimbursement, drawers, and carousel navigation.

- [ ] **Step 2: Add failing mutation timing/invalidation tests**

For add, update, and reimbursement, make an active remote history query return a controlled unresolved promise. Assert each mutation resolves after the local write and does not await that remote refetch. Assert local/history cache invalidation still occurs so the controller observes the new currency/date immediately.

- [ ] **Step 3: Make history invalidation local-first and non-blocking**

Invalidate active local/cache history queries in the awaited mutation cleanup. Mark remote history stale without refetching it as part of the mutation:

```ts
await queryClient.invalidateQueries({
  queryKey: transactionQueryKeys.history,
  refetchType: 'none',
});
```

The always-mounted controller's requirements react to Dexie/live-query publication, which immediately starts the foreign-rate backfill. A slow Frankfurter request is never part of the mutation promise.

- [ ] **Step 4: Run mutation tests**

Run: `npx vitest run src/components/TransactionFlow/useAddTransactionMutation.test.tsx src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the app integration**

```bash
git add src/components/TransactionFlow/index.tsx src/components/TransactionFlow/useAddTransactionMutation.ts src/components/TransactionFlow/useAddTransactionMutation.test.tsx src/components/TransactionFlow/useUpdateTransactionMutation.ts src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx src/components/TransactionFlow/useCreateReimbursementMutation.ts src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx
git commit -m "feat: enqueue analytics sync after transaction writes"
```

## Task 6: Add Settings sync status and Resync

**Files:**

- Create: `src/components/AnalyticsSyncSetting.tsx`
- Create: `src/components/AnalyticsSyncSetting.test.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/SettingsDrawer.tsx`
- Modify: `src/components/SettingsDrawer.test.tsx`

- [ ] **Step 1: Write failing presentation tests**

Cover exact visible copy:

- `Syncing…`
- `Synced · <localized short time>`
- `Incomplete`
- `Offline · waiting`

Assert the `Resync` button calls the controller, remains non-modal, disables only while its own mutation is pending, and has an accessible busy state. Assert no unavailable-rate or excluded-transaction wording is present.

- [ ] **Step 2: Implement the row without shadows**

Place `AnalyticsSyncSetting` after base currency and before big-spending cutoff in the Analytics settings group. Use the existing `RefreshCw` icon and the same border/background/typography language as adjacent settings rows. Do not use any `shadow*` class.

- [ ] **Step 3: Thread controller props through Header and Settings**

Require `analyticsSync` whenever Settings is rendered, and pass `status`, `lastSyncedAt`, `isResyncing`, and `resync` through without creating a second sync hook.

- [ ] **Step 4: Run Settings tests**

Run: `npx vitest run src/components/AnalyticsSyncSetting.test.tsx src/components/SettingsDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Settings status**

```bash
git add src/components/AnalyticsSyncSetting.tsx src/components/AnalyticsSyncSetting.test.tsx src/components/Header.tsx src/components/SettingsDrawer.tsx src/components/SettingsDrawer.test.tsx
git commit -m "feat: show analytics sync status in settings"
```

## Task 7: Browser contract and regression benchmarks

**Files:**

- Modify: `e2e/home-carousel.spec.ts`
- Create: `scripts/benchmark-analytics.mjs`
- Create: `docs/benchmarks/2026-08-17-background-analytics-sync.md`

- [ ] **Step 1: Write the failing browser scenario**

Use a 1,208-row mocked Sheet snapshot, delay history and Frankfurter routes, and assert:

1. Home remains usable while background requests are pending.
2. Settings shows `Syncing…`, and Resync does not close or freeze it.
3. An unresolved foreign row is absent from totals and transaction details.
4. Fulfilling its FX response makes the row appear without reopening analytics.
5. Clicking W/M/Q/Y/C after warm local publication creates zero additional Frankfurter requests.
6. Completing all work shows `Synced · <time>`.

- [ ] **Step 2: Run the browser test and confirm it initially fails**

Run: `npx playwright test e2e/home-carousel.spec.ts --project=chromium`

Expected: FAIL until route expectations and controller integration are complete.

- [ ] **Step 3: Finish route fixtures and make the browser contract pass**

Reuse existing mock authentication/Sheet helpers. Keep assertions on accessible roles/text, not implementation selectors. Ensure all controlled promises/routes are released in cleanup.

- [ ] **Step 4: Add a repeatable benchmark script**

The script must generate the same deterministic 1,208-row dataset as baseline, report click-to-ready for W/M/Q/Y/C, count Frankfurter requests after initial background sync, and run a pure 50,000-row summary benchmark. It exits nonzero if:

- any warm range selection issues a Frankfurter request;
- median click-to-ready exceeds 250 ms;
- 50,000-row summary CPU time regresses above the recorded pre-change result for that range.

- [ ] **Step 5: Run the benchmark and record before/after evidence**

Run: `node scripts/benchmark-analytics.mjs`

Record the baseline values from the design spec and the new values in `docs/benchmarks/2026-08-17-background-analytics-sync.md`, including hardware/browser, dataset, request counts, and exact command.

- [ ] **Step 6: Commit browser coverage and benchmark evidence**

```bash
git add e2e/home-carousel.spec.ts scripts/benchmark-analytics.mjs docs/benchmarks/2026-08-17-background-analytics-sync.md
git commit -m "test: benchmark background analytics sync"
```

## Task 8: Full verification, review, PR, CI, and merge

**Files:**

- Review all files changed since `origin/main`

- [ ] **Step 1: Run repository verification from a clean command state**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test
```

Expected: every command exits 0. If a command fails, fix the root cause and rerun that command plus the relevant focused suite before continuing.

- [ ] **Step 2: Check engineering constraints and diff hygiene**

```bash
rg -n "shadow" src/components/AnalyticsSyncSetting.tsx src/components/SettingsDrawer.tsx
git diff --check origin/main...HEAD
git status --short
```

Expected: no new shadow usage, no whitespace errors, no unintended generated artifacts, and only planned changes.

- [ ] **Step 3: Request independent code review**

Ask a reviewer subagent to compare `origin/main...HEAD` against the approved design, focusing on network/render decoupling, query loops, stale completion metadata, missing-rate filtering, mutation latency, and test gaps. Address every confirmed high/medium issue and rerun affected tests.

- [ ] **Step 4: Rebase onto current origin/main and reverify**

```bash
git fetch origin
git rebase origin/main
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Run the Chromium browser contract again after the rebase.

- [ ] **Step 5: Push and create a ready PR**

Push `perf/analytics-range-loading`, open a non-draft PR summarizing the root cause, architecture, user-visible behavior, before/after benchmark table, and verification commands. Do not claim CI success before GitHub reports it.

- [ ] **Step 6: Watch all required CI checks to completion**

If a check fails, inspect its job log, reproduce locally when possible, implement the smallest root-cause fix, rerun local verification, push, and watch the new run. Continue until every required check passes.

- [ ] **Step 7: Merge and verify the remote result**

Merge using the repository's allowed strategy, confirm the PR state is `MERGED`, confirm the merge commit is reachable from `origin/main`, and report the PR link, merge commit, CI result, and benchmark delta.
