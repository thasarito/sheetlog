# Places Picker and Linked Reimbursements Design

## Goal

Finish the Google Places transaction-note experience and add linked reimbursements.

- A new expense shows five nearby Google Places as note chips plus a final Search chip.
- Opening an expense exposes a Reimburse action between Delete and Save.
- A reimbursement reuses the normal transaction amount and receipt flow, creates a new linked
  income, and leaves the source expense unchanged.
- Multiple partial reimbursements contribute to a derived reimbursed and remaining balance.

The app remains a fast, native-feel PWA backed by the user's Google Sheet. Optional network work
must not block ordinary transaction entry, and all query or mutation work should use TanStack
Query where practical.

## Existing State

The branch already has a tested Google Maps JavaScript API client, a TanStack nearby-place query,
and nearby name chips beneath the note field. It currently returns unstructured names, performs
only Nearby Search, and has no search sheet.

Transactions use an app-owned `Transactions` tab with columns A through K. Column K is the stable
transaction ID used for append deduplication and row lookup. New and offline transactions first go
to Dexie, then sync to Sheets. Recent remote reads are limited to 50 rows, so reimbursement totals
cannot be derived only from the dashboard query.

## User Experience

### Nearby places and search

When a new expense reaches the amount step:

1. If a Maps API key and browser geolocation are available, request the current location through
   the browser's native permission flow. Do not add a separate in-app consent screen.
2. Query Google Places Nearby Search once for that transaction-entry session.
3. Render up to five nearby place chips beneath the note input.
4. Render a final `Search` chip after the nearby results. The Search chip remains available when
   location is denied, times out, or returns no nearby results, provided the app is online and the
   Maps API key is configured. Tapping it loads the Places library on demand if needed.
5. Tapping a nearby chip replaces the note with that place's display name. The note remains
   editable.
6. Tapping Search opens a bottom sheet dedicated to place search. Focus its search input after the
   sheet opens so the mobile keyboard appears immediately.
7. Search results show the place name and secondary address. Selecting a result replaces the note,
   closes the sheet, and returns focus to the transaction flow.

The picker is available only while creating an expense. It is disabled for income, transfer, edit,
receipt, Quick Note, and reimbursement modes. Nearby and search failures do not toast and never
disable amount entry, note typing, or submit.

Google Maps attribution is displayed in the same visual container as nearby and autocomplete
content. Use the official Google Maps logo where space permits or the exact text `Google Maps` at a
legible size and contrast; do not retain the existing low-contrast `Powered by Google` treatment.
The selected display name is persisted as the transaction note, as explicitly requested.
Under Google's standard Maps terms, owner acceptance alone does not authorize durable business-name
storage. Production release of this behavior is blocked until the product owner obtains a written
license or exemption permitting it. Without that right, the release must store only the place ID or
disable Google-derived note persistence.

### Reimbursement entry

Tapping a dashboard transaction continues to open the transaction editor. For a positive expense,
the footer actions appear in this order:

`Delete` -> `Reimburse` -> `Save`

Rows parsed as income or transfer, plus expenses with a non-positive amount, do not show Reimburse.

Tapping Reimburse enters a dedicated reimbursement mode but reuses the existing amount-step and
receipt components. It does not mutate or submit the source expense form. Back returns to the same
source expense editor without losing its values.

The reimbursement form is initialized as follows:

- Type: locked to `income`.
- Category: locked to the system value `Reimbursement`, independent of the user's Category tab.
- Amount: prefilled with the current remaining amount and editable to any positive value up to that
  amount.
- Currency: copied from and locked to the source expense so totals remain comparable.
- Account: copied from the source expense and editable to the account that received repayment.
- Date and time: initialized to now and editable.
- For: copied from and locked to the source expense.
- Note: copied from the source note; if empty, use the source category.

Changing the reimbursement account must not apply the amount step's normal per-account currency
restoration; the source currency remains unchanged. Submit creates one new linked income through
the normal offline queue. The receipt uses
reimbursement-specific copy, offers exact undo for the created income, and never updates the
source expense. Back before submission restores the expense editor; completing or undoing the
receipt returns to the dashboard. Double submission is disabled while the mutation is pending.
Unlike the normal two-second receipt, a reimbursement receipt remains open until Done or Undo is
pressed so exact undo is practically available.

When an expense is opened, show its confirmed, queued, and remaining reimbursement amounts near
the Reimburse action. Once the known remaining amount is zero, replace the action with a disabled
`Fully reimbursed` state.

## Architecture and Data Flow

### Places modules

Represent both nearby and autocomplete results with a shared structure:

```ts
type PlaceSuggestion = {
  placeId: string;
  name: string;
  secondaryText?: string;
};
```

The browser client remains responsible for loading the Maps JavaScript API and importing the
Places library. Extend it with:

- Nearby Search returning structured suggestions rather than strings.
- Autocomplete Data requests using `AutocompleteSuggestion.fetchAutocompleteSuggestions()`.
- One `AutocompleteSessionToken` per opened search sheet. On selection, convert the prediction
  with `toPlace()` and request only `displayName` with `fetchFields()` so the selection completes
  the session; discard an uncompleted token when the sheet closes.
- `includedPrimaryTypes: ["establishment"]` so the sheet searches places rather than addresses or
  regions.
- A location bias around the last coordinates from the nearby lookup when available; otherwise let
  Google apply its normal bias.
- Reset a failed Maps loader promise and failed script element so an explicit retry can load the
  library again.

Nearby lookup uses a session-scoped TanStack query with no retry, `staleTime: Infinity`, and focus
and reconnect refetching disabled. It must check the API key and online state before requesting
geolocation, so offline or unconfigured sessions do not prompt for location.

Autocomplete uses a separate TanStack query keyed by the search session and normalized input. It
starts after two non-whitespace characters, uses a 250 ms debounce, keeps the previous result list
while a newer request is pending, and ignores out-of-order responses. Closing the sheet clears its
input, predictions, and token. Coordinates and unselected suggestions stay in memory only.

### Reimbursement relationship

Extend transaction input and records with:

```ts
reimbursesTransactionId?: string;
```

Add column L to the `Transactions` tab:

| Column | Header | Value |
| --- | --- | --- |
| L | Reimburses Id | Source expense transaction ID for linked income rows; blank otherwise |

New sheets create A:L headers. Existing sheets remain compatible because old rows parse a blank L
as `undefined`. Before syncing the first pending linked reimbursement, idempotently write the L1
header so restored workspaces receive the schema extension without rerunning onboarding. Column K
remains the row-count and idempotency column.

Append, update, recent-read, and mock serialization expand from A:K to A:L. Older clients that write
A:K do not overwrite L. No Dexie migration is required because the new property is optional and is
not indexed.

### Reimbursement summary

Use a TanStack query keyed by sheet and source expense ID. A focused Sheets batch read retrieves
columns B:C and H:L for all transaction rows, aligns them by row, and returns income rows whose L
value matches the source ID. Combine these with local linked rows and deduplicate by the child
transaction ID in column K. Sum finite signed amounts so compensating delete or undo rows reduce the
linked total rather than leaving the original reimbursement counted.

Opening a positive expense online disables the Reimburse action behind a quiet
`Checking reimbursements...` state until this query succeeds. A failed query shows an inline Retry
action. Offline reimbursement remains available: derive the best-known balance from the source,
local linked rows, and any in-memory cached summary. If there is no cached remote summary, assume no
remote children, prefill from the source amount, and show `Balance will be verified when online`.
Do not persist reimbursement-summary cache solely for this feature. A local-only pending source has
an authoritative remote total of zero.

The summary distinguishes:

- Confirmed: linked rows present in Sheets.
- Queued: linked local rows in `pending` or `error` state that are not present in Sheets.
- Remaining: `max(0, source amount - confirmed - queued)`.
- Over-reimbursed: `max(0, confirmed + queued - source amount)`; surface this warning and disable
  new reimbursement entry instead of hiding the inconsistency behind a zero balance.

All linked rows must use the source currency. A mismatched linked currency is shown as a data error
and disables new reimbursement entry until that row is corrected or deleted.

An errored local reimbursement continues reserving its amount until it is retried or deleted, which
prevents accidentally creating a duplicate while resolving sync failure.

Creating, editing, deleting, undoing, or syncing a reimbursement invalidates both the recent
transaction query and the affected reimbursement-summary query.

### Reimbursement mutation and sync

Use a dedicated TanStack reimbursement mutation that derives the locked fields from the source
expense and calls the existing `TransactionsProvider.addTransaction` path. Update that provider
method to return the created record or ID so receipt undo deletes the exact child.

Before an online append, resolve the current source through column K and verify it is still a
positive expense with the expected currency. Re-read the confirmed total plus other local queued
or errored linked rows, then reject a linked row whose amount exceeds the latest remaining balance.
If the source is local and pending, sync it first; if it is errored, deleted, no longer an expense,
or has changed currency, keep the child unsynced with a specific source-state error.
An offline reimbursement may queue using the last known total; if it is stale when reconnecting,
keep it unsynced with an actionable
`Amount exceeds remaining reimbursement balance` error.

Google Sheets does not provide an atomic compare-and-append transaction. The revalidation prevents
known stale writes, but two devices submitting at the same instant can still race. This limitation
is acceptable for this personal, single-user workflow and must not be represented as a strict
cross-device guarantee.

Editing a linked reimbursement preserves its relationship, type, category, and currency. Its
maximum editable amount is the source expense amount minus all other linked reimbursements.
Deleting a reimbursement reduces the derived total. Deleting the source expense does not cascade;
linked income rows remain as audit entries with a dangling source ID.

When a linked reimbursement is opened but its source is outside the recent dashboard data, resolve
the source row by its ID in column K and fetch that A:L row before enabling amount editing. If the
source no longer exists, show `Original expense unavailable`, keep amount/type/category/currency
read-only, and continue to allow account, date, note, or deletion changes.

### Flow state and component boundaries

Replace edit-mode inference from a nullable transaction with an explicit discriminated flow mode,
for example:

```ts
type TransactionFlowMode =
  | { kind: "create" }
  | { kind: "edit"; transaction: TransactionRecord }
  | { kind: "reimburse"; source: TransactionRecord };
```

This ensures reimbursement submit always adds a child instead of accidentally updating the source.
The transaction flow remains the state owner. Use a separate reimbursement form instance so
prefilling and editing its fields cannot mutate the source edit form. The existing amount and
receipt components accept focused action/copy props, while a small reimbursement-summary/action
component owns only the derived balance display and Reimburse button.

Add explicit locked-field props to the shared amount step. In reimbursement mode the currency
picker and For picker are disabled, and account changes bypass the normal localStorage-based
currency replacement. These props are opt-in and leave create/edit/Quick Note behavior unchanged.

The place search sheet is a separate presentational component driven by an autocomplete hook. It
does not receive or send the free-form note text; only the dedicated search input is sent to Google.

## Error Handling

- Missing API key, offline state, geolocation rejection, nearby timeout, and Nearby Search errors
  hide the nearby chips without a toast. Search remains available when the app is online and
  configured even if geolocation failed.
- Autocomplete loading, empty, and error states stay inside the search sheet and preserve the typed
  query for retry.
- Reimbursement validation errors keep the form open and preserve entered values.
- Offline reimbursement success means queued locally; the receipt must not claim that Sheets sync
  has completed.
- Sync errors remain visible and retryable. Error rows involved in reimbursements must be included
  in the dashboard's local rows and summary handling rather than disappearing from the UI. A linked
  error row reserves its amount and can be opened to edit, retry through save, or delete.
- Drive pending/error dashboard rows from a TanStack local-transactions query over Dexie rather than
  a pending-count-triggered effect. Invalidate that query after every local add, update, status
  transition, sync, undo, or delete so error state is reactive.
- Delete and exact undo resolve the current Sheet row through column K before deletion instead of
  trusting a cached row number. Sheet tab ID `0` is treated as valid.

## Configuration and Documentation

- Keep `VITE_GOOGLE_MAPS_API_KEY` as the browser configuration key and add it to `.env.example`,
  README setup, and Cloudflare deployment documentation.
- Enable Maps JavaScript API and Places API (New), billing, and appropriate quotas/alerts.
- Restrict the browser key to the deployed and local HTTP origins and only the required APIs.
- Update the public privacy and terms pages to disclose browser location and Google Maps content.
  Do not add an app-specific consent screen; the browser permission prompt is the only location
  prompt.
- Do not persist raw coordinates, autocomplete histories, or unselected suggestions.

## Testing and Acceptance Criteria

### Places

- Nearby Search returns at most five structured, deduplicated suggestions.
- New expense amount mode performs one lookup; income, transfer, edit, receipt, Quick Note, and
  reimbursement modes perform none.
- Offline or missing-key sessions do not request geolocation.
- Five nearby chips render before the final Search chip; fewer or zero results still leave Search
  available when configured.
- Tapping a nearby result replaces both empty and non-empty notes.
- Search opens the bottom sheet and focuses the input after opening.
- Autocomplete waits for two characters and the debounce, uses one session token, handles races,
  and shows name plus secondary address.
- Selecting a result replaces the note, closes the sheet, and ends the autocomplete session.
- Nearby and search attribution is visible, legible, and accessible.
- Places failures never disable transaction submit or alter the note.

### Reimbursements

- Reimburse appears only between Delete and Save for parsed positive expenses.
- Entering reimbursement mode does not mutate the source expense form or record; Back restores the
  expense editor.
- Defaults and locked fields match the approved form contract.
- Partial and repeated reimbursements create distinct income rows linked to the same source.
- Blank, zero, negative, non-finite, and over-remaining amounts are rejected.
- Confirmed, queued, and remaining totals combine remote and local rows without duplicates.
- Signed compensating rows reduce the confirmed total; currency mismatches and over-reimbursement
  surface explicit disabled states.
- Full reimbursement disables the action.
- Offline creation queues exactly one child; reconnect syncs it once by child ID.
- Stale offline over-reimbursement remains unsynced with the specified error.
- An errored, deleted, retyped, or currency-changed source prevents its child from syncing and
  surfaces the corresponding source-state error.
- Editing preserves the link and validates against other children.
- Exact undo and delete remove the intended child and refresh the source summary.
- Source deletion does not delete linked income.
- Eleven-column legacy rows parse with no relation; twelve-column rows round-trip the link.
- Header L is installed before the first linked append in an existing restored workspace.
- Tab ID `0` and shifted Sheet rows are handled correctly during delete and undo.

### Verification

Run:

```bash
npm run test
npx tsc --noEmit
npm run lint
CI=1 VITE_DEV_MODE=true npx playwright test --project="Mobile Chrome"
```

Manual HTTPS PWA checks cover mobile browser permission allow/deny, up to five nearby results plus
Search, keyboard opening with the search sheet, restricted production key behavior, Google
attribution, offline reimbursement with and without a cached summary, reconnect sync, and
partial/full balance transitions.

## References

- Google Maps JavaScript Nearby Search:
  <https://developers.google.com/maps/documentation/javascript/nearby-search>
- Google Place Autocomplete Data API:
  <https://developers.google.com/maps/documentation/javascript/place-autocomplete-data>
- Google Maps JavaScript policies and attribution:
  <https://developers.google.com/maps/documentation/javascript/policies>
- Google Maps Platform API-key security:
  <https://developers.google.com/maps/api-security-best-practices>
- Google Maps Platform storage restrictions:
  <https://cloud.google.com/maps-platform/terms>

## Explicit Assumptions

- Google Places remains the provider.
- Five nearby results plus one final Search chip is the fixed layout.
- Places appears only for new expenses.
- The browser's native geolocation permission prompt is sufficient for this personal app.
- Selecting a place replaces rather than appends to the note.
- The implementation stores the selected Google display name in the user's Sheet note as requested,
  but production rollout is blocked until written storage rights are obtained.
- Reimbursement currency always matches the source expense; repayment account and date remain
  editable.
- Multiple partial reimbursements are allowed and tracked through linked income rows.
- Reimbursements do not reduce the dashboard's gross expense total; they remain income entries.
- The app owns the Transactions tab schema, including the new L column.
- No visual shadows are introduced.

## Out of Scope

- Maps, routes, place photos, ratings, reviews, or storing raw coordinates.
- Saved/favorite places or place-history learning.
- Reimbursements across different currencies or automatic exchange-rate conversion.
- Splitting one reimbursement across multiple source expenses.
- Cascading deletion between expenses and reimbursements.
- A strict atomic guarantee across simultaneous submissions from multiple devices.
