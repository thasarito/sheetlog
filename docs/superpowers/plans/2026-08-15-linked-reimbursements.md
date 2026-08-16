# Linked Reimbursements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a positive expense create, track, edit, sync, and exactly undo one or more linked reimbursement income transactions without mutating the source expense.

**Architecture:** Add an optional source-transaction ID to the local/Sheet row model, keep reimbursement arithmetic in a pure domain module, and expose remote summaries and local queue state through TanStack Query. A discriminated transaction-flow mode owns a separate reimbursement form, while the existing provider and offline queue remain the single write path with reimbursement-specific sync revalidation.

**Tech Stack:** React 18, TypeScript, TanStack Query/Form, Dexie, Google Sheets API, Zod, Vitest, Testing Library, Playwright.

---

## File structure

- Modify `src/lib/types.ts`: optional reimbursement relation and Sheet-row validity metadata.
- Create `src/lib/transactionRows.ts`: A:L serialization and parsing.
- Create `src/lib/transactionRows.test.ts`: legacy/new row round trips and malformed-row checks.
- Create `src/lib/reimbursements.ts`: pure eligibility, ledger summary, and validation.
- Create `src/lib/reimbursements.test.ts`: confirmed/queued/dedupe/signed/currency/overage tests.
- Modify `src/lib/google.ts`: A:L I/O, L1 upgrade, linked-row batch read, and source-by-ID fetch.
- Create `src/lib/googleTransactions.test.ts`: exact Sheets requests and responses.
- Modify `src/lib/mock/mockGoogle.ts`: matching mock APIs.
- Modify `src/lib/sync.ts`: linked-child source ordering and online revalidation.
- Create `src/lib/sync.test.ts`: offline queue/dedupe/stale/source-state sync tests.
- Create `src/components/TransactionFlow/transactionQueryKeys.ts`: shared cache keys.
- Create `src/components/TransactionFlow/useLocalTransactionsQuery.ts`: reactive pending/error Dexie rows.
- Create `src/components/TransactionFlow/useLocalTransactionsQuery.test.tsx`: local query behavior.
- Create `src/components/TransactionFlow/useReimbursementSummary.ts`: remote query plus local summary.
- Create `src/components/TransactionFlow/useReimbursementSummary.test.tsx`: online/offline/cache/error behavior.
- Create `src/components/TransactionFlow/useTransactionByIdQuery.ts`: source resolution outside recent rows.
- Create `src/components/TransactionFlow/useTransactionByIdQuery.test.tsx`: local/remote/missing-source behavior.
- Modify `src/app/providers/transactions/TransactionsContext.tsx`: return created records and exact delete contract.
- Modify `src/app/providers/transactions/TransactionsProvider.tsx`: cache invalidation, robust delete/undo, and error retry/delete.
- Create `src/app/providers/transactions/TransactionsProvider.test.tsx`: provider mutation reliability.
- Modify `src/components/TransactionFlow/useAddTransactionMutation.ts`, `useUpdateTransactionMutation.ts`, and `useDeleteTransactionMutation.ts`: returned record and consistent invalidation.
- Create `src/components/TransactionFlow/useCreateReimbursementMutation.ts`: derived linked-income mutation.
- Create `src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`: locked fields and cap.
- Modify `src/components/TransactionFlow/transactionSchema.ts`: strict finite amount parsing.
- Create `src/components/TransactionFlow/transactionSchema.test.ts`: blank/prefix/non-finite validation.
- Modify `src/components/CurrencyPicker.tsx`, `src/components/Keypad.tsx`, and `src/components/TransactionFlow/StepAmount.tsx`: opt-in locks and middle action slot.
- Modify `src/components/TransactionFlow/StepAmount.test.tsx`: reimbursement control contracts.
- Create `src/components/TransactionFlow/ReimbursementAction.tsx`: balance/action UI.
- Create `src/components/TransactionFlow/ReimbursementAction.test.tsx`: checking/error/offline/full/overage states.
- Modify `src/components/TransactionFlow/StepReceipt.tsx`: reimbursement copy and persistent receipt.
- Create `src/components/TransactionFlow/StepReceipt.test.tsx`: receipt copy/action tests.
- Create `src/components/TransactionFlow/flowMode.ts`: explicit create/edit/reimburse mode.
- Create `src/components/TransactionFlow/flowMode.test.ts`: eligibility and locked-field helpers.
- Modify `src/components/TransactionFlow/TopDashboard.tsx`: pending plus error rows from TanStack Query.
- Create `src/components/TransactionFlow/TopDashboard.test.tsx`: local/remote dedupe and error visibility.
- Modify `src/components/TransactionFlow/index.tsx`: reimbursement mode, separate form, linked edits, and exact receipt undo.
- Create `src/components/TransactionFlow/TransactionFlow.test.tsx`: end-to-end component flow.
- Create `e2e/transaction-flow.spec.ts`: mock-mode mobile reimbursement smoke test.

### Task 1: Row model and pure reimbursement domain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/test/setup.ts`
- Modify: `src/lib/types.ts`
- Create: `src/lib/transactionRows.ts`
- Create: `src/lib/transactionRows.test.ts`
- Create: `src/lib/reimbursements.ts`
- Create: `src/lib/reimbursements.test.ts`

- [ ] **Step 1: Add IndexedDB support to the test environment**

Run: `npm install --save-dev fake-indexeddb`

Then add this as the first import in `src/test/setup.ts`:

```ts
import "fake-indexeddb/auto";
```

Expected: package manifests update and Dexie can open in Vitest/jsdom.

- [ ] **Step 2: Write failing A:L row tests**

Test the exact compatibility contract:

```ts
expect(parseTransactionRow(legacyElevenColumns, 2).reimbursesTransactionId).toBeUndefined();
expect(parseTransactionRow(twelveColumns, 3).reimbursesTransactionId).toBe("expense-1");
expect(serializeTransactionRow(linkedIncome)[11]).toBe("expense-1");
expect(parseTransactionRow(malformedTypeRow, 4).sheetRowValid).toBe(false);
```

Also assert valid old rows have `sheetRowValid: true` and transaction IDs remain in column K.

- [ ] **Step 3: Run row tests and verify failure**

Run: `npm run test -- src/lib/transactionRows.test.ts`

Expected: FAIL because the relation and row helpers do not exist.

- [ ] **Step 4: Extend the transaction model and implement row helpers**

Add to `TransactionInput`:

```ts
reimbursesTransactionId?: string;
```

Add to `TransactionRecord`:

```ts
sheetRowValid?: boolean;
```

Export from `transactionRows.ts`:

```ts
export const TRANSACTION_HEADERS = [
  "Date", "Type", "Amount", "Category", "Note", "Timestamp",
  "Device/Source", "Currency", "Account", "For", "Id", "Reimburses Id",
] as const;

export function serializeTransactionRow(transaction: TransactionRecord): unknown[];
export function parseTransactionRow(row: unknown[], rowIndex: number): TransactionRecord;
```

The parser keeps the existing safe fallbacks, reads column L as a trimmed optional relation, and sets `sheetRowValid` false when type is not exactly expense/income/transfer, amount is non-finite, or column K has no stable ID. This metadata prevents malformed fallback expenses from exposing Reimburse.

- [ ] **Step 5: Write failing reimbursement arithmetic tests**

Cover:

```ts
expect(calculateReimbursementSummary(source100, [remote40], [pending20])).toMatchObject({
  confirmed: 40,
  queued: 20,
  remaining: 40,
  overReimbursed: 0,
});
```

Add cases for a duplicate child in remote/local, `-40` compensation, errored local rows reserving balance, current-child exclusion during edit, full reimbursement, over-reimbursement, currency mismatch, dangling IDs, and malformed/non-positive sources.

- [ ] **Step 6: Run domain tests and verify failure**

Run: `npm run test -- src/lib/reimbursements.test.ts`

Expected: FAIL because the domain module is absent.

- [ ] **Step 7: Implement pure reimbursement rules**

Export these contracts:

```ts
export const REIMBURSEMENT_CATEGORY = "Reimbursement";

export type ReimbursementSummary = {
  confirmed: number;
  queued: number;
  remaining: number;
  overReimbursed: number;
  currencyMismatchIds: string[];
};

export type ReimbursementLedgerRow = {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  reimbursesTransactionId?: string;
  status: TransactionStatus;
  sheetRow?: number;
};

export function isReimbursableExpense(source: TransactionRecord): boolean;
export function calculateReimbursementSummary(
  source: TransactionRecord,
  remoteRows: ReimbursementLedgerRow[],
  localRows: ReimbursementLedgerRow[],
  excludeChildId?: string,
): ReimbursementSummary;
export function validateReimbursementAmount(amount: number, summary: ReimbursementSummary): string | null;
```

Count only linked income rows with the source ID and sum finite signed amounts. Deduplicate by child ID; a local `pending`/`error` row wins over the same remote ID because it represents a queued edit to the stale Sheet value, while remote wins over an unchanged local `synced` copy. `isReimbursableExpense` requires `sheetRowValid !== false`, type expense, and finite amount greater than zero.

- [ ] **Step 8: Run row and domain tests**

Run: `npm run test -- src/lib/transactionRows.test.ts src/lib/reimbursements.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit domain foundations**

```bash
git add package.json package-lock.json src/test/setup.ts src/lib/types.ts src/lib/transactionRows.ts src/lib/transactionRows.test.ts src/lib/reimbursements.ts src/lib/reimbursements.test.ts
git commit -m "feat: add linked reimbursement domain model"
```

### Task 2: Google Sheets and mock A:L APIs

**Files:**
- Modify: `src/lib/google.ts`
- Create: `src/lib/googleTransactions.test.ts`
- Modify: `src/lib/mock/mockGoogle.ts`

- [ ] **Step 1: Write failing request/response tests**

Mock `fetch` and assert:

```ts
expect(appendUrl).toContain("Transactions!A:L:append");
expect(updateRange).toContain("Transactions!A8:L8");
expect(headerBody).toEqual({ values: [["Reimburses Id"]] });
```

Test `ensureReimbursementHeader` writes only `Transactions!L1:L1`, `getRecentTransactions` fetches A:L while still counting K, `readTransactionById` resolves K then reads the current A:L row, and `readLinkedReimbursements` aligns uneven B:C and H:L batch ranges by row offset.

- [ ] **Step 2: Run Sheets tests and verify failure**

Run: `npm run test -- src/lib/googleTransactions.test.ts`

Expected: FAIL because the code still uses A:K and the focused read APIs are absent.

- [ ] **Step 3: Route all serialization through the row module**

Replace the local header/parse/value construction in `google.ts` with `TRANSACTION_HEADERS`, `serializeTransactionRow`, and `parseTransactionRow`. Use A:L for create, append, update, and recent read; leave K2:K as the row-count and ID-map range.

- [ ] **Step 4: Add the schema upgrader and focused reads**

Export:

```ts
export async function ensureReimbursementHeader(accessToken: string, spreadsheetId: string): Promise<void>;
export async function readTransactionById(accessToken: string, spreadsheetId: string, id: string): Promise<TransactionRecord | null>;
export async function readLinkedReimbursements(accessToken: string, spreadsheetId: string, sourceId: string): Promise<ReimbursementLedgerRow[]>;
```

`readLinkedReimbursements` calls Sheets `values:batchGet` for encoded ranges `Transactions!B2:C` and `Transactions!H2:L`, aligns both returned arrays with row index `offset + 2`, and returns only focused `ReimbursementLedgerRow` values whose L value equals `sourceId`; do not invent missing date/category/note/account fields. Assign `sheetId` to every full record returned by `getRecentTransactions` and `readTransactionById`, and mirror that provenance in mock recent/source reads so offline logic can distinguish remote rows from local-only sources.

- [ ] **Step 5: Mirror behavior in mock mode**

`ensureReimbursementHeader` is a delayed no-op. `readTransactionById` looks up the stable ID. `readLinkedReimbursements` filters mock storage by relation and returns synced copies. Preserve relation values through mock append/update/recent reads.

- [ ] **Step 6: Run Sheets and row tests**

Run: `npm run test -- src/lib/googleTransactions.test.ts src/lib/transactionRows.test.ts`

Expected: PASS for 11-column legacy parsing and 12-column round trips.

- [ ] **Step 7: Commit Sheet schema support**

```bash
git add src/lib/google.ts src/lib/googleTransactions.test.ts src/lib/mock/mockGoogle.ts
git commit -m "feat: persist reimbursement links in sheets"
```

### Task 3: Reactive local rows and reimbursement summary queries

**Files:**
- Create: `src/components/TransactionFlow/transactionQueryKeys.ts`
- Create: `src/components/TransactionFlow/useLocalTransactionsQuery.ts`
- Create: `src/components/TransactionFlow/useLocalTransactionsQuery.test.tsx`
- Create: `src/components/TransactionFlow/useReimbursementSummary.ts`
- Create: `src/components/TransactionFlow/useReimbursementSummary.test.tsx`
- Create: `src/components/TransactionFlow/useTransactionByIdQuery.ts`
- Create: `src/components/TransactionFlow/useTransactionByIdQuery.test.tsx`

- [ ] **Step 1: Define cache keys before writing hooks**

Use one shared factory:

```ts
export const transactionQueryKeys = {
  recent: (sheetId: string | null, limit = 50) => ["recentTransactions", sheetId, limit] as const,
  local: ["localTransactions"] as const,
  reimbursements: ["reimbursementSummary"] as const,
  reimbursement: (sheetId: string | null, sourceId: string) =>
    ["reimbursementSummary", sheetId, sourceId] as const,
  transaction: (sheetId: string | null, id: string) => ["transactionById", sheetId, id] as const,
};
```

Update `useRecentTransactionsQuery` to use `transactionQueryKeys.recent`.

- [ ] **Step 2: Write failing local-query tests**

Seed Dexie with pending, error, and synced rows. Assert the hook returns pending plus error, newest first, excludes synced, and uses `networkMode: "always"` behavior while `navigator.onLine` is false.

- [ ] **Step 3: Implement the local TanStack query**

Use:

```ts
return useQuery({
  queryKey: transactionQueryKeys.local,
  networkMode: "always",
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: async () => {
    const rows = await db.transactions.where("status").anyOf("pending", "error").toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});
```

- [ ] **Step 4: Write failing summary-hook tests**

Mock session/workspace/connectivity and remote reads. Assert online checking/error/retry, remote/local dedupe, offline cached remote reuse, offline no-cache remote total zero plus `needsOnlineVerification: true`, local-only pending source remote total zero, and errored rows reserving balance.

- [ ] **Step 5: Implement the remote query plus derived summary**

Export this input contract so linked-child editing can exclude itself without changing the source total:

```ts
export function useReimbursementSummary({
  source,
  excludeChildId,
}: {
  source: TransactionRecord | null;
  excludeChildId?: string;
}): ReimbursementSummaryQueryResult;
```

The remote query is keyed by sheet/source and enabled only online with credentials and a non-local-only source. Set `staleTime: 0` and `refetchOnMount: "always"`; while online, `isChecking` follows the fresh fetch even if cached data is visible, so Reimburse stays disabled until the check completes. Offline may use `remoteQuery.data ?? cachedRemote ?? []`. Combine remote rows with `useLocalTransactionsQuery().data ?? []` through `calculateReimbursementSummary(source, remoteRows, localRows, excludeChildId)`. Return:

```ts
{
  summary,
  isChecking,
  isError,
  retry: remoteQuery.refetch,
  needsOnlineVerification,
}
```

Do not write the remote result to Dexie or localStorage.

- [ ] **Step 6: Write and implement source-by-ID query tests**

The hook treats a Dexie source as authoritative only when it is genuinely local-only (`status` pending/error and no `sheetId`). A synced Dexie or recent-cache value is placeholder data; while online, resolve the current source by K/A:L before enabling amount editing so remote delete/retype/currency changes are observed. It returns `null` when the ID is authoritatively missing and stays in a quiet error state on transient failure. Use `transactionQueryKeys.transaction` and test local-only, stale synced Dexie, cached, fresh remote, and missing cases.

- [ ] **Step 7: Run all query tests**

Run: `npm run test -- src/components/TransactionFlow/useLocalTransactionsQuery.test.tsx src/components/TransactionFlow/useReimbursementSummary.test.tsx src/components/TransactionFlow/useTransactionByIdQuery.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit transaction queries**

```bash
git add src/components/TransactionFlow/transactionQueryKeys.ts src/components/TransactionFlow/useRecentTransactionsQuery.ts src/components/TransactionFlow/useLocalTransactionsQuery.ts src/components/TransactionFlow/useLocalTransactionsQuery.test.tsx src/components/TransactionFlow/useReimbursementSummary.ts src/components/TransactionFlow/useReimbursementSummary.test.tsx src/components/TransactionFlow/useTransactionByIdQuery.ts src/components/TransactionFlow/useTransactionByIdQuery.test.tsx
git commit -m "feat: query reimbursement balances"
```

### Task 4: Provider mutation contract, exact delete, and cache invalidation

**Files:**
- Modify: `src/app/providers/transactions/TransactionsContext.tsx`
- Modify: `src/app/providers/transactions/TransactionsProvider.tsx`
- Create: `src/app/providers/transactions/TransactionsProvider.test.tsx`
- Modify: `src/components/TransactionFlow/useAddTransactionMutation.ts`
- Modify: `src/components/TransactionFlow/useUpdateTransactionMutation.ts`
- Modify: `src/components/TransactionFlow/useDeleteTransactionMutation.ts`

- [ ] **Step 1: Write failing provider reliability tests**

With mock Google functions and real Dexie, assert:

```ts
expect((await context.addTransaction(input)).id).toBeTruthy();
expect(deleteRow).toHaveBeenCalledWith(token, sheetId, 0, currentRowFromK);
```

Use a record whose cached `sheetRow` differs from the K map. Test tab ID `0`, an error row deleting locally without compensation, saving an error row transitions it to pending, a remote-missing synced row is removed locally, and query invalidations include local/recent/reimbursement prefixes. Also delete a source expense with linked children and assert only the source is removed; linked incomes remain as audit rows with their dangling relation.

For a synced linked child, test that increasing amount validates against the current source and other children before `updateRow`, while an account/date/note-only edit remains allowed when the source is missing. Attempts to alter type/category/currency/For/relation must be replaced with the original child values at the provider boundary.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `npm run test -- src/app/providers/transactions/TransactionsProvider.test.tsx`

Expected: FAIL because add returns void, tab 0 is rejected, stale row numbers are used, and error deletion compensates.

- [ ] **Step 3: Return the created record and centralize invalidation**

Change the context signature to:

```ts
addTransaction: (input: TransactionInput) => Promise<TransactionRecord>;
updateTransaction: (
  id: string,
  input: Partial<TransactionInput>,
) => Promise<TransactionRecord | undefined>;
```

Inside the provider, call `useQueryClient()` and define `invalidateTransactions(record?)` to invalidate `local`, `recent`, and `reimbursements`. After any immediate sync attempt, read the record back from Dexie and return that latest copy, falling back to the originally-created record. Callers therefore receive both the stable ID and actual queued/synced/error status without relying on `undoLast` ordering.

Run invalidation after every Dexie add/update/delete/status transition and in `syncNow`'s `finally`, not only in mutation-hook success handlers. When moving an error row back to pending, clear its stale `error` field before sync.

- [ ] **Step 4: Validate direct linked updates**

Before a synced linked reimbursement calls `updateRow`, read the current child by K and build the prospective record using original type/category/currency/For/relation regardless of form input. If amount changes, resolve the current source and calculate remaining excluding this child; reject an invalid increase while keeping the form values. If the source is missing, allow only account/date/note changes with amount and locked fields unchanged. Network failure may fall back to pending, but the queued sync must enforce the same rules.

- [ ] **Step 5: Fix direct delete and undo row resolution**

For synced rows, obtain `effectiveTabId` and require `effectiveTabId !== null`. Always resolve `currentRow = (await readTransactionIdMap(...)).get(id)` immediately before `deleteRow`; never use cached `sheetRow`. If no K entry exists, remove the stale local copy as already absent. Treat `pending` and `error` as direct local deletes. Preserve `reimbursesTransactionId` on compensating entries.

- [ ] **Step 6: Make mutations invalidate rather than force-fetch**

Have add/update/delete mutation hooks return provider results and call `queryClient.invalidateQueries` for recent, local, and reimbursement prefixes. If add/update returns `status: "error"`, reject the UI mutation with that record's actionable error while leaving the local error row visible; validation failure therefore keeps the form open instead of showing a success receipt. This allows valid offline pending mutations to settle without requiring a network refetch.

- [ ] **Step 7: Run provider and mutation tests**

Run: `npm run test -- src/app/providers/transactions/TransactionsProvider.test.tsx`

Expected: PASS for exact IDs, tab 0, shifted rows, error retry/delete, and invalidation.

- [ ] **Step 8: Commit provider reliability fixes**

```bash
git add src/app/providers/transactions/TransactionsContext.tsx src/app/providers/transactions/TransactionsProvider.tsx src/app/providers/transactions/TransactionsProvider.test.tsx src/components/TransactionFlow/useAddTransactionMutation.ts src/components/TransactionFlow/useUpdateTransactionMutation.ts src/components/TransactionFlow/useDeleteTransactionMutation.ts
git commit -m "fix: make transaction mutations exact and reactive"
```

### Task 5: Linked reimbursement sync validation

**Files:**
- Modify: `src/lib/sync.ts`
- Create: `src/lib/sync.test.ts`

- [ ] **Step 1: Write failing sync scenarios**

Use injected/mock adapters and assert:

- source pending is appended before its child;
- L1 is installed before the first linked append;
- an existing child K ID is updated in place and marked synced without a second append;
- an existing linked child validates an amount edit before update, while a metadata-only account/date/note edit can update even after its source was deleted;
- confirmed plus other pending/error children reserve balance;
- stale overage becomes `error` with `Amount exceeds remaining reimbursement balance`;
- missing/deleted, errored, retyped, non-positive, and currency-changed sources produce distinct actionable child errors;
- a signed compensating child is accepted and reduces the total.

- [ ] **Step 2: Run sync tests and verify failure**

Run: `npm run test -- src/lib/sync.test.ts`

Expected: FAIL because linked children currently append without source checks.

- [ ] **Step 3: Topologically order source rows before children**

Before the loop, sort pending rows so a row referenced by another pending row is processed first while preserving `createdAt` order for unrelated rows. After attempting the source, re-read its current Dexie status rather than trusting the initial pending snapshot. If it is now `error`, mark the child `error` with `Original expense failed to sync`.

- [ ] **Step 4: Revalidate each linked child immediately before append**

For `item.reimbursesTransactionId`:

1. call `ensureReimbursementHeader`;
2. resolve the authoritative source by K/A:L;
3. require valid positive expense and matching currency;
4. read confirmed linked rows;
5. load other local pending/error linked rows and pass them to the local-wins deduplicating calculator, excluding only the current child;
6. calculate latest remaining and reject an amount above it.

Use exact messages:

```ts
"Original expense unavailable"
"Original expense failed to sync"
"Original transaction is no longer an expense"
"Original expense currency changed"
"Amount exceeds remaining reimbursement balance"
```

These are non-retryable until the user edits/retries or deletes the row, so store `status: "error"` and continue syncing unrelated rows.

- [ ] **Step 5: Preserve normal K idempotency and provider error mapping**

Resolve `existingRow = existingIds.get(item.id)` first, but do not update or mark synced until linked validation completes. Read the existing A:L child. If it matches the local row (lost append response), mark it synced idempotently. If amount changed, validate the source and balance while excluding the existing child's old amount, then update the current K-derived row. If only account/date/note changed and amount/type/category/currency/For/relation match the existing child, allow the update even when the source is missing; this implements the approved dangling-child edit behavior. Reject changes to locked fields.

For a new linked child with no existing K row, require a valid source and perform the full validation before append. Do not change normal retryable Google error behavior. When an append succeeds, update `existingIds` so the same run cannot append it twice.

- [ ] **Step 6: Run sync and domain tests**

Run: `npm run test -- src/lib/sync.test.ts src/lib/reimbursements.test.ts`

Expected: PASS for queue ordering, exactly-once append, and all source-state failures.

- [ ] **Step 7: Commit sync validation**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: validate reimbursements during sync"
```

### Task 6: Locked controls and reimbursement action UI

**Files:**
- Modify: `src/components/CurrencyPicker.tsx`
- Modify: `src/components/Keypad.tsx`
- Modify: `src/components/TransactionFlow/StepAmount.tsx`
- Modify: `src/components/TransactionFlow/StepAmount.test.tsx`
- Create: `src/components/TransactionFlow/ReimbursementAction.tsx`
- Create: `src/components/TransactionFlow/ReimbursementAction.test.tsx`
- Modify: `src/components/TransactionFlow/StepReceipt.tsx`
- Create: `src/components/TransactionFlow/StepReceipt.test.tsx`

- [ ] **Step 1: Write failing locked-control tests**

Assert currency and For cannot change, account remains editable, changing account does not restore stored per-account currency when `preserveCurrencyOnAccountChange`, and amount/keypad is read-only only when `amountLocked`. Assert the optional middle action renders between Delete and Save.

- [ ] **Step 2: Implement opt-in control props**

Add:

```ts
currencyLocked?: boolean;
forLocked?: boolean;
amountLocked?: boolean;
preserveCurrencyOnAccountChange?: boolean;
middleAction?: React.ReactNode;
```

`CurrencyPicker` and `Keypad` receive a real `disabled` prop with accessible disabled semantics. `StepAmount.handleAccountChange` skips all localStorage currency restoration when preservation is enabled. Insert `middleAction` after the Delete button and before the flexing Save button. Existing callers keep current behavior by default.

In `TransactionFlow`, also guard the parent account-to-currency restoration, per-account currency persistence, and non-transfer `For` normalization effects whenever fields are locked: both `mode.kind === "reimburse"` and edit mode for a linked child. Otherwise those effects can overwrite or contaminate the source currency/For even though the visible controls are disabled.

- [ ] **Step 3: Write failing action-state tests**

Test `Checking reimbursements...`, inline Retry, confirmed/queued/remaining labels, `Balance will be verified when online`, `Fully reimbursed`, currency mismatch, and over-reimbursed disabled states. Verify the action callback only fires when eligible and known remaining is positive.

- [ ] **Step 4: Implement the focused balance/action component**

Use props:

```ts
type ReimbursementActionProps = {
  summary: ReimbursementSummary;
  currency: string;
  isChecking: boolean;
  isError: boolean;
  needsOnlineVerification: boolean;
  onRetry: () => void;
  onReimburse: () => void;
};
```

Render compact amounts near the footer and a middle `Reimburse` button. Use no shadow classes.

- [ ] **Step 5: Add a status-aware reimbursement receipt variant**

Add optional props:

```ts
variant?: "transaction" | "reimbursement";
syncStatus?: TransactionStatus;
doneLabel?: string;
undoLabel?: string;
showTimedProgress?: boolean;
```

For `variant="reimbursement"`, derive copy per state: saving while the mutation is pending; `Reimbursement queued` with a local-sync explanation for `syncStatus="pending"`; `Reimbursement recorded` with Sheets copy for `syncStatus="synced"`; and error copy only when the mutation itself fails. Use `Done`, `Undo reimbursement`, and no timed progress. This keeps queued receipts from claiming Sheets sync and avoids one static description being reused for incompatible states.

- [ ] **Step 6: Run focused component tests**

Run: `npm run test -- src/components/TransactionFlow/StepAmount.test.tsx src/components/TransactionFlow/ReimbursementAction.test.tsx src/components/TransactionFlow/StepReceipt.test.tsx`

Expected: PASS, with no regression to create/edit/Quick Note defaults.

- [ ] **Step 7: Commit shared reimbursement UI**

```bash
git add src/components/CurrencyPicker.tsx src/components/Keypad.tsx src/components/TransactionFlow/StepAmount.tsx src/components/TransactionFlow/StepAmount.test.tsx src/components/TransactionFlow/ReimbursementAction.tsx src/components/TransactionFlow/ReimbursementAction.test.tsx src/components/TransactionFlow/StepReceipt.tsx src/components/TransactionFlow/StepReceipt.test.tsx
git commit -m "feat: add reimbursement form controls"
```

### Task 7: Reimbursement mutation and discriminated flow

**Files:**
- Create: `src/components/TransactionFlow/flowMode.ts`
- Create: `src/components/TransactionFlow/flowMode.test.ts`
- Create: `src/components/TransactionFlow/useCreateReimbursementMutation.ts`
- Create: `src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`
- Modify: `src/components/TransactionFlow/transactionSchema.ts`
- Create: `src/components/TransactionFlow/transactionSchema.test.ts`
- Modify: `src/components/TransactionFlow/index.tsx`
- Create: `src/components/TransactionFlow/TransactionFlow.test.tsx`

- [ ] **Step 1: Write failing flow-mode and mutation tests**

Define and test:

```ts
export type TransactionFlowMode =
  | { kind: "create" }
  | { kind: "edit"; transaction: TransactionRecord }
  | { kind: "reimburse"; source: TransactionRecord };
```

The mutation must ignore any caller attempt to change type/category/currency/for/relation and call `addTransaction` with income, `Reimbursement`, source currency, source For, and source ID. Reject zero, negative, non-finite, numeric-prefix, and over-remaining amounts. Update `transactionSchema` to use `Number(value)` plus `Number.isFinite`; test blank, `12abc`, and `Infinity` before calling the mutation boundary.

- [ ] **Step 2: Run mode/mutation tests and verify failure**

Run: `npm run test -- src/components/TransactionFlow/flowMode.test.ts src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx src/components/TransactionFlow/transactionSchema.test.ts`

Expected: FAIL because the mode and mutation are absent.

- [ ] **Step 3: Implement the dedicated mutation**

Use this input:

```ts
type CreateReimbursementVariables = {
  source: TransactionRecord;
  amount: string;
  remaining: number;
  account: string;
  date: Date;
  note: string;
};
```

Parse amount with `Number(value)`, require `Number.isFinite(amount) && amount > 0`, derive all locked fields in the mutation function, and return the created `TransactionRecord`. If the provider returns an error row after immediate sync validation, throw its actionable error and keep the amount form open; a valid offline `pending` row is success. Invalidate local, recent, and the source reimbursement query on success.

- [ ] **Step 4: Write failing component-flow tests**

Mock hooks/providers and cover:

- Reimburse appears only for parsed positive expenses and sits between Delete and Save;
- tapping it leaves the source form snapshot unchanged;
- separate reimbursement defaults match remaining/currency/account/For/note/date contract;
- Back restores the source editor values;
- reimbursement mode never enables Places;
- submit creates one linked income and disables duplicate submit;
- receipt stays open until Done/Undo;
- changing date in the reimbursement DateTime drawer writes that exact date to the child;
- Undo deletes the returned child ID, not the latest unrelated transaction;
- full, checking, remote-error, mismatch, and overage states disable entry.

- [ ] **Step 5: Replace nullable edit inference with explicit mode**

Keep two unconditional `useTransactionForm()` instances: `form` for create/edit and `reimbursementForm` for reimbursement. On Reimburse, reset the latter to:

```ts
{
  type: "income",
  category: REIMBURSEMENT_CATEGORY,
  amount: String(summary.remaining),
  currency: source.currency,
  account: source.account,
  forValue: source.for,
  dateObject: new Date(),
  note: source.note ?? source.category,
}
```

Do not mutate `form`. Back from reimbursement sets the prior edit mode and amount step. Done resets to dashboard.

Pass `onDateClick={() => setDateDrawerOpen(true)}` in reimbursement mode and bind the drawer to `reimbursementForm`; the repayment date remains editable. Do not pass a category edit action because `Reimbursement` is a locked system category.

- [ ] **Step 6: Make reimbursement receipt exact and persistent**

Store the returned reimbursement record, including ID and final pending/synced status. Do not call `scheduleReceiptTransition` in reimbursement mode. Pass a reimbursement receipt variant plus sync status so copy says either queued locally or synced to Sheets; no success receipt is shown for an error row. Undo calls `deleteTransaction(createdReimbursementId)` through the delete mutation, invalidates the source summary, then returns to the dashboard. Keep the existing two-second behavior for ordinary create/edit receipts.

- [ ] **Step 7: Preserve Places eligibility after the mode refactor**

The only Places-enabled condition is amount step plus `mode.kind === "create"` plus expense plus no receipt. Search drawer state must close/reset whenever the mode leaves eligible create-expense entry.

- [ ] **Step 8: Run mutation and flow tests**

Run: `npm run test -- src/components/TransactionFlow/flowMode.test.ts src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx src/components/TransactionFlow/TransactionFlow.test.tsx`

Expected: PASS for separate form state, locked defaults, exact ID undo, and persistent receipt.

- [ ] **Step 9: Commit reimbursement flow**

```bash
git add src/components/TransactionFlow/flowMode.ts src/components/TransactionFlow/flowMode.test.ts src/components/TransactionFlow/useCreateReimbursementMutation.ts src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx src/components/TransactionFlow/transactionSchema.ts src/components/TransactionFlow/transactionSchema.test.ts src/components/TransactionFlow/index.tsx src/components/TransactionFlow/TransactionFlow.test.tsx
git commit -m "feat: add linked reimbursement flow"
```

### Task 8: Linked-child editing and error-row dashboard

**Files:**
- Modify: `src/components/TransactionFlow/TopDashboard.tsx`
- Create: `src/components/TransactionFlow/TopDashboard.test.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`
- Modify: `src/components/TransactionFlow/TransactionFlow.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Mock recent and local hooks. Assert pending plus error rows are shown ahead of remote rows, local wins a duplicate ID, an error row includes accessible `Sync failed` copy and its error message, and clicking it passes the exact local record to edit.

- [ ] **Step 2: Replace the queue-count effect**

Remove `queueCount`, `pendingTransactions` state, and the Dexie effect from `TopDashboard`. Consume `useLocalTransactionsQuery`; combine local then remote; dedupe and sort. Mark error rows visibly without changing gross-expense total behavior.

- [ ] **Step 3: Write failing linked-edit tests**

Cover a linked child whose source is cached, outside recent 50, and deleted. Assert relation/type/category/currency/For remain locked; max amount excludes the current child; a missing source shows `Original expense unavailable`, locks amount, but leaves account/date/note/delete and Save available. Saving preserves `reimbursesTransactionId`. Attempt to tamper with locked form values programmatically and assert the submitted update still derives them from the original child.

- [ ] **Step 4: Wire source lookup and edit constraints**

When edit mode receives a linked row, call `useTransactionByIdQuery` for its source and `useReimbursementSummary` with `excludeChildId` equal to the current child ID. Pass the locked props into `StepAmount`. Build the update input from the original child for type/category/currency/For/relation and accept form values only for amount/account/date/note. While source resolution is loading/error, lock amount; permit Save when amount and locked fields remain unchanged so account/date/note edits still work. When the source is available, validate changed amount against the other-child-adjusted maximum.

- [ ] **Step 5: Make error-row Save a retry transition**

Saving an error reimbursement uses `updateTransaction`, which sets it to pending, clears the old error, and re-enters normal sync validation. Inspect the latest returned record: preserve the actionable error and form if it returns to `error`; only show a receipt for pending/synced. Deleting it removes the local row and releases its reserved summary amount.

- [ ] **Step 6: Run dashboard and flow tests**

Run: `npm run test -- src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/useTransactionByIdQuery.test.tsx`

Expected: PASS for error visibility, source resolution, edit caps, missing-source controls, retry, and delete.

- [ ] **Step 7: Commit linked editing and dashboard reactivity**

```bash
git add src/components/TransactionFlow/TopDashboard.tsx src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/index.tsx src/components/TransactionFlow/TransactionFlow.test.tsx
git commit -m "feat: edit and retry linked reimbursements"
```

### Task 9: Mobile smoke tests and full verification

**Files:**
- Create: `e2e/transaction-flow.spec.ts`
- Modify: `playwright.config.ts` only if the existing web-server environment cannot receive the two required Vite variables.

- [ ] **Step 1: Add the mock-mode mobile reimbursement smoke test**

Seed `sheetlog.mock.transactions` with one positive expense before navigating to `/app`. On Mobile Chrome: open it, verify footer order Delete/Reimburse/Save, create a partial reimbursement, verify the receipt remains, press Done, reopen the source, create the remainder, verify Fully reimbursed, and assert two distinct linked income IDs in localStorage. Add a separate exact-Undo assertion that removes only the newly-created linked child.

- [ ] **Step 2: Add the deterministic Places mobile smoke test**

Run the dev server with `VITE_GOOGLE_MAPS_API_KEY=test-key`, grant geolocation, and fulfill the Maps script with a deterministic `window.google` stub. Assert five nearby chips followed by Search, Search focuses the input, autocomplete shows a secondary address, and selection replaces the note and closes the drawer. Do not call the live Places API.

- [ ] **Step 3: Run focused unit/integration tests**

Run:

```bash
npm run test -- src/lib/transactionRows.test.ts src/lib/reimbursements.test.ts src/lib/googleTransactions.test.ts src/lib/sync.test.ts src/app/providers/transactions/TransactionsProvider.test.tsx src/components/TransactionFlow/useLocalTransactionsQuery.test.tsx src/components/TransactionFlow/useReimbursementSummary.test.tsx src/components/TransactionFlow/useTransactionByIdQuery.test.tsx src/components/TransactionFlow/ReimbursementAction.test.tsx src/components/TransactionFlow/TransactionFlow.test.tsx src/components/TransactionFlow/TopDashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm run test
npx tsc --noEmit
npm run lint
npm run build
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test --project="Mobile Chrome"
git diff --check
```

Expected: all commands exit 0. Biome may report only its pre-existing schema-version informational message.

- [ ] **Step 5: Check the no-shadow constraint**

Run: `git diff --unified=0 origin/main...HEAD -- '*.tsx' | rg '^\+.*shadow'`

Expected: no output from added lines.

- [ ] **Step 6: Perform manual HTTPS PWA acceptance**

Check mobile permission allow/deny, up to five nearby chips plus Search, immediate search keyboard, provider attribution, offline reimbursement with and without an in-memory summary, reconnect sync, partial/full transitions, and error retry/delete. Confirm no raw coordinates, autocomplete history, or unselected suggestion data appears in Dexie, localStorage, or Sheet rows.

- [ ] **Step 7: Commit end-to-end coverage**

```bash
git add e2e/transaction-flow.spec.ts playwright.config.ts
git commit -m "test: cover places and reimbursement mobile flows"
```
