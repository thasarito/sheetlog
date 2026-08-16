# Note Place Combobox and Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve SheetLog's current note-field visual while adding an everywhere-clear control, inline new-expense Places autocomplete, and a durable Google provider/Place ID reference in Sheet columns M/N.

**Architecture:** Store place identity as one optional nested domain object and use a three-way update patch plus local-only intent to distinguish preserve, set, and clear through offline retries. Extend transaction rows from A:L to A:N without moving stable ID/reimbursement columns, then replace the separate drawer with a controlled TanStack Query combobox layered over the keypad. Keep nearby chips as the empty-note shortcut and make all note/place mutations atomic through shared form helpers.

**Tech Stack:** React 18, TypeScript, TanStack Form, TanStack Query, Dexie, Google Maps JavaScript Places API (New), Vitest, Testing Library, Playwright Mobile Chrome, Google Sheets API.

---

## File map

### Domain and Sheet data

- Modify `src/lib/types.ts`: add `TransactionPlace`, `PlaceUpdateIntent`, `TransactionUpdateInput`, and optional record fields.
- Create `src/lib/transactionPlace.ts`: strict input validation, tolerant Sheet parsing, three-way update application, intent composition, and equality.
- Create `src/lib/transactionPlace.test.ts`: unit contract for preserve/set/clear, malformed values, note invariant, and repeated intent composition.
- Modify `src/lib/transactionRows.ts`: A:N headers, serialization, parsing, and formula literalization.
- Modify `src/lib/transactionRows.test.ts`: A:K/A:L compatibility plus M/N round trips and malformed rows.
- Modify `src/lib/google.ts`: A:N transaction ranges and narrow M1:N1 header assurance.
- Modify `src/lib/googleTransactions.test.ts`: exact Google request and mock-adapter contracts.
- Modify `src/lib/mock/mockGoogle.ts`: place-header no-op and remote-record cleanup.

### Provider and synchronization

- Modify `src/app/providers/transactions/TransactionsContext.tsx`: type updates with `TransactionUpdateInput`.
- Modify `src/app/providers/transactions/TransactionsProvider.tsx`: strict create validation, authoritative three-way updates, queued intent composition, header ordering, and compensating-place preservation.
- Modify `src/app/providers/transactions/TransactionsProvider.test.tsx`: direct/offline/set/clear/reversal/header-failure tests.
- Modify `src/lib/sync.ts`: reconcile place intent after authoritative reads, assure headers, include place in content/CAS/rollback, and clear intent only on success.
- Modify `src/lib/sync.test.ts`: append/update/retry/CAS/rollback and repeated-offline-edit coverage.

### Form and UI

- Modify `src/components/TransactionFlow/transactionSchema.ts`: optional atomic place value.
- Modify `src/components/TransactionFlow/transactionSchema.test.ts`: nested place validation.
- Modify `src/components/TransactionFlow/useTransactionForm.ts`: place default/hydration.
- Create `src/components/TransactionFlow/transactionNoteForm.ts`: atomic manual edit, clear, selection, replacement, and place-only clear helpers.
- Create `src/components/TransactionFlow/transactionNoteForm.test.ts`: form-state transition matrix.
- Create `src/components/TransactionFlow/useAddTransactionMutation.test.tsx`: create mutation place forwarding.
- Modify `src/components/TransactionFlow/useAddTransactionMutation.ts`: forward `place`.
- Modify `src/components/TransactionFlow/useUpdateTransactionMutation.ts`: accept `TransactionUpdateInput`.
- Modify `src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx`: patch forwarding and invalidation remain intact.
- Modify `src/components/TransactionFlow/flowMode.ts`: reimbursement defaults clear place.
- Modify `src/components/TransactionFlow/flowMode.test.ts`: no source-place inheritance.
- Modify `src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`: created reimbursement omits source place.
- Modify `src/components/TransactionFlow/StepCategory.tsx`: Quick Note replacement and create-type clearing.
- Create `src/components/TransactionFlow/StepCategory.test.tsx`: programmatic-note/type/category preservation contracts.
- Create `src/components/TransactionFlow/placeSessionId.ts`: collision-resistant logical Places session IDs.
- Create `src/components/TransactionFlow/placeSessionId.test.ts`: UUID and fallback uniqueness.
- Modify `src/components/TransactionFlow/usePlaceAutocomplete.ts`: controlled value, threshold/session lifecycle, current-query-only results, and structured selection.
- Modify `src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`: controlled debounce/race/cleanup/selection contracts.
- Create `src/components/TransactionFlow/TransactionNoteField.tsx`: unchanged note visual, clear button, combobox overlay, keyboard/ARIA/focus, and nearby chips.
- Create `src/components/TransactionFlow/TransactionNoteField.test.tsx`: visual, clear, overlay, keyboard, pointer, and accessibility contracts.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.tsx`: remove only the obsolete Search chip API.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`: five-item nearby-only rail.
- Modify `src/components/TransactionFlow/StepAmount.tsx`: use `TransactionNoteField` and shared form helpers.
- Modify `src/components/TransactionFlow/StepAmount.test.tsx`: clear behavior in all reuse modes and no layout regression.
- Modify `src/components/TransactionFlow/index.tsx`: remove drawer state, pass inline Places options, hydrate/reset place, and emit update patches.
- Modify `src/components/TransactionFlow/index.places.test.tsx`: eligibility, selection, stale completion, navigation, and payload integration.
- Delete `src/components/TransactionFlow/PlaceSearchDrawer.tsx`: obsolete separate search UI.
- Delete `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`: obsolete drawer contract.

### Disclosure, mobile proof, and release

- Modify `src/routes/PrivacyPolicyPage.tsx`: inline note-query transmission and provider/Place ID persistence disclosure.
- Modify `src/routes/LegalPages.test.tsx`: rendered disclosure contract.
- Modify `README.md`: document M/N metadata while retaining the current place-name storage gate.
- Modify `e2e/transaction-flow.spec.ts`: inline overlay, no layout shift, metadata retain/clear, and serialized M/N proof.
- Create `output/playwright/new-flow/note-place-combobox-results.png`: reviewed Mobile Chrome PR screenshot.

## Task 1: Atomic place domain and update semantics

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/transactionPlace.ts`
- Create: `src/lib/transactionPlace.test.ts`

- [ ] **Step 1: Write the failing place-domain tests**

Create `src/lib/transactionPlace.test.ts` with this contract:

```ts
import { describe, expect, it } from "vitest";
import type {
  TransactionInput,
  TransactionRecord,
  TransactionUpdateInput,
} from "./types";
import {
  InvalidTransactionPlaceError,
  applyTransactionUpdate,
  composePlaceUpdateIntent,
  normalizeTransactionInput,
  parseSheetTransactionPlace,
  sameTransactionPlace,
} from "./transactionPlace";

const current: TransactionRecord = {
  id: "expense-1",
  type: "expense",
  amount: 10,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Coffee",
  date: "2026-08-16T09:00:00.000Z",
  note: "Central Cafe",
  place: { provider: "google", placeId: "central-cafe" },
  status: "synced",
  createdAt: "2026-08-16T09:00:00.000Z",
  updatedAt: "2026-08-16T09:00:00.000Z",
};

const createInput: TransactionInput = {
  type: "expense",
  amount: 10,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Coffee",
  date: "2026-08-16T09:00:00.000Z",
  note: "",
  place: { provider: "google", placeId: "central-cafe" },
};

const createWithoutPlace: TransactionInput = {
  ...createInput,
  note: "Lunch",
  place: undefined,
};

describe("transaction place metadata", () => {
  it("distinguishes omitted preserve, valid set, and explicit clear", () => {
    expect(applyTransactionUpdate(current, { amount: 11 }).place).toEqual(
      current.place,
    );
    expect(
      applyTransactionUpdate(current, {
        place: { provider: "google", placeId: "  replacement  " },
      }).place,
    ).toEqual({ provider: "google", placeId: "replacement" });
    expect(applyTransactionUpdate(current, { place: null })).not.toHaveProperty(
      "place",
    );
  });

  it("clears place when the updated note is blank", () => {
    expect(applyTransactionUpdate(current, { note: "   " })).not.toHaveProperty(
      "place",
    );
  });

  it("rejects setting a place alongside a blank note", () => {
    expect(() =>
      applyTransactionUpdate(current, {
        note: "",
        place: { provider: "google", placeId: "replacement" },
      }),
    ).toThrow("Place metadata requires a nonblank note");
  });

  it.each([
    { place: undefined },
    { place: { provider: "other", placeId: "x" } },
    { place: { provider: "google", placeId: "   " } },
  ] as unknown as TransactionUpdateInput[])(
    "rejects malformed own place patches",
    (input) => {
      expect(() => applyTransactionUpdate(current, input)).toThrow(
        InvalidTransactionPlaceError,
      );
    },
  );

  it("requires a nonblank note when creating place metadata", () => {
    expect(() => normalizeTransactionInput(createInput)).toThrow(
      "Place metadata requires a nonblank note",
    );
  });

  it("treats an undefined optional create place as absent", () => {
    expect(normalizeTransactionInput(createWithoutPlace)).not.toHaveProperty(
      "place",
    );
  });

  it("parses only complete recognized Sheet pairs", () => {
    expect(parseSheetTransactionPlace("Cafe", " google ", " id-1 ")).toEqual({
      provider: "google",
      placeId: "id-1",
    });
    expect(parseSheetTransactionPlace("", "google", "id-1")).toBeUndefined();
    expect(parseSheetTransactionPlace("Cafe", "google", "")).toBeUndefined();
    expect(parseSheetTransactionPlace("Cafe", "other", "id-1")).toBeUndefined();
  });

  it("retains an older explicit intent across unrelated edits", () => {
    expect(composePlaceUpdateIntent("clear", { amount: 12 })).toBe("clear");
    expect(composePlaceUpdateIntent("set", { note: "Edited Cafe" })).toBe("set");
    expect(composePlaceUpdateIntent("clear", {
      place: { provider: "google", placeId: "new-id" },
    })).toBe("set");
    expect(composePlaceUpdateIntent("set", { place: null })).toBe("clear");
  });

  it("compares provider and ID values", () => {
    expect(sameTransactionPlace(current.place, { ...current.place! })).toBe(true);
    expect(sameTransactionPlace(current.place, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```bash
npm run test -- src/lib/transactionPlace.test.ts
```

Expected: FAIL because the new types and module do not exist.

- [ ] **Step 3: Add exact public types**

In `src/lib/types.ts`, add:

```ts
export type TransactionPlace = {
  provider: "google";
  placeId: string;
};

export type PlaceUpdateIntent = "preserve" | "set" | "clear";
```

Add `place?: TransactionPlace` to `TransactionInput`, add this patch type after the interface, and add the local-only intent to `TransactionRecord`:

```ts
export type TransactionUpdateInput =
  Partial<Omit<TransactionInput, "place">> & {
    place?: TransactionPlace | null;
  };

export interface TransactionRecord extends TransactionInput {
  placeUpdateIntent?: PlaceUpdateIntent;
}
```

Insert `placeUpdateIntent` into the existing `TransactionRecord` body alongside its other optional
local-only fields; do not replace the record's ID, status, timestamps, scope, Sheet provenance, delete
intent, or error fields.

- [ ] **Step 4: Implement strict and tolerant place helpers**

Create `src/lib/transactionPlace.ts` with these exports and rules:

```ts
import type {
  PlaceUpdateIntent,
  TransactionInput,
  TransactionPlace,
  TransactionRecord,
  TransactionUpdateInput,
} from "./types";

const owns = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

export class InvalidTransactionPlaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransactionPlaceError";
  }
}

export function hasOwnPlaceUpdate(input: TransactionUpdateInput): boolean {
  return owns(input, "place");
}

export function normalizeTransactionPlace(value: unknown): TransactionPlace {
  if (!value || typeof value !== "object") {
    throw new InvalidTransactionPlaceError("Invalid place metadata");
  }
  const candidate = value as { provider?: unknown; placeId?: unknown };
  const placeId =
    typeof candidate.placeId === "string" ? candidate.placeId.trim() : "";
  if (candidate.provider !== "google" || !placeId) {
    throw new InvalidTransactionPlaceError("Invalid place metadata");
  }
  return { provider: "google", placeId };
}

export function parseSheetTransactionPlace(
  note: unknown,
  provider: unknown,
  placeId: unknown,
): TransactionPlace | undefined {
  if (typeof note !== "string" || !note.trim()) return undefined;
  if (String(provider ?? "").trim() !== "google") return undefined;
  const normalizedId = String(placeId ?? "").trim();
  return normalizedId
    ? { provider: "google", placeId: normalizedId }
    : undefined;
}

export function normalizeTransactionInput<T extends TransactionInput>(
  input: T,
): T {
  if (input.place === undefined) {
    const { place: _omittedPlace, ...withoutPlace } = input;
    return withoutPlace as T;
  }
  const place = normalizeTransactionPlace(input.place);
  if (!input.note?.trim()) {
    throw new InvalidTransactionPlaceError(
      "Place metadata requires a nonblank note",
    );
  }
  return { ...input, place } as T;
}

export function applyTransactionUpdate<T extends TransactionRecord>(
  current: T,
  input: TransactionUpdateInput,
): T {
  const hasPlacePatch = hasOwnPlaceUpdate(input);
  const requestedPlace = input.place;
  const { place: _ignored, ...ordinaryFields } = input;
  const next = { ...current, ...ordinaryFields } as T;

  let place = current.place;
  if (hasPlacePatch) {
    if (requestedPlace === undefined) {
      throw new InvalidTransactionPlaceError("Invalid place metadata");
    }
    place = requestedPlace === null
      ? undefined
      : normalizeTransactionPlace(requestedPlace);
  }
  if (!next.note?.trim()) {
    if (hasPlacePatch && requestedPlace !== null) {
      throw new InvalidTransactionPlaceError(
        "Place metadata requires a nonblank note",
      );
    }
    place = undefined;
  }
  if (place) next.place = place;
  else delete next.place;
  return next;
}

export function composePlaceUpdateIntent(
  previous: PlaceUpdateIntent | undefined,
  input: TransactionUpdateInput,
): PlaceUpdateIntent {
  if (hasOwnPlaceUpdate(input)) {
    if (input.place === undefined) {
      throw new InvalidTransactionPlaceError("Invalid place metadata");
    }
    return input.place === null ? "clear" : "set";
  }
  if (owns(input, "note") && !input.note?.trim()) return "clear";
  return previous === "set" || previous === "clear" ? previous : "preserve";
}

export function withoutTransactionPlace<T extends TransactionRecord>(
  record: T,
): T {
  const next = { ...record };
  delete next.place;
  return next;
}

export function sameTransactionPlace(
  left?: TransactionPlace,
  right?: TransactionPlace,
): boolean {
  return left?.provider === right?.provider && left?.placeId === right?.placeId;
}
```

- [ ] **Step 5: Run the place-domain tests and typecheck**

Run:

```bash
npm run test -- src/lib/transactionPlace.test.ts
npx tsc --noEmit
```

Expected: the new test passes and TypeScript reports no errors.

- [ ] **Step 6: Commit the domain boundary**

```bash
git add src/lib/types.ts src/lib/transactionPlace.ts src/lib/transactionPlace.test.ts
git commit -m "feat: add transaction place metadata"
```

## Task 2: Extend transaction rows and Google adapters to A:N

**Files:**
- Modify: `src/lib/transactionRows.ts`
- Test: `src/lib/transactionRows.test.ts`
- Modify: `src/lib/google.ts`
- Modify: `src/lib/mock/mockGoogle.ts`
- Test: `src/lib/googleTransactions.test.ts`

- [ ] **Step 1: Write failing A:N row tests**

Extend `src/lib/transactionRows.test.ts` with exact expectations:

```ts
const placeTransaction: TransactionRecord = {
  id: "income-1",
  type: "income",
  amount: 40,
  category: "Reimbursement",
  note: "Central Cafe",
  date: "2026-08-15T11:00:00.000Z",
  createdAt: "2026-08-15T11:00:00.000Z",
  updatedAt: "2026-08-15T11:00:00.000Z",
  currency: "THB",
  account: "Bank",
  for: "Me",
  status: "pending",
  reimbursesTransactionId: "expense-1",
  place: { provider: "google", placeId: "central-cafe" },
};

it("keeps K/L stable and adds place metadata in M/N", () => {
  expect(TRANSACTION_HEADERS).toHaveLength(14);
  expect(TRANSACTION_HEADERS.slice(10)).toEqual([
    "Id",
    "Reimburses Id",
    "Place Provider",
    "Place ID",
  ]);

  const serialized = serializeTransactionRow({
    ...placeTransaction,
    note: "Central Cafe",
    place: { provider: "google", placeId: "central-cafe" },
  });
  expect(serialized.slice(10)).toEqual([
    placeTransaction.id,
    placeTransaction.reimbursesTransactionId ?? "",
    "google",
    "central-cafe",
  ]);
});

it.each([
  [legacyElevenColumns, "A:K"],
  [[...legacyElevenColumns, "source-id"], "A:L"],
])("parses legacy %s rows without place metadata", (row) => {
  expect(parseTransactionRow(row, 2).place).toBeUndefined();
});

it("parses only a complete M/N pair with a nonblank note", () => {
  const row = [...legacyElevenColumns, "", " google ", " central-cafe "];
  expect(parseTransactionRow(row, 2).place).toEqual({
    provider: "google",
    placeId: "central-cafe",
  });
  expect(parseTransactionRow([...row.slice(0, 4), "", ...row.slice(5)], 2).place)
    .toBeUndefined();
  expect(parseTransactionRow([...row.slice(0, 13), ""], 2).place)
    .toBeUndefined();
});

it("literalizes formula-like provider and place IDs for USER_ENTERED writes", () => {
  const row = serializeTransactionRowForUserEntered({
    ...placeTransaction,
    place: {
      provider: "=IMPORTXML(1)",
      placeId: "\n+SUM(1)",
    } as unknown as TransactionPlace,
  });
  expect(row[12]).toBe("'=IMPORTXML(1)");
  expect(row[13]).toBe("'\n+SUM(1)");
});
```

Add `TransactionPlace` to the test's type imports for the hostile provider boundary case.

- [ ] **Step 2: Write failing Google request and mock tests**

In `src/lib/googleTransactions.test.ts`, import `ensurePlaceHeaders` from both real and mock adapters,
then require:

```ts
await ensureHeaders(ACCESS_TOKEN, SHEET_ID);
await ensurePlaceHeaders(ACCESS_TOKEN, SHEET_ID);

expect(requestAt(fetchMock, 0)[0]).toContain("Transactions!A1:N1");
expect(requestAt(fetchMock, 1)).toEqual([
  "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!M1:N1?valueInputOption=RAW",
  expect.objectContaining({
    method: "PUT",
    body: JSON.stringify({ values: [["Place Provider", "Place ID"]] }),
  }),
]);
```

Change append/update/recent/by-ID URL assertions from A:L to A:N and assert the serialized body has
14 values with M/N in indices 12/13. Add a mock round-trip that appends a record with `place`, reads it
through `getRecentMockTransactions` and `readMockTransactionById`, and proves
`placeUpdateIntent` is absent from the remote-shaped result.

- [ ] **Step 3: Run the row and adapter tests and verify RED**

Run:

```bash
npm run test -- src/lib/transactionRows.test.ts src/lib/googleTransactions.test.ts
```

Expected: failures show 12-column headers/ranges and missing place-header API.

- [ ] **Step 4: Implement A:N row serialization and parsing**

In `src/lib/transactionRows.ts`:

```ts
export const TRANSACTION_HEADERS = [
  "Date", "Type", "Amount", "Category", "Note", "Timestamp",
  "Device/Source", "Currency", "Account", "For", "Id",
  "Reimburses Id", "Place Provider", "Place ID",
] as const;
```

Append these serializer cells:

```ts
transaction.place?.provider ?? "",
transaction.place?.placeId ?? "",
```

Extend `USER_ENTERED_TEXT_COLUMNS` to include `12` and `13`. Destructure provider/ID from the row and
set:

```ts
place: parseSheetTransactionPlace(note, placeProviderRaw, placeIdRaw),
```

Keep core `sheetRowValid` based only on the existing type, amount, and stable-ID checks.

- [ ] **Step 5: Implement exact Google and mock adapter changes**

In `src/lib/google.ts`, add:

```ts
export async function ensurePlaceHeaders(
  accessToken: string,
  spreadsheetId: string,
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!M1:N1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [[...TRANSACTION_HEADERS.slice(12, 14)]] }),
  });
}
```

Change only full transaction ranges to A:N:

```text
ensureHeaders:              A1:N1
appendTransaction:          A:N:append
updateRow:                  A{row}:N{row}
getRecentTransactions:      A{start}:N{end}
readTransactionById:        A{row}:N{row}
```

Keep K ID-map/count reads and the compact H:L reimbursement ledger projection unchanged. In
`src/lib/mock/mockGoogle.ts`, add a delayed no-op `ensurePlaceHeaders`; before mock append/update
storage, strip `placeUpdateIntent` from the remote-shaped object while preserving `place`:

```ts
const { placeUpdateIntent: _localIntent, ...remoteTransaction } = transaction;
```

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npm run test -- src/lib/transactionRows.test.ts src/lib/googleTransactions.test.ts
npx tsc --noEmit
```

Expected: both focused suites pass with exact A:N request bodies and legacy compatibility.

- [ ] **Step 7: Commit the Sheet schema**

```bash
git add src/lib/transactionRows.ts src/lib/transactionRows.test.ts \
  src/lib/google.ts src/lib/googleTransactions.test.ts src/lib/mock/mockGoogle.ts
git commit -m "feat: persist transaction place references"
```

## Task 3: Make provider updates preserve, set, and clear safely

**Files:**
- Modify: `src/app/providers/transactions/TransactionsContext.tsx`
- Modify: `src/app/providers/transactions/TransactionsProvider.tsx`
- Test: `src/app/providers/transactions/TransactionsProvider.test.tsx`
- Modify: `src/components/TransactionFlow/useUpdateTransactionMutation.ts`
- Test: `src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx`

- [ ] **Step 1: Add failing provider contract tests**

Add focused cases to `TransactionsProvider.test.tsx` using the existing harness and Google mocks:

```ts
it("preserves authoritative remote place when a patch omits place", async () => {
  const harness = createProviderHarness();
  const local = transaction("place-preserve", { place: undefined });
  const remote = transaction(local.id, {
    note: "Remote Cafe",
    place: { provider: "google", placeId: "remote-cafe" },
    sheetRow: 7,
    targetSheetId: undefined,
    targetUserId: undefined,
  });
  await db.transactions.put(local);
  googleMocks.readTransactionById.mockResolvedValue(remote);
  googleMocks.readTransactionIdMap.mockResolvedValue(new Map([[local.id, 7]]));

  const updated = await harness.getContext().updateTransaction(local.id, {
    amount: 22,
  });

  expect(googleMocks.updateRow).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    7,
    expect.objectContaining({ place: remote.place, amount: 22 }),
  );
  expect(updated?.place).toEqual(remote.place);
});

it("drops stale local place when the authoritative remote row has none", async () => {
  const harness = createProviderHarness();
  const local = transaction("place-remote-clear", {
    place: { provider: "google", placeId: "stale-local" },
  });
  const remote = transaction(local.id, {
    note: "Remote note",
    place: undefined,
    sheetRow: 9,
    targetSheetId: undefined,
    targetUserId: undefined,
  });
  await db.transactions.put(local);
  googleMocks.readTransactionById.mockResolvedValue(remote);
  googleMocks.readTransactionIdMap.mockResolvedValue(new Map([[local.id, 9]]));

  const updated = await harness.getContext().updateTransaction(local.id, {
    amount: 23,
  });

  expect(googleMocks.updateRow.mock.calls.at(-1)?.[3]).not.toHaveProperty(
    "place",
  );
  expect(updated).not.toHaveProperty("place");
});

it("keeps a queued clear through a later unrelated offline edit", async () => {
  providerState.isOnline = false;
  const harness = createProviderHarness();
  const record = transaction("queued-clear", {
    place: { provider: "google", placeId: "old-place" },
  });
  await db.transactions.put(record);

  await harness.getContext().updateTransaction(record.id, {
    note: "",
    place: null,
  });
  await harness.getContext().updateTransaction(record.id, { amount: 44 });

  expect(await db.transactions.get(record.id)).toMatchObject({
    amount: 44,
    placeUpdateIntent: "clear",
    status: "pending",
  });
  expect((await db.transactions.get(record.id))?.place).toBeUndefined();
});

it("keeps a queued set through a later unrelated offline edit", async () => {
  providerState.isOnline = false;
  const harness = createProviderHarness();
  const record = transaction("queued-set", { place: undefined });
  await db.transactions.put(record);

  await harness.getContext().updateTransaction(record.id, {
    note: "Central Cafe",
    place: { provider: "google", placeId: "central-cafe" },
  });
  await harness.getContext().updateTransaction(record.id, { account: "Bank" });

  expect(await db.transactions.get(record.id)).toMatchObject({
    account: "Bank",
    place: { provider: "google", placeId: "central-cafe" },
    placeUpdateIntent: "set",
  });
});
```

Add a parameterized direct `set`/`clear` test that records `header` then `row`, and proves the stored
record has the expected place with no intent. Add cases proving malformed create/update rejects
before Dexie/Google writes, a header failure queues the same intent without `updateRow`, a never-synced
new row gets no existing-row intent, and compensation copies place but not intent.

Add two deterministic concurrency regressions using the file's existing `deferred`, `transaction`,
`providerState`, `googleMocks`, and `createProviderHarness` helpers:

1. With `providerState.isOnline = false`, use real IndexedDB reads and start clear and amount updates
   from two provider harnesses. Import Dexie and spy only on the first `db.transactions.put`: signal
   entry, then wait on a deferred gate with `Dexie.currentTransaction
   ? Dexie.waitFor(gate.promise) : gate.promise` before delegating to the bound original `put`. Start
   the clear, await first-put entry, start the amount update, yield one zero-delay task, then release
   the gate and await both calls. Against read-then-put, the amount write occurs while the older clear
   is paused and is then overwritten; inside the required `rw` transaction, the second transaction
   waits and reads the committed clear before composing. Assert the final pending row contains the
   newer amount and `placeUpdateIntent: "clear"` with no place. Never mock transactional `get` or await
   an unwrapped external promise inside a Dexie transaction.
2. With the first harness online, defer `googleMocks.updateRow`. After it starts, create an offline
   second harness and queue a place `set`; then release the direct write. Assert the direct-success
   local commit cannot replace the newer pending row or its `set` intent, and the provider schedules a
   follow-up sync only after the Sheet lock is released.

In
`useUpdateTransactionMutation.test.tsx`, require `place: null` to forward unchanged while retaining
`networkMode: "always"` and all four invalidations.

- [ ] **Step 2: Run provider and mutation tests and verify RED**

```bash
npm run test -- src/app/providers/transactions/TransactionsProvider.test.tsx \
  src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx
```

Expected: failures show spread-based preservation, missing intent/header assurance, and the old patch
type.

- [ ] **Step 3: Update context and mutation signatures**

Import `TransactionUpdateInput` and use:

```ts
updateTransaction: (
  id: string,
  input: TransactionUpdateInput,
) => Promise<TransactionRecord | undefined>;
```

Use the same type for mutation variables. Retain the existing missing/error-record handling, network
mode, and invalidations.

- [ ] **Step 4: Normalize creates and atomically compose queued update state**

Import real/mock `ensurePlaceHeaders` and the place helpers. At the start of
`addTransactionLocally`, before ID creation or Dexie mutation, use:

```ts
const normalizedInput = normalizeTransactionInput(input);
```

Build the record and recent-category update from `normalizedInput`. Change `lockLinkedInput`,
`updateTransactionUnlocked`, and the public callback to `TransactionUpdateInput`.

Extract `queueTransactionUpdate(id, input, now, expectedRevision?)` and make the entire latest-read,
optional expected-revision comparison, scope/delete check, linked-input locking, intent composition,
patch application, and pending `put` one
`db.transaction("rw", db.transactions, async queue callback)`. IndexedDB serializes that write
transaction across tabs/connections, so a second updater observes the first updater's committed intent.
Normal offline updates omit `expectedRevision` and therefore serialize and compose in transaction
order. A fallback from a previously attempted direct write supplies the exact captured revision; if
the current row no longer matches, return it as superseded without applying the older patch.
Inside that transaction create queued state with:

```ts
if (
  expectedRevision &&
  !isSameProviderRevision(transaction, expectedRevision)
) {
  return { kind: "superseded" as const, record: transaction };
}

const targetsExistingRow =
  transaction.status === "synced" ||
  transaction.sheetId !== undefined ||
  transaction.sheetRow !== undefined ||
  transaction.placeUpdateIntent !== undefined;

const nextPlaceIntent = targetsExistingRow
  ? composePlaceUpdateIntent(transaction.placeUpdateIntent, safeInput)
  : undefined;

const queuedRecord: TransactionRecord = {
  ...applyTransactionUpdate(transaction, safeInput),
  status: "pending",
  sheetRow: undefined,
  error: undefined,
  updatedAt: now,
  ...(nextPlaceIntent ? { placeUpdateIntent: nextPlaceIntent } : {}),
};
if (!nextPlaceIntent) delete queuedRecord.placeUpdateIntent;
await db.transactions.put(queuedRecord);
```

Delete `placeUpdateIntent` before the `put` when `nextPlaceIntent` is undefined. Every offline and
direct-failure fallback must call this helper; there is no read-then-put fallback. An omitted patch
retains an existing queued `set`/`clear`; an explicit object or null replaces it. A local new row with
no remote provenance keeps the property absent.

- [ ] **Step 5: Apply patches after the authoritative direct read**

Inside the sheet lock, retain the exact `latestTransaction` local revision captured before any remote
read. After reading `remoteChild` and locking linked fields, calculate:

```ts
const directPlaceIntent = composePlaceUpdateIntent(undefined, safeInput);
const remoteAuthoritativeBase: TransactionRecord = {
  ...latestTransaction,
  ...remoteChild,
  id: latestTransaction.id,
  status: "synced",
  sheetId,
  sheetRow: rowToUpdate,
};
if (!remoteChild.place) delete remoteAuthoritativeBase.place;

const updatedRecord: TransactionRecord = {
  ...applyTransactionUpdate(remoteAuthoritativeBase, safeInput),
  updatedAt: now,
  error: undefined,
};
delete updatedRecord.placeUpdateIntent;

if (directPlaceIntent === "set" || directPlaceIntent === "clear") {
  await mutationGuard.assertOwnership();
  await ensurePlaceHeaders(accessToken, sheetId);
}
```

Add a provider-local comparator and use it inside the commit transaction; do not rely on timestamp
alone because two tabs can write in the same millisecond:

```ts
function isSameProviderRevision(
  current: TransactionRecord,
  expected: TransactionRecord,
): boolean {
  return (
    current.id === expected.id &&
    current.status === expected.status &&
    current.deleteIntent === expected.deleteIntent &&
    current.createdAt === expected.createdAt &&
    current.updatedAt === expected.updatedAt &&
    current.targetSheetId === expected.targetSheetId &&
    current.targetUserId === expected.targetUserId &&
    current.sheetId === expected.sheetId &&
    current.sheetRow === expected.sheetRow &&
    current.sheetRowValid === expected.sheetRowValid &&
    current.error === expected.error &&
    current.placeUpdateIntent === expected.placeUpdateIntent &&
    current.type === expected.type &&
    current.amount === expected.amount &&
    current.currency === expected.currency &&
    current.account === expected.account &&
    current.for === expected.for &&
    current.category === expected.category &&
    current.date === expected.date &&
    (current.note ?? "") === (expected.note ?? "") &&
    (current.reimbursesTransactionId ?? "") ===
      (expected.reimbursesTransactionId ?? "") &&
    sameTransactionPlace(current.place, expected.place)
  );
}
```

Then call `updateRow`. After the second ownership check, use a Dexie `rw` transaction to re-read the
local row and compare status, timestamps, scope/provenance, delete intent, place intent, ordinary
transaction content, and place content with the captured `latestTransaction`. Put `updatedRecord` only
when that revision is still exact. Deleting the property before this conditional full-record `put` is
required; do not persist an own `placeUpdateIntent: undefined`.

If the CAS misses and the current same-scope row is pending/error/delete-intent, preserve it and return
it; after the Sheet lock releases, schedule `performSync` when online. If the row disappeared or moved
scope, re-read K under the still-held guard and roll the just-written row back to `remoteChild` when the
stable ID still exists. Never call public sync while holding the Sheet lock. Re-throw
`InvalidTransactionPlaceError` rather than converting it to a network fallback.

For network/header failures, call the atomic queue helper with both the original patch and the exact
captured `latestTransaction` revision. Inside its Dexie transaction, compare the current row with that
expected revision first. If they differ, return `{ kind: "superseded", record: current }` without
applying the older patch or its older `now`; preserve the newer pending/error/delete row and schedule a
follow-up sync after the Sheet lock releases. Only an exact revision may compose and queue the failed
patch. Offline calls that never entered the direct path omit the optional expected value and therefore
still perform one atomic read/compose/write transaction; concurrent offline patches compose in the
IndexedDB serialization order.

Add a third deterministic concurrency regression: defer an older direct place `clear`, let another
provider queue a newer place `set`, then reject the older remote operation. The fallback must leave the
newer set, note, intent, and `updatedAt` byte-for-byte intact and schedule only the follow-up sync.

- [ ] **Step 6: Preserve place on compensation without preserving intent**

Both `undoLastUnlocked` and the non-linked fallback in `deleteTransactionUnlocked` already build a
`const compensating: TransactionRecord` by spreading the original record. In each function, insert the
same line immediately before `await db.transactions.add(compensating)`:

```ts
delete compensating.placeUpdateIntent;
```

to each new compensating row so it keeps `place` as append content without update-only state.

- [ ] **Step 7: Run focused checks and commit**

```bash
npm run test -- src/app/providers/transactions/TransactionsProvider.test.tsx \
  src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx
npx tsc --noEmit
git add src/app/providers/transactions/TransactionsContext.tsx \
  src/app/providers/transactions/TransactionsProvider.tsx \
  src/app/providers/transactions/TransactionsProvider.test.tsx \
  src/components/TransactionFlow/useUpdateTransactionMutation.ts \
  src/components/TransactionFlow/useUpdateTransactionMutation.test.tsx
git commit -m "feat: queue explicit place updates"
```

Expected: provider/mutation suites and typecheck pass.

## Task 4: Reconcile place intent during sync

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

- [ ] **Step 1: Write failing sync ordering and reconciliation tests**

Add real/mock `ensurePlaceHeaders` doubles and reset them in `beforeEach`. Add:

```ts
it("assures M/N once before appending place-bearing rows", async () => {
  const events: string[] = [];
  googleMocks.ensurePlaceHeaders.mockImplementation(async () => {
    events.push("header");
  });
  googleMocks.appendTransaction.mockImplementation(async () => {
    events.push("append");
    return 4;
  });
  await db.transactions.bulkAdd([
    transaction("place-a", {
      note: "Cafe A",
      place: { provider: "google", placeId: "a" },
    }),
    transaction("place-b", {
      note: "Cafe B",
      place: { provider: "google", placeId: "b" },
    }),
  ]);

  await syncPendingTransactions("access-token", "sheet-a", "user-a");

  expect(events).toEqual(["header", "append", "append"]);
});

it.each([
  {
    intent: "preserve",
    pendingPlace: undefined,
    expected: { provider: "google", placeId: "remote" },
  },
  {
    intent: "set",
    pendingPlace: { provider: "google", placeId: "queued" },
    expected: { provider: "google", placeId: "queued" },
  },
  { intent: "clear", pendingPlace: undefined, expected: undefined },
] as const)("reconciles existing $intent intent", async ({ intent, pendingPlace, expected }) => {
  const pending = transaction(`intent-${intent}`, {
    note: "Cafe",
    place: pendingPlace,
    placeUpdateIntent: intent,
  });
  const remote = transaction(pending.id, {
    note: "Cafe",
    place: { provider: "google", placeId: "remote" },
    status: "synced",
    targetSheetId: undefined,
    targetUserId: undefined,
    sheetId: "sheet-a",
    sheetRow: 8,
  });
  await db.transactions.put(pending);
  googleMocks.readTransactionIdMap.mockResolvedValue(new Map([[pending.id, 8]]));
  googleMocks.readTransactionById.mockResolvedValue(remote);

  await syncPendingTransactions("access-token", "sheet-a", "user-a");

  expect((await db.transactions.get(pending.id))?.place).toEqual(expected);
  expect((await db.transactions.get(pending.id))?.placeUpdateIntent)
    .toBeUndefined();
});
```

Add cases proving: plain append skips the header; set/clear assure before update even when parsed
content appears equal; a place-bearing existing-ID retry without an intent assures M/N before writing;
header failure performs no row mutation and retains pending intent; a deferred
completion cannot mark synced after only intent/revision changes; rollback restores remote place; a
legacy missing-intent row retains full-record last-write-wins; successful remote writes never contain
`placeUpdateIntent`.

For the equal-content existing-ID retry, make remote and pending A:N content identical, assert
`ensurePlaceHeaders` runs, `updateRow` does not run, and the local row is marked synced only after the
header call succeeds. Reject the header in a companion case and assert the row remains pending.

- [ ] **Step 2: Run sync tests and verify RED**

```bash
npm run test -- src/lib/sync.test.ts
```

Expected: failures show relation-only authoritative merging, place-insensitive equality/CAS, and no
place-header ordering.

- [ ] **Step 3: Add once-per-sync place-header assurance**

Import real/mock `ensurePlaceHeaders` and add beside `ensureLinkedHeader`:

```ts
let placeHeadersReady = false;

const ensurePlaceHeader = async () => {
  if (placeHeadersReady) return;
  await mutationGuard.assertOwnership();
  await ensurePlaceHeaders(accessToken, sheetId);
  placeHeadersReady = true;
};
```

For a new append, first set `const appendItem = normalizeTransactionInput(item)`, then call the place
assurer before `appendTransaction` when `appendItem.place` exists and serialize `appendItem` rather than
the unchecked snapshot. Reimbursement and place assurances remain independent and both precede append
when both apply.

- [ ] **Step 4: Split Sheet equality from pending-revision equality**

Extend `hasSameTransactionContent` with:

```ts
sameTransactionPlace(left.place, right.place)
```

Do not compare `placeUpdateIntent` there because it is not remote content. Add only to
`isSamePendingRevision`:

```ts
current.placeUpdateIntent === attempted.placeUpdateIntent
```

- [ ] **Step 5: Resolve place after the authoritative row read**

Rename `applyAuthoritativeRelation` to `applyAuthoritativeSheetFields`, retain its linked-field rules,
and add:

```ts
function applyAuthoritativePlace(
  pending: TransactionRecord,
  remote: TransactionRecord,
): TransactionRecord {
  switch (pending.placeUpdateIntent) {
    case "preserve":
      return remote.place
        ? { ...pending, place: remote.place }
        : withoutTransactionPlace(pending);
    case "set":
      return {
        ...pending,
        place: normalizeTransactionPlace(pending.place),
      };
    case "clear":
      return withoutTransactionPlace(pending);
    default:
      return pending;
  }
}
```

Export `withoutTransactionPlace(record)` from `transactionPlace.ts` as a clone that deletes the
property; never serialize `place: undefined` or `place: null`. Validate the final note/place invariant
at the exact existing-ID call site before any header or row mutation:

```ts
const authoritativeFields = applyAuthoritativeSheetFields(item, remote);
const itemForWrite = normalizeTransactionInput(
  applyAuthoritativePlace(authoritativeFields, remote),
);
```

- [ ] **Step 6: Force and finalize explicit existing-row writes**

Before `updateRow`:

```ts
const explicitPlaceWrite =
  item.placeUpdateIntent === "set" ||
  item.placeUpdateIntent === "clear";

if (explicitPlaceWrite || itemForWrite.place) {
  await ensurePlaceHeader();
}

const didUpdateRemote =
  explicitPlaceWrite ||
  !hasSameTransactionContent(remote, itemForWrite);
```

Header assurance intentionally precedes the equality skip, so an equal-content retry whose original
append reached Sheets before local CAS missed—and a legacy place-bearing pending row—repairs M/N
headers even when no row update is needed. The forced explicit write normalizes malformed raw M/N
cells.

Extend `updatePendingRevision` with an optional `clearPlaceUpdateIntent = false` parameter. Inside its
existing Dexie `rw` transaction, after the exact revision comparison, build a full clone from the
current row plus `updates`; when the flag is true, `delete next.placeUpdateIntent`, then `put(next)`.
This keeps the deletion and revision comparison atomic. Retry/error callers retain the default false
and therefore preserve the intent. At both successful append and successful existing-ID completion
call sites, call it with `true`; the existing-ID update also includes:

```ts
place: itemForWrite.place,
```

Assert the synced Dexie record with `not.toHaveProperty("placeUpdateIntent")`. Rollback writes the
authoritative remote record through A:N and restores its place.

- [ ] **Step 7: Run regression tests and commit**

```bash
npm run test -- src/lib/sync.test.ts \
  src/app/providers/transactions/TransactionsProvider.test.tsx \
  src/lib/googleTransactions.test.ts
npx tsc --noEmit
git add src/lib/sync.ts src/lib/sync.test.ts src/lib/transactionPlace.ts \
  src/lib/transactionPlace.test.ts
git commit -m "feat: reconcile place metadata during sync"
```

Expected: place intent, reimbursement, lock/CAS, rollback, and Google adapter suites pass.

## Task 5: Add atomic place state to transaction forms

**Files:**
- Modify: `src/components/TransactionFlow/transactionSchema.ts`
- Test: `src/components/TransactionFlow/transactionSchema.test.ts`
- Modify: `src/components/TransactionFlow/useTransactionForm.ts`
- Create: `src/components/TransactionFlow/transactionNoteForm.ts`
- Create: `src/components/TransactionFlow/transactionNoteForm.test.ts`
- Modify: `src/components/TransactionFlow/useAddTransactionMutation.ts`
- Create: `src/components/TransactionFlow/useAddTransactionMutation.test.tsx`
- Modify: `src/components/TransactionFlow/flowMode.ts`
- Test: `src/components/TransactionFlow/flowMode.test.ts`
- Test: `src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx`
- Modify: `src/components/TransactionFlow/StepCategory.tsx`
- Create: `src/components/TransactionFlow/StepCategory.test.tsx`

- [ ] **Step 1: Write failing schema and form-transition tests**

Extend `transactionSchema.test.ts` to accept a valid nested Google place and reject a blank ID or
unknown provider. Create `transactionNoteForm.test.ts` with a real `useTransactionForm` harness and:

```ts
it("retains place for nonblank manual edits and clears it for blank edits", () => {
  const { result } = renderHook(() => useTransactionForm({
    initialValues: {
      note: "Central Cafe",
      place: { provider: "google", placeId: "central-cafe" },
    },
  }));

  act(() => setManualTransactionNote(result.current, "Edited Cafe"));
  expect(result.current.state.values).toMatchObject({
    note: "Edited Cafe",
    place: { provider: "google", placeId: "central-cafe" },
  });

  act(() => setManualTransactionNote(result.current, "   "));
  expect(result.current.state.values.note).toBe("   ");
  expect(result.current.state.values.place).toBeUndefined();
});

it("selects and clears note/place atomically", () => {
  const { result } = renderHook(() => useTransactionForm());
  act(() => selectGooglePlace(result.current, {
    displayName: "Central Cafe",
    placeId: " central-cafe ",
  }));
  expect(result.current.state.values).toMatchObject({
    note: "Central Cafe",
    place: { provider: "google", placeId: "central-cafe" },
  });

  act(() => clearTransactionNote(result.current));
  expect(result.current.state.values.note).toBe("");
  expect(result.current.state.values.place).toBeUndefined();
});

it("programmatic free-text replacement clears place", () => {
  const { result } = renderHook(() => useTransactionForm({
    initialValues: {
      note: "Central Cafe",
      place: { provider: "google", placeId: "central-cafe" },
    },
  }));
  act(() => replaceTransactionNote(result.current, "Quick lunch"));
  expect(result.current.state.values.note).toBe("Quick lunch");
  expect(result.current.state.values.place).toBeUndefined();
});
```

Also test `buildPlaceUpdatePatch`: equal references return `{}`, replacement returns the object, and
removal returns `{ place: null }`.

- [ ] **Step 2: Write failing mutation, reimbursement, and category tests**

Create `useAddTransactionMutation.test.tsx` using the existing QueryClient/provider-hook pattern and
assert:

```ts
expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
  note: "Central Cafe",
  place: { provider: "google", placeId: "central-cafe" },
}));
```

In `flowMode.test.ts` and `useCreateReimbursementMutation.test.tsx`, give the source expense a place
and assert both reimbursement form defaults and created child input have `place === undefined`.

Create `StepCategory.test.tsx` with the existing children/hooks mocked so the captured radial
`onSelect` and tab `onChange` can be invoked. Assert Quick Note selection replaces note and clears
place; switching from expense to income/transfer clears only place; selecting another expense
category preserves both note and place.

- [ ] **Step 3: Run form/mutation tests and verify RED**

```bash
npm run test -- src/components/TransactionFlow/transactionSchema.test.ts \
  src/components/TransactionFlow/transactionNoteForm.test.ts \
  src/components/TransactionFlow/useAddTransactionMutation.test.tsx \
  src/components/TransactionFlow/flowMode.test.ts \
  src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx \
  src/components/TransactionFlow/StepCategory.test.tsx
```

Expected: failures show missing form place state/helpers and source-place omission contracts.

- [ ] **Step 4: Extend the form schema and defaults**

Add this schema field:

```ts
place: z
  .object({
    provider: z.literal("google"),
    placeId: z.string().trim().min(1, "Place ID is required"),
  })
  .optional(),
```

Add `place: options?.initialValues?.place` to `useTransactionForm` defaults. Add
`place: undefined` to `getReimbursementFormDefaults`; it must not inspect or copy `source.place`.

- [ ] **Step 5: Implement shared atomic form helpers**

Create `transactionNoteForm.ts`:

```ts
import { sameTransactionPlace } from "../../lib/transactionPlace";
import type { TransactionPlace, TransactionUpdateInput } from "../../lib/types";
import type { TransactionFormApi } from "./useTransactionForm";

export type ResolvedPlaceSelection = {
  displayName: string;
  placeId: string;
};

export function setManualTransactionNote(
  form: TransactionFormApi,
  value: string,
) {
  form.store.batch(() => {
    form.setFieldValue("note", value);
    if (!value.trim()) form.setFieldValue("place", undefined);
  });
}

export function clearTransactionNote(form: TransactionFormApi) {
  form.store.batch(() => {
    form.setFieldValue("note", "");
    form.setFieldValue("place", undefined);
  });
}

export function selectGooglePlace(
  form: TransactionFormApi,
  selection: ResolvedPlaceSelection,
) {
  form.store.batch(() => {
    form.setFieldValue("note", selection.displayName);
    form.setFieldValue("place", {
      provider: "google",
      placeId: selection.placeId.trim(),
    });
  });
}

export function replaceTransactionNote(
  form: TransactionFormApi,
  value: string,
) {
  form.store.batch(() => {
    form.setFieldValue("note", value);
    form.setFieldValue("place", undefined);
  });
}

export function clearTransactionPlace(form: TransactionFormApi) {
  form.setFieldValue("place", undefined);
}

export function buildPlaceUpdatePatch(
  original: TransactionPlace | undefined,
  current: TransactionPlace | undefined,
): Pick<TransactionUpdateInput, "place"> | Record<string, never> {
  return sameTransactionPlace(original, current)
    ? {}
    : { place: current ?? null };
}
```

- [ ] **Step 6: Wire mutation and category boundaries**

In `useAddTransactionMutation`, conditionally include the optional field so ordinary create inputs do
not acquire an own `place: undefined` property:

```ts
...(values.place ? { place: values.place } : {}),
```

In `StepCategory`, replace the Quick Note's direct note setter with:

```ts
replaceTransactionNote(form, selectedNote.note ?? "");
```

In `handleTypeChange`, after setting the next type:

```ts
if (nextType !== "expense") clearTransactionPlace(form);
```

Do not clear place for an expense category change. Keep `useCreateReimbursementMutation`'s builder
place-free; the new regression locks that boundary without adding a source copy.

- [ ] **Step 7: Run focused tests, typecheck, and commit**

```bash
npm run test -- src/components/TransactionFlow/transactionSchema.test.ts \
  src/components/TransactionFlow/transactionNoteForm.test.ts \
  src/components/TransactionFlow/useAddTransactionMutation.test.tsx \
  src/components/TransactionFlow/flowMode.test.ts \
  src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx \
  src/components/TransactionFlow/StepCategory.test.tsx
npx tsc --noEmit
git add src/components/TransactionFlow/transactionSchema.ts \
  src/components/TransactionFlow/transactionSchema.test.ts \
  src/components/TransactionFlow/useTransactionForm.ts \
  src/components/TransactionFlow/transactionNoteForm.ts \
  src/components/TransactionFlow/transactionNoteForm.test.ts \
  src/components/TransactionFlow/useAddTransactionMutation.ts \
  src/components/TransactionFlow/useAddTransactionMutation.test.tsx \
  src/components/TransactionFlow/flowMode.ts \
  src/components/TransactionFlow/flowMode.test.ts \
  src/components/TransactionFlow/useCreateReimbursementMutation.test.tsx \
  src/components/TransactionFlow/StepCategory.tsx \
  src/components/TransactionFlow/StepCategory.test.tsx
git commit -m "feat: track places in transaction forms"
```

Expected: all form/mutation/category tests and typecheck pass.

## Task 6: Refactor autocomplete to a controlled note value

**Files:**
- Create: `src/components/TransactionFlow/placeSessionId.ts`
- Create: `src/components/TransactionFlow/placeSessionId.test.ts`
- Modify: `src/components/TransactionFlow/usePlaceAutocomplete.ts`
- Test: `src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`

- [ ] **Step 1: Rewrite hook tests around a controlled value**

Replace drawer-owned `setInput` calls with `rerender({ value })`. Preserve the existing provider and
QueryClient harness, then add:

```ts
const { result, rerender } = renderHook(
  ({ value, active }) => usePlaceAutocomplete({
    value,
    active,
    enabled: true,
    sessionId: "session-a",
    locationBias: { lat: 13.75, lng: 100.5 },
  }),
  { initialProps: { value: "", active: true }, wrapper },
);

rerender({ value: "c", active: true });
await vi.advanceTimersByTimeAsync(250);
expect(createPlaceAutocompleteSession).not.toHaveBeenCalled();

rerender({ value: "central", active: true });
await vi.advanceTimersByTimeAsync(249);
expect(searchPlaceSuggestions).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(1);
expect(searchPlaceSuggestions).toHaveBeenCalledWith(
  "central",
  expect.any(Object),
  { lat: 13.75, lng: 100.5 },
);
```

Add tests for inactive/disabled/no-session states, exact-current-value results, out-of-order query
resolution, normalized whitespace, session-creation failure followed by a changed value/fresh session,
changed-value selection-error reset, structured
`{ displayName, placeId }` selection, deferred selection invalidation, eligibility/session replacement,
unmount cache deletion, and Strict Mode one-session cleanup. Require no public `input`, `setInput`,
`reset`, or `retry` fields.

- [ ] **Step 2: Write the session-ID helper tests**

In `placeSessionId.test.ts`, stub `crypto.randomUUID` and assert its result is used. For the fallback
case, save `globalThis.crypto`, call `vi.stubGlobal("crypto", {})` so the native Node/jsdom UUID method
is genuinely unavailable, freeze `Date.now`, call twice, and assert the fallback IDs differ. Restore
the saved global in `afterEach`. This replaces the private helper currently embedded in `index.tsx`.

- [ ] **Step 3: Run tests and verify RED**

```bash
npm run test -- src/components/TransactionFlow/usePlaceAutocomplete.test.tsx \
  src/components/TransactionFlow/placeSessionId.test.ts
```

Expected: controlled props/result types and extracted session helper are missing.

- [ ] **Step 4: Implement the collision-resistant session helper**

Create `placeSessionId.ts`:

```ts
let fallbackSequence = 0;

export function createPlaceSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  fallbackSequence += 1;
  return `place-${Date.now()}-${fallbackSequence}`;
}
```

- [ ] **Step 5: Change the hook's public contract**

Export:

```ts
export type ResolvedPlaceSuggestion = {
  displayName: string;
  placeId: string;
};

export type UsePlaceAutocompleteOptions = {
  value: string;
  active: boolean;
  enabled: boolean;
  sessionId: string;
  locationBias?: Coordinates;
};

export type UsePlaceAutocompleteResult = {
  suggestions: PlaceSuggestion[];
  isDebouncing: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  sessionError: Error | null;
  hasSearched: boolean;
  isSelecting: boolean;
  selectionError: Error | null;
  selectSuggestion(
    suggestion: PlaceSuggestion,
  ): Promise<ResolvedPlaceSuggestion>;
};
```

Remove internal input state and compute:

```ts
const normalizedValue = normalizeInput(value);
const canLoad = enabled && active && normalizedValue.length >= 2;
const isCurrentDebouncedValue = debouncedValue === normalizedValue;
const canSearch =
  canLoad && isCurrentDebouncedValue && debouncedValue.length >= 2;
```

Start the session query only when `canLoad`. Keep the exact 250 ms debounce, `retry: false`, and both
focus/reconnect refetch flags false. Remove `keepPreviousData`; expose suggestions only when
`canSearch`, the query key matches the controlled value, and the current query succeeds.
Expose `sessionError` separately from the combined generic `error`; suggestion errors recover through
their new input query key, while the owner uses a session error to rotate the provider session on the
next manual edit.

- [ ] **Step 6: Preserve bounded session cleanup and selection safety**

Adapt the existing Strict Mode delayed-cleanup scope instead of deleting it. When active eligibility
ends or session ID changes, cancel and remove exact session/suggestion query prefixes and call
`endPlaceAutocompleteSession`. After `searchPlaceSuggestions` resolves, recheck active/enabled/session
scope before publishing. Selection remains a TanStack mutation and returns:

```ts
return {
  displayName: await resolvePlaceSuggestionName(suggestion, placeSession),
  placeId: suggestion.placeId,
};
```

Recheck value, session, mounted scope, and active/enabled refs after resolution. A value change resets
selection error. Derive:

```ts
const sessionError =
  canLoad && sessionQuery.error instanceof Error
    ? sessionQuery.error
    : null;
const suggestionError =
  canSearch && suggestionQuery.error instanceof Error
    ? suggestionQuery.error
    : null;
const error = sessionError ?? suggestionError;
const isDebouncing = canLoad && !isCurrentDebouncedValue;
const isLoading =
  canLoad &&
  (isDebouncing ||
    sessionQuery.isPending ||
    (canSearch && suggestionQuery.isFetching));
const hasSearched = canSearch && suggestionQuery.isSuccess;

return {
  suggestions:
    canSearch && suggestionQuery.isSuccess
      ? suggestionQuery.data ?? []
      : [],
  isDebouncing,
  isLoading,
  isError: error !== null,
  error,
  sessionError,
  hasSearched,
  isSelecting: selectionMutation.isPending,
  selectionError:
    selectionMutation.error instanceof Error
      ? selectionMutation.error
      : null,
  selectSuggestion: selectionMutation.mutateAsync,
};
```

- [ ] **Step 7: Run controlled-hook tests and commit**

```bash
npm run test -- src/components/TransactionFlow/usePlaceAutocomplete.test.tsx \
  src/components/TransactionFlow/placeSessionId.test.ts
npx tsc --noEmit
git add src/components/TransactionFlow/usePlaceAutocomplete.ts \
  src/components/TransactionFlow/usePlaceAutocomplete.test.tsx \
  src/components/TransactionFlow/placeSessionId.ts \
  src/components/TransactionFlow/placeSessionId.test.ts
git commit -m "refactor: control place autocomplete from note"
```

Expected: debounce, provider-session, stale-result, cleanup, and type checks pass.

## Task 7: Build the unchanged-visual note combobox and clear control

**Files:**
- Create: `src/components/TransactionFlow/TransactionNoteField.tsx`
- Create: `src/components/TransactionFlow/TransactionNoteField.test.tsx`
- Modify: `src/components/TransactionFlow/NearbyPlaceChips.tsx`
- Test: `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`
- Modify: `src/components/TransactionFlow/StepAmount.tsx`
- Test: `src/components/TransactionFlow/StepAmount.test.tsx`

- [ ] **Step 1: Write failing note-field interaction tests**

Create `TransactionNoteField.test.tsx` with this stateful controlled harness and mocked hook before the
cases. The real hook lifecycle remains covered in Task 6; this harness tests note-field arbitration:

```tsx
const centralCafe = {
  placeId: "central-cafe",
  name: "Central Cafe",
  secondaryText: "1 Main Street",
} satisfies PlaceSuggestion;
const centralWorld = {
  placeId: "central-world",
  name: "Central World",
  secondaryText: "2 Main Street",
} satisfies PlaceSuggestion;

const hookState = vi.hoisted(() => ({
  suggestions: [] as PlaceSuggestion[],
  isDebouncing: false,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  sessionError: null as Error | null,
  hasSearched: false,
  isSelecting: false,
  selectionError: null as Error | null,
  selectSuggestion: vi.fn(),
  observedSessionIds: [] as string[],
}));

vi.mock("./usePlaceAutocomplete", () => ({
  usePlaceAutocomplete: (options: { sessionId: string }) => {
    hookState.observedSessionIds.push(options.sessionId);
    return hookState;
  },
}));

function renderField({
  initialValue = "",
  activeResults = [],
  isLoading = false,
  onClear = vi.fn(),
  onSubmit = vi.fn(),
  onPlaceSelect = vi.fn(),
}: {
  initialValue?: string;
  activeResults?: PlaceSuggestion[];
  isLoading?: boolean;
  onClear?: ReturnType<typeof vi.fn>;
  onSubmit?: ReturnType<typeof vi.fn>;
  onPlaceSelect?: ReturnType<typeof vi.fn>;
} = {}) {
  hookState.suggestions = activeResults;
  hookState.isLoading = isLoading;
  hookState.hasSearched = !isLoading;
  hookState.selectSuggestion.mockImplementation(async (suggestion: PlaceSuggestion) => ({
    displayName: suggestion.name,
    placeId: suggestion.placeId,
  }));

  function Harness() {
    const [value, setValue] = useState(initialValue);
    return (
      <TransactionNoteField
        value={value}
        onManualChange={setValue}
        onClear={() => {
          onClear();
          setValue("");
        }}
        onPlaceSelect={(selection) => {
          onPlaceSelect(selection);
          setValue(selection.displayName);
        }}
        onSubmit={onSubmit}
        canSubmit
        places={{
          enabled: true,
          nearbySuggestions: [],
          isNearbyLoading: false,
        }}
      />
    );
  }

  return render(<Harness />);
}
```

Reset every mutable `hookState` field/mock in `beforeEach`. Cover:

```tsx
it("keeps the flat note visual and clears through a 44px trailing control", async () => {
  const user = userEvent.setup();
  const onClear = vi.fn();
  renderField({ initialValue: "Lunch", onClear });

  const input = screen.getByRole("combobox", { name: "Transaction note" });
  expect(input).toHaveClass("bg-transparent", "pr-10");
  const clear = screen.getByRole("button", { name: "Clear note" });
  expect(clear).toHaveClass("absolute", "size-11");
  await user.click(clear);
  expect(onClear).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(input).toHaveFocus());
});

it("suppresses Enter whenever the autocomplete popup is open", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  renderField({ activeResults: [], isLoading: true, onSubmit });
  const input = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(input, "central{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
});

it("navigates options and selects with Enter", async () => {
  const user = userEvent.setup();
  const onPlaceSelect = vi.fn();
  renderField({ activeResults: [centralCafe, centralWorld], onPlaceSelect });
  const input = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(input, "central{ArrowDown}{ArrowDown}{Enter}");
  expect(onPlaceSelect).toHaveBeenCalledWith({
    displayName: "Central World",
    placeId: "central-world",
  });
});
```

Also assert: clear absent when empty; nearby rail only for trimmed-empty input and capped at five; popup
is `absolute`, `z-50`, bounded/scrollable, and contains no `shadow` class; loading/empty/generic-error
live states; Escape; closed Enter submit; IME composition no-op; active descendant; pointer-down blur
protection; outside pointer/blur dismissal; selection error recovery; stale selection after manual edit,
clear, or eligibility loss cannot call `onPlaceSelect`.

For both pointer autocomplete selection and nearby-chip selection, assert the note input is focused
after the selection completes. This locks the same focus-associated contract as keyboard selection.
Also reject the session query once, change the note again, and prove a new session ID is used and
results can recover without an explicit Retry button.
Render the harness with Testing Library's `reactStrictMode: true`, resolve an autocomplete selection,
and assert it still updates the note and restores input focus exactly once after the effect probe.
Add a deferred query whose replacement result list is shorter: changing the controlled value/session
must immediately reset `activeIndex` to `-1`, remove `aria-activedescendant`, and make Enter a no-op
until Arrow navigation selects an in-bounds option. Assert the active option has the chosen visible
background/text token and the polite live region announces loading, result count, empty, and error
changes.

- [ ] **Step 2: Rewrite nearby and StepAmount tests**

In `NearbyPlaceChips.test.tsx`, remove Search cases and require exactly five structured nearby buttons
with no `Search places` control. In `StepAmount.test.tsx`, add an initial place/output and parameterize
create expense, create income, create transfer, edit/delete, reimbursement locks, custom-header Quick
Note, and optional-amount variants.
For each, assert a nonempty note has Clear, clicking clears note/place, and the input regains focus.
Assert nonblank manual edit preserves place and whitespace clears it.

Because `TransactionNoteField` always invokes the TanStack-backed autocomplete hook even when Places
is disabled, replace the suite's bare `render` helper with a fresh client wrapper:

```tsx
const stepAmountQueryClients: QueryClient[] = [];

function renderStepAmount(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  stepAmountQueryClients.push(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

afterEach(() => {
  for (const queryClient of stepAmountQueryClients.splice(0)) {
    queryClient.clear();
  }
});
```

Import type `ReactElement` from `react` and import `QueryClient`/`QueryClientProvider` from
`@tanstack/react-query`, use this helper for every StepAmount render, and retain the suite cleanup
above so no cache or timer survives between cases.

- [ ] **Step 3: Run component tests and verify RED**

```bash
npm run test -- src/components/TransactionFlow/TransactionNoteField.test.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.test.tsx \
  src/components/TransactionFlow/StepAmount.test.tsx
```

Expected: the new component is missing and current StepAmount still renders Search/drawer props with no
clear control.

- [ ] **Step 4: Reduce NearbyPlaceChips to the idle rail**

Remove `Search`, `canSearch`, `onSearch`, and `searchButtonRef`. Keep this public shape:

```ts
type NearbyPlaceChipsProps = {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  onSelect: (suggestion: PlaceSuggestion) => void;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
};
```

Preserve delayed loading and `suggestions.slice(0, 5)`; forward `onPointerDown` to each place button.

- [ ] **Step 5: Implement the note-field public API and visual shell**

Create `TransactionNoteField.tsx` with:

```ts
import type React from "react";

export type PlaceNoteOptions = {
  enabled: boolean;
  nearbySuggestions: PlaceSuggestion[];
  isNearbyLoading: boolean;
  locationBias?: Coordinates;
};

type TransactionNoteFieldProps = {
  value: string;
  onManualChange: (value: string) => void;
  onClear: () => void;
  onPlaceSelect: (selection: ResolvedPlaceSelection) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  places?: PlaceNoteOptions;
};
```

Inside the component, define every ref/state/helper used by the render. Import `cn`, `useCallback`,
`useEffect`, `useId`, `useRef`, and `useState`; use this concrete wiring:

```ts
const rootRef = useRef<HTMLDivElement>(null);
const localInputRef = useRef<HTMLInputElement>(null);
const mountedRef = useRef(true);
const valueRef = useRef(value);
const placesEnabled = places?.enabled === true;
const placesEnabledRef = useRef(placesEnabled);
const [active, setActive] = useState(false);
const activeRef = useRef(false);
const [sessionId, setSessionId] = useState(createPlaceSessionId);
const sessionIdRef = useRef(sessionId);
const [activeIndex, setActiveIndex] = useState(-1);
const generationRef = useRef(0);
const listboxId = useId();
const optionId = (index: number) => `${listboxId}-option-${index}`;

valueRef.current = value;
placesEnabledRef.current = placesEnabled;
sessionIdRef.current = sessionId;

const assignInputRef = useCallback(
  (node: HTMLInputElement | null) => {
    localInputRef.current = node;
    if (typeof inputRef === "function") inputRef(node);
    else if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }
  },
  [inputRef],
);

const autocomplete = usePlaceAutocomplete({
  value,
  active,
  enabled: placesEnabled,
  sessionId,
  locationBias: places?.locationBias,
});

const focusInput = useCallback(() => {
  requestAnimationFrame(() => {
    if (mountedRef.current) localInputRef.current?.focus();
  });
}, []);

const retireLifecycle = useCallback((force = false) => {
  if (!force && !activeRef.current) return;
  activeRef.current = false;
  generationRef.current += 1;
  setActive(false);
  setActiveIndex(-1);
  setSessionId(createPlaceSessionId());
}, []);

const handleManualChange = (nextValue: string) => {
  generationRef.current += 1;
  setActiveIndex(-1);
  if (!activeRef.current || autocomplete.sessionError || autocomplete.isSelecting) {
    setSessionId(createPlaceSessionId());
  }
  activeRef.current = true;
  setActive(true);
  onManualChange(nextValue);
};

const selectOption = async (suggestion: PlaceSuggestion) => {
  const generation = generationRef.current;
  const selectionSessionId = sessionId;
  const selectionValue = value;
  try {
    const selection = await autocomplete.selectSuggestion(suggestion);
    if (
      !mountedRef.current ||
      generationRef.current !== generation ||
      sessionIdRef.current !== selectionSessionId ||
      valueRef.current !== selectionValue ||
      !placesEnabledRef.current
    ) {
      return;
    }
    onPlaceSelect(selection);
    retireLifecycle(true);
    focusInput();
  } catch {
    // The hook exposes the generic selection error in the still-open popup.
  }
};

const handleNearbySelect = (suggestion: PlaceSuggestion) => {
  onPlaceSelect({ displayName: suggestion.name, placeId: suggestion.placeId });
  retireLifecycle(true);
  focusInput();
};

const handleClear = () => {
  onClear();
  retireLifecycle(true);
  focusInput();
};
```

Add effects with exact cleanup/reset responsibilities:

```ts
useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
    generationRef.current += 1;
  };
}, []);

useEffect(() => {
  setActiveIndex(-1);
}, [value, sessionId]);

useEffect(() => {
  setActiveIndex((index) =>
    index >= autocomplete.suggestions.length ? -1 : index,
  );
}, [autocomplete.suggestions.length]);

useEffect(() => {
  if (!placesEnabled && activeRef.current) retireLifecycle();
}, [placesEnabled, retireLifecycle]);

useEffect(() => {
  if (!active) return;
  const handleOutsidePointer = (event: PointerEvent) => {
    const target = event.target;
    if (target instanceof Node && !rootRef.current?.contains(target)) {
      retireLifecycle();
    }
  };
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  return () =>
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
}, [active, retireLifecycle]);
```

Derive only in-bounds active state, generic live copy, and fully defined visible rows:

```tsx
const activeOption = autocomplete.suggestions[activeIndex];
const popupOpen = Boolean(
  placesEnabled &&
  active &&
  value.trim().length >= 2 &&
  (autocomplete.isLoading ||
    autocomplete.isError ||
    autocomplete.selectionError ||
    autocomplete.hasSearched),
);
let liveStatus = "";
if (popupOpen && autocomplete.isLoading) liveStatus = "Searching places";
else if (popupOpen && autocomplete.isError) {
  liveStatus = "Couldn’t search places";
} else if (popupOpen && autocomplete.selectionError) {
  liveStatus = "Couldn’t select that place";
} else if (popupOpen && autocomplete.suggestions.length === 0) {
  liveStatus = "No places found";
} else if (popupOpen) {
  liveStatus = `${autocomplete.suggestions.length} places found`;
}

const renderedOptions = autocomplete.suggestions.map((suggestion, index) => (
  <button
    key={suggestion.placeId}
    id={optionId(index)}
    type="button"
    role="option"
    tabIndex={-1}
    aria-selected={index === activeIndex}
    className={cn(
      "flex min-h-11 w-full flex-col justify-center px-3 py-2 text-left text-sm",
      index === activeIndex && "bg-muted text-foreground",
    )}
    onPointerDown={(event) => event.preventDefault()}
    onClick={() => void selectOption(suggestion)}
  >
    <span>{suggestion.name}</span>
    {suggestion.secondaryText ? (
      <span className="text-xs text-muted-foreground">
        {suggestion.secondaryText}
      </span>
    ) : null}
  </button>
));

const renderedPopupState = autocomplete.isLoading ? (
  <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
    Searching places…
  </p>
) : autocomplete.isError ? (
  <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
    Couldn’t search places.
  </p>
) : autocomplete.suggestions.length === 0 ? (
  <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
    No places found.
  </p>
) : (
  <>
    {autocomplete.selectionError ? (
      <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
        Couldn’t select that place. Choose it again or edit the note.
      </p>
    ) : null}
    {renderedOptions}
  </>
);
```

Render the current tokens with an absolute clear control and overlay:

```tsx
<div ref={rootRef} className="relative mt-4">
  <div className="relative flex items-center gap-3 border-b border-border/10 pb-2 transition-colors focus-within:border-primary/50">
    <FileText className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
    <input
      ref={assignInputRef}
      type="text"
      aria-label="Transaction note"
      role={placesEnabled ? "combobox" : undefined}
      aria-autocomplete={placesEnabled ? "list" : undefined}
      aria-expanded={placesEnabled ? popupOpen : undefined}
      aria-controls={popupOpen ? listboxId : undefined}
      aria-activedescendant={activeOption ? optionId(activeIndex) : undefined}
      className="flex-1 bg-transparent pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      placeholder="Add a note..."
      value={value}
      autoComplete="off"
      onChange={(event) => handleManualChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !rootRef.current?.contains(next)) {
          retireLifecycle();
        }
      }}
    />
    {value ? (
      <button
        type="button"
        aria-label="Clear note"
        className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={handleClear}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : null}
  </div>
  {popupOpen ? (
    <div
      id={listboxId}
      role="listbox"
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface"
    >
      {renderedPopupState}
    </div>
  ) : null}
  <span className="sr-only" aria-live="polite" aria-atomic="true">
    {liveStatus}
  </span>
  {placesEnabled && value.trim() === "" ? (
    <div>
      <NearbyPlaceChips
        suggestions={places?.nearbySuggestions ?? []}
        isLoading={places?.isNearbyLoading ?? false}
        onPointerDown={(event) => event.preventDefault()}
        onSelect={handleNearbySelect}
      />
    </div>
  ) : null}
</div>
```

No class may contain `shadow`. The input receives combobox/list/expanded/controls/active-descendant
attributes only when Places is enabled. Render nearby chips beneath the wrapper only when
`value.trim() === ""`.

- [ ] **Step 6: Implement lifecycle, keyboard, pointer, and ARIA behavior**

Place this keyboard declaration with the other internal handlers before `renderedPopupState` and the
component return. It uses the in-bounds option guard defined in Step 5 and preserves IME input:

```ts
const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.nativeEvent.isComposing) return;
  if (popupOpen && event.key === "Enter") {
    event.preventDefault();
    const selectedOption = autocomplete.suggestions[activeIndex];
    if (selectedOption && !autocomplete.isSelecting) {
      void selectOption(selectedOption);
    }
    return;
  }
  if (popupOpen && event.key === "Escape") {
    event.preventDefault();
    retireLifecycle();
    return;
  }
  if (popupOpen && event.key === "ArrowDown") {
    event.preventDefault();
    setActiveIndex((index) =>
      Math.min(index + 1, autocomplete.suggestions.length - 1),
    );
    return;
  }
  if (popupOpen && event.key === "ArrowUp") {
    event.preventDefault();
    setActiveIndex((index) =>
      index < 0
        ? autocomplete.suggestions.length - 1
        : Math.max(index - 1, 0),
    );
    return;
  }
  if (!popupOpen && event.key === "Enter" && canSubmit) onSubmit();
};
```

Options use `role="option"`, stable IDs, `aria-selected`, and `tabIndex={-1}`. Prevent default during
option pointer-down to avoid the input-blur race. Blur closes only when `relatedTarget` is outside the
root; a capture-phase document pointer listener closes for non-focusable outside targets. Clear calls
`onClear`, retires, and focuses the input in `requestAnimationFrame`.

Reset `activeIndex` to `-1` whenever the controlled normalized value or session ID changes. When a
result list changes, reset it if the current index is outside `autocomplete.suggestions.length`.
Compute `const activeOption = autocomplete.suggestions[activeIndex]`; Enter calls `selectOption` and
`aria-activedescendant` points to an option ID only when `activeOption` exists. Render the active option
with a visible existing token such as `bg-muted text-foreground`. Add a separate `sr-only`
`aria-live="polite" aria-atomic="true"` status that announces `Searching places`, the exact result
count, `No places found`, or the generic error; do not rely on `aria-selected` alone for change
announcements.

- [ ] **Step 7: Replace StepAmount's inline note row**

Replace the old nearby/search props with:

```ts
places?: PlaceNoteOptions;
```

Use:

```tsx
<TransactionNoteField
  value={note}
  onManualChange={(value) => setManualTransactionNote(form, value)}
  onClear={() => clearTransactionNote(form)}
  onPlaceSelect={(selection) => selectGooglePlace(form, selection)}
  onSubmit={onSubmit}
  canSubmit={Boolean((amount || optionalAmount) && !isSubmitting && !isDeleting)}
  inputRef={noteInputRef}
  places={places}
/>
```

This puts the X in TransactionFlow, QuickNoteFlow, and LandingDemo without adding Places behavior to
the latter two. Keep `formNotice` immediately after the note component.

- [ ] **Step 8: Run focused tests, typecheck, no-shadow scan, and commit**

```bash
npm run test -- src/components/TransactionFlow/TransactionNoteField.test.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.test.tsx \
  src/components/TransactionFlow/StepAmount.test.tsx
npx tsc --noEmit
rg -n "shadow" src/components/TransactionFlow/TransactionNoteField.tsx \
  src/components/TransactionFlow/StepAmount.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.tsx
```

Expected: component tests/typecheck pass and `rg` exits 1 with no matches.

```bash
git add src/components/TransactionFlow/TransactionNoteField.tsx \
  src/components/TransactionFlow/TransactionNoteField.test.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.tsx \
  src/components/TransactionFlow/NearbyPlaceChips.test.tsx \
  src/components/TransactionFlow/StepAmount.tsx \
  src/components/TransactionFlow/StepAmount.test.tsx
git commit -m "feat: add inline note place combobox"
```

## Task 8: Integrate the inline combobox into TransactionFlow

**Files:**
- Modify: `src/components/TransactionFlow/index.tsx`
- Test: `src/components/TransactionFlow/index.places.test.tsx`
- Delete: `src/components/TransactionFlow/PlaceSearchDrawer.tsx`
- Delete: `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`

- [ ] **Step 1: Rewrite flow tests for the inline interaction**

Replace drawer/Search expectations in `index.places.test.tsx` with:

```tsx
it("selects an inline result and submits structured place metadata", async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  mocks.searchSuggestions.mockResolvedValue([coffeeHouse]);
  mocks.resolveSuggestion.mockResolvedValue("Coffee House");
  renderFlow();
  await user.click(screen.getByRole("button", { name: "Start expense" }));

  const note = screen.getByRole("combobox", { name: "Transaction note" });
  await user.type(note, "coffee");
  await act(() => vi.advanceTimersByTimeAsync(250));
  await user.click(await screen.findByRole("option", { name: /Coffee House/ }));
  expect(note).toHaveValue("Coffee House");

  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      note: "Coffee House",
      place: { provider: "google", placeId: "coffee-house" },
    }),
  );
});
```

Add `vi.useRealTimers()` to the suite's existing `afterEach` so a failed assertion cannot leak fake
timers into later tests. Tests that exercise exact debounce time call `vi.useFakeTimers()` themselves;
leave unrelated integration tests on real timers.

Add integration cases for:

- nearby selection sets the same structured pair;
- income, transfer, edit, reimbursement, offline, and missing-key fields are plain note textboxes;
- no Search button, searchbox, or dialog exists;
- provider session starts only after two manual characters;
- a selected display name does not search itself;
- the next manual nonblank edit retains place and starts a new session;
- clear retires results, clears place, restores focus, and shows nearby chips;
- deferred selection after clear, a newer query, type change, back/unmount, or receipt cannot mutate;
- Back then another expense category preserves note/place;
- switching the create type to income/transfer keeps note and clears place;
- selection failure leaves free text and the inline popup usable.
- an ordinary expense fixture with a place hydrates its note/reference; a nonblank edit submits no
  `place` key (authoritative preserve), while Clear submits `{ place: null }`;
- a linked reimbursement fixture with its own place hydrates that child reference (never the source),
  preserves it on a nonblank metadata edit, and emits `{ place: null }` after Clear.

Put both ordinary and linked hydration/clear assertions in this RED step before wiring Step 5; mock
`mocks.updateMutation.mutateAsync` with the current `TransactionUpdateInput` shape and assert its exact
`{ id, input }` calls so an omitted builder patch cannot pass unnoticed.

- [ ] **Step 2: Run the flow test and verify RED**

```bash
npm run test -- src/components/TransactionFlow/index.places.test.tsx
```

Expected: old Search/drawer state is rendered and create/update payloads lack place.

- [ ] **Step 3: Remove drawer-only state and callbacks**

Delete the `PlaceSearchDrawer` import and render, `placeSearchSessionId`, `placeSearchOpen`, Search
button ref, generation/open/eligibility refs, and all open/close/drawer selection callbacks. Remove the
embedded `createPlaceSessionId` helper in favor of the extracted helper, retaining only the nearby
session ID state.

Delete both drawer files after no imports remain.

- [ ] **Step 4: Pass one inline Places options object**

Keep the existing pure eligibility predicate and nearby hook. Pass:

```tsx
places={
  shouldFetchNearbyPlaces
    ? {
        enabled: canSearchPlaces,
        nearbySuggestions: nearbyPlaces.suggestions,
        isNearbyLoading: nearbyPlaces.isLoading,
        locationBias: nearbyPlaces.coordinates,
      }
    : undefined
}
```

Remove `nearbyPlaceSuggestions`, `isNearbyPlacesLoading`, `canSearchPlaces`,
`onNearbyPlaceSelect`, `onSearchPlaces`, and `searchButtonRef` props.

- [ ] **Step 5: Hydrate, reset, and build update patches**

Add `place` to edit hydration:

```ts
form.setFieldValue("place", transaction.place);
```

Thread the field through the current manually assembled reactive values: alias `place: formPlace` in
the ordinary `form.useStore` destructure, add `place: formPlace` to the non-reimbursement
`activeValues`, and include `place` in the `activeValues` destructure. In `handleFormSubmit`, include
`place` in both the linked-edit object passed to `handleSubmit` and the ordinary object passed to
`transactionSchema.safeParse`. Otherwise a hydrated linked child would be rebuilt with
`values.place === undefined` and falsely emit `{ place: null }`.

Use `replaceTransactionNote(form, "")` and `replaceTransactionNote(reimbursementForm, "")` in full
flow resets. When entering reimbursement, use `replaceTransactionNote(reimbursementForm,
defaults.note)` so the source place is not inherited.

Change `buildLinkedEditInput` to return `TransactionUpdateInput` and append:

```ts
...buildPlaceUpdatePatch(original.place, values.place),
```

Append the same patch to the ordinary edit input. Create submission already passes the form's `place`
through `useAddTransactionMutation`. Preserve Back behavior: unmounting the note component retires the
autocomplete session but does not clear the create form's note/place.

- [ ] **Step 6: Run flow and surrounding regressions**

```bash
npm run test -- src/components/TransactionFlow/index.places.test.tsx \
  src/components/TransactionFlow/TransactionFlow.test.tsx \
  src/components/TransactionFlow/StepAmount.test.tsx \
  src/components/TransactionFlow/flowMode.test.ts
npx tsc --noEmit
```

Expected: inline eligibility/payload tests and existing reimbursement/edit flows pass.

- [ ] **Step 7: Commit the flow migration**

```bash
git add src/components/TransactionFlow/index.tsx \
  src/components/TransactionFlow/index.places.test.tsx \
  src/components/TransactionFlow/PlaceSearchDrawer.tsx \
  src/components/TransactionFlow/PlaceSearchDrawer.test.tsx
git commit -m "feat: search places from transaction note"
```

## Task 9: Update disclosure and mobile end-to-end proof

**Files:**
- Modify: `src/routes/PrivacyPolicyPage.tsx`
- Test: `src/routes/LegalPages.test.tsx`
- Modify: `README.md`
- Modify: `e2e/transaction-flow.spec.ts`
- Create: `output/playwright/new-flow/note-place-combobox-results.png`

- [ ] **Step 1: Write failing disclosure tests**

Update `LegalPages.test.tsx` to require rendered copy containing these facts:

```ts
expect(copy).toContain(
  "typing at least two characters in an eligible transaction note",
);
expect(copy).toContain(
  "selected place display name, provider, and Place ID",
);
expect(copy).toContain(
  "does not persist raw coordinates, formatted addresses, search history, or unselected place suggestions",
);
```

Keep the Google Privacy Policy link and existing location/no-separate-consent assertions.

- [ ] **Step 2: Update privacy and README text**

In `PrivacyPolicyPage.tsx`, replace separate-search wording with inline note-query disclosure and state
that a selected display name, provider, and stable Place ID are stored locally for offline sync and in
the Google Sheet. Preserve the no-coordinate/address/history/unselected-result statements.

In README's Places setup/release section, document:

```text
Selected place identity is written as Place Provider and Place ID in transaction
columns M/N. The display name remains the Note in column E; SheetLog does not
persist raw coordinates or formatted addresses.
```

Do not remove or weaken the existing durable Google place-name storage release gate.

- [ ] **Step 3: Replace the drawer E2E with inline mobile flows**

In `e2e/transaction-flow.spec.ts`, add optional place to `StoredTransaction`:

```ts
place?: { provider: "google"; placeId: string };
```

After entering the amount step in each new transaction, set a nonzero amount before measuring or
typing a note:

```ts
await replaceKeypadAmount(page, "25");
```

This makes the visible Submit action genuinely enabled. Make the intercepted autocomplete return at
least six results so the list scrolls over the keypad. Log exact provider inputs. Replace the Places
test with two flows:

1. `renders inline note results over the keypad and preserves selected metadata`.
2. `clear removes note metadata and nearby selection can add it again`.

Use `getByRole("combobox", { name: "Transaction note" })`, `listbox`, and `option`; assert Search
button/dialog/searchbox absence. Pause the clock, enter one character, advance 300 ms and prove no
request; complete the query, advance 300 ms plus one TanStack notification millisecond, and assert one
normalized provider input. Keep exact 249/250 ms timing only in the unit test.

- [ ] **Step 4: Prove overlay geometry and stacking**

Record keypad and Submit bounding boxes before typing. After the listbox renders:

```ts
expect(Math.abs(afterKeypad.x - beforeKeypad.x)).toBeLessThanOrEqual(1);
expect(Math.abs(afterKeypad.y - beforeKeypad.y)).toBeLessThanOrEqual(1);
expect(Math.abs(afterSubmit.y - beforeSubmit.y)).toBeLessThanOrEqual(1);
expect(listboxBox.y + listboxBox.height).toBeGreaterThan(afterKeypad.y);
expect(await listbox.evaluate((element) => getComputedStyle(element).boxShadow))
  .toBe("none");
expect(await listbox.evaluate((element) => element.scrollHeight > element.clientHeight))
  .toBe(true);
```

At a point where listbox/keypad rectangles overlap, call `document.elementFromPoint()` and prove the
returned element is inside the listbox. Assert Submit stays enabled and Clear is at least 44×44 CSS
pixels, clears the list/place, disappears, and restores combobox focus.

- [ ] **Step 5: Prove persistence, clear, and M/N serialization**

After selecting, manually edit the note to `Edited Central Cafe`, submit, resume the page clock so the
mock adapter's 50 ms timer runs, then poll `sheetlog.mock.transactions`:

```ts
expect(row).toMatchObject({
  note: "Edited Central Cafe",
  place: { provider: "google", placeId: "central-cafe" },
});
```

Import `serializeTransactionRowForUserEntered` from `../src/lib/transactionRows` in the Playwright
test module. Pass that actual record through it in Node-side test code and
assert `rowValues.slice(12, 14)` equals `["google", "central-cafe"]`. A second transaction that uses
Clear must persist no note/place and serialize M/N as `["", ""]`. Do not add test-only place IDs to
the production DOM.

- [ ] **Step 6: Capture and inspect the PR screenshot**

At the start of the screenshot scenario, override the Pixel 5 project's normal 393×727 viewport with:

```ts
await page.setViewportSize({ width: 390, height: 844 });
```

With animations disabled and caret hidden, capture the populated listbox before selection using:

```ts
const screenshotPath = testInfo.outputPath("note-place-combobox-results.png");
await page.screenshot({ path: screenshotPath, scale: "css" });
await testInfo.attach("Inline note Places results", {
  path: screenshotPath,
  contentType: "image/png",
});
```

After the retry-free focused Playwright run, promote the exact 390×844 attachment:

```bash
sheetlog_screenshot=$(find test-results -type f \
  -name 'note-place-combobox-results.png' -print -quit)
test -n "$sheetlog_screenshot"
mkdir -p output/playwright/new-flow
cp "$sheetlog_screenshot" \
  output/playwright/new-flow/note-place-combobox-results.png
file output/playwright/new-flow/note-place-combobox-results.png
```

Inspect it with the local image viewer before staging. The destination is:

```text
output/playwright/new-flow/note-place-combobox-results.png
```

The image must show the unchanged underline/input, populated overlay, keypad context, and no
shadow or provider attribution.

- [ ] **Step 7: Expose the visual review build privately over Tailscale**

Start the feature worktree's Vite server on loopback in one terminal:

```bash
SHEETLOG_DEV_PORT=5179 VITE_DEV_MODE=true \
  npm run dev -- --host 127.0.0.1
```

In a second terminal, use a foreground-only private tailnet listener on an otherwise unused port so
the node's existing Serve configuration is not replaced:

```bash
tailscale serve --https=10443 http://127.0.0.1:5179
```

Derive the review URL with:

```bash
sheetlog_tailnet_host=$(tailscale status --json | \
  jq -r '.Self.DNSName | rtrimstr(".")')
printf 'https://%s:10443/app\n' "$sheetlog_tailnet_host"
```

Open that HTTPS URL from a tailnet-connected phone and verify the unchanged note row, 44 px clear
target, focus return, and overlay geometry. Stop the foreground `tailscale serve` process with
Ctrl-C after review, stop Vite, and confirm `tailscale serve status --json` has no new `:10443`
handler. This preview does not alter production DNS. If the separate preview Maps key does not allow
the exact tailnet HTTPS referrer, review the deterministic populated-result screenshot instead of
broadening the production key or bypassing its restrictions.

- [ ] **Step 8: Run disclosure and Mobile Chrome tests**

```bash
npm run test -- src/routes/LegalPages.test.tsx
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key \
  npx playwright test e2e/transaction-flow.spec.ts \
  --project="Mobile Chrome" --retries=0
```

Expected: legal tests and every transaction-flow Mobile Chrome scenario pass with no retries.

- [ ] **Step 9: Commit disclosure, E2E, and reviewed artifact**

```bash
git add README.md src/routes/PrivacyPolicyPage.tsx src/routes/LegalPages.test.tsx \
  e2e/transaction-flow.spec.ts \
  output/playwright/new-flow/note-place-combobox-results.png
git commit -m "test: cover note place metadata flow"
```

## Task 10: Verify, review, publish the PR, and gate deployment

**Files:**
- Inspect: every file changed since `origin/main`
- Inspect: `output/playwright/new-flow/note-place-combobox-results.png`
- Update only if verification finds a defect: the owning implementation/test file from Tasks 1–9

- [ ] **Step 1: Run the complete automated verification gate**

Run from the feature worktree with a fresh CI-owned Vite server:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key \
  npx playwright test --project="Mobile Chrome" --retries=0
git diff --check origin/main...HEAD
```

Expected: all unit/integration tests, typecheck, lint, guarded production build, and every Mobile
Chrome test pass with no retries; the diff check prints nothing. Do not claim that `tsc` checks E2E—the
Playwright run is the executable TypeScript/behavior gate for `e2e/`.

- [ ] **Step 2: Enforce the no-shadow UI rule on changed source**

List changed TSX files, then scan only those paths so design/spec prose does not create false matches:

```bash
mapfile -d '' sheetlog_changed_tsx < <(
  git diff --diff-filter=ACMR --name-only -z origin/main...HEAD -- '*.tsx'
)
if [ "${#sheetlog_changed_tsx[@]}" -gt 0 ]; then
  if rg -n "shadow" -- "${sheetlog_changed_tsx[@]}"; then
    exit 1
  else
    sheetlog_shadow_status=$?
    test "$sheetlog_shadow_status" -eq 1
  fi
fi
```

Expected: `rg` exits 1 with no matches. Also inspect the screenshot and confirm no visual elevation
effect, no provider attribution, no Search chip/drawer, and no note-row layout change.

- [ ] **Step 3: Request independent code review**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Require the reviewer to inspect:

- A:N compatibility, formula literalization, and M/N header ordering;
- three-way update intent, authoritative merge, CAS, retry, rollback, compensation, and legacy rows;
- stale autocomplete/session cleanup, keyboard/ARIA/focus, clear-everywhere behavior, and no layout shift;
- privacy/storage disclosure and the durable Google place-name storage release gate.

Resolve every Critical/Important finding with a focused RED→GREEN regression, rerun the affected
slice, inspect the complete worktree diff, and commit those review fixes before repeating the gates:

```bash
git status --short
git diff --check
git diff --stat
git diff
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git diff --cached --check
  git commit -m "fix: address final place review"
fi
```

Then repeat Steps 1–3 against the new `HEAD` until the review returns Ready. Immediately before push,
require `test -z "$(git status --porcelain)"`; this ensures runtime-verified review fixes are included
in `origin/main...HEAD`, the no-shadow scan, and the published branch rather than left uncommitted.

- [ ] **Step 4: Push and open the screenshot PR**

```bash
test -z "$(git status --porcelain)"
git push -u origin feat/note-place-combobox
sheetlog_pr_body=$'## Summary\n\n- keep the current note visual and add an everywhere Clear control\n- search Places inline for new expenses and store provider/Place ID in M/N\n- preserve place intent across edits, offline retries, CAS, rollback, and reimbursement flows\n\n## Verification\n\n- `npm test`\n- `npx tsc --noEmit`\n- `npm run lint`\n- `npm run build`\n- `CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test --project="Mobile Chrome" --retries=0`\n\n## Screenshot\n\n![Inline note Places results](https://github.com/thasarito/sheetlog/blob/feat/note-place-combobox/output/playwright/new-flow/note-place-combobox-results.png?raw=true)\n\n## Production gates\n\n- durable Google display-name storage remains gated on written rights or an approved permitted-storage design\n- production Maps key/billing/referrer/quota configuration and installed-PWA smoke checks are still required\n'
sheetlog_pr_url=$(gh pr create --draft \
  --base main \
  --head feat/note-place-combobox \
  --title "feat: add inline note place metadata" \
  --body "$sheetlog_pr_body")
gh pr view "$sheetlog_pr_url" --json url,isDraft,baseRefName,headRefName,files
gh pr diff "$sheetlog_pr_url" --name-only
gh pr checks "$sheetlog_pr_url" --watch --fail-fast
gh pr ready "$sheetlog_pr_url"
```

Confirm the PR diff contains only intended commits/files and watch all GitHub/Cloudflare checks to a
terminal successful state. Inspect external Cloudflare logs directly if the GitHub check exposes only
a dashboard link.

- [ ] **Step 5: Merge and deploy only after external production gates**

After code review and PR checks pass, mark the PR ready with `gh pr ready`, even if an external launch
gate is still pending. Do not merge or deploy merely because automated checks pass. First confirm the
existing README gate is satisfied: written Google rights for durable display-name storage, or an
implemented and verified owner-approved design that persists only permitted content. Also confirm the
production Maps browser key is API-restricted,
referrer-restricted to the actual canonical HTTPS host, billing/quota controls are active, and older PWA
clients are reloaded when required by the existing Sheet-lock rollout note.

Only after every external gate and owner merge approval:

```bash
gh pr merge --squash --delete-branch
```

Watch the production Cloudflare Pages deployment to success, then smoke-test the installed PWA on the
canonical HTTPS origin: empty note nearby rail, inline two-character search, keyboard selection,
manual rename retaining the place reference, clear removing both fields, offline edit/reconnect, and
Sheet columns K/L/M/N. If any external gate is not satisfied, leave the PR ready but unmerged and
report the exact blocker instead of weakening it. If the post-merge production deployment or smoke
test fails, report the exact failure immediately and use a focused hotfix/revert workflow; do not claim
that the already-merged PR remained unmerged.
