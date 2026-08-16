# Note Place Combobox and Metadata Design

**Date:** 2026-08-16

## Context

SheetLog currently offers up to five nearby-place chips beneath the transaction note and a final
Search chip that opens a separate Places drawer. Selecting either path replaces the note with the
place display name, but the submitted transaction stores only that name. The resulting Sheet row
cannot distinguish a place-backed note from ordinary free text or reconnect it to the provider's
stable identifier.

The note input also has no one-tap clear action. Clearing it manually is slow on mobile, especially
when the field contains a selected place name.

This design turns the existing note field into a visually unchanged, expense-only Places combobox,
adds an inline clear control everywhere the note field is reused, and stores a minimal structured
place reference with the transaction.

## Goals

- Preserve the current flat, underlined note-field appearance.
- Add a trailing clear control inside that field everywhere `StepAmount` is used.
- Let a new-expense user type directly into the note field to search Places.
- Show results in a bounded overlay that may cover the app keypad without moving the layout.
- Keep the five nearby-place chips as a zero-typing shortcut.
- Store the selected provider and stable Place ID alongside the normal transaction data.
- Preserve legacy Sheet rows and all existing offline, edit, reimbursement, delete, undo, and sync
  behavior.

## Non-goals

- Places search for income, transfer, edit, reimbursement, receipt, or Quick Note modes.
- Changing the note field into a boxed, filled, or otherwise restyled input.
- Storing coordinates, formatted addresses, suggestion payloads, autocomplete history, or a second
  copy of the place display name.
- Making the note text immutable after a place is selected.
- Changing the existing provider attribution, legal, or release-policy posture.
- Adding a general-purpose combobox dependency or adopting the default visual treatment from the
  shadcn/Base UI example.

## Interaction design

### Note field and clear control

The note row retains its current `FileText` icon, transparent input, typography, spacing, underline,
and focus treatment. A trailing `X` icon button appears whenever the active form's note is nonempty.
It uses the same row rather than adding height or a new surface, has the accessible name
`Clear note`, and does not use a shadow.

The button is absolutely positioned at the right edge of the note row. Its centered hit area may
extend beyond the icon to meet the mobile touch-target requirement, while the input receives matching
right padding. This preserves the current row height and prevents text from running beneath the
control.

Activating the control:

1. clears the note;
2. clears the form's structured place reference, if any;
3. closes and retires any autocomplete session and cached result list; and
4. returns focus to the note input.

The same clear control is present in create expense, create income, create transfer, edit,
reimbursement, and any Quick Note path that renders `StepAmount`. Manually editing the note down to
an empty string has the same metadata-clearing behavior. Editing it to any other value whose trimmed
form is nonblank retains the selected place reference, as explicitly chosen for this workflow.

### Inline Places combobox

Places behavior remains eligible only when all of these are true:

- the flow is creating a transaction;
- the transaction type is `expense`;
- the amount step is active;
- there is no receipt; and
- the app is online and has a configured Maps key.

The input itself becomes the combobox trigger in that state. Focusing and typing a normalized query
of at least two characters starts the existing 250 ms debounced Places autocomplete request. This
means the typed note query is transmitted to Google once it reaches the threshold. Missing-key and
offline states do not start a session, request geolocation, or send a query.

The result list is an anchored layer immediately below the underline. It has a bounded height,
scrolls internally, remains within the transaction card width, and uses a sufficiently high stacking
layer to cover the keypad when necessary. It must not resize or push the keypad, footer, or amount
controls. Its styling uses the existing surface, border, radius, typography, and focus tokens without
a shadow. A compact row may communicate loading, no results, or an autocomplete error; these states
never disable free-text note entry or the visible Submit button. Keyboard Enter remains suppressed
while any autocomplete popup is open, as defined below.

The interaction follows the shadcn/Base UI combobox behavior while retaining SheetLog's custom
visuals:

- `ArrowDown` and `ArrowUp` move the active result;
- `Enter` selects the active result while the list is open;
- `Escape` closes the list without changing the note;
- pointer selection works without a blur race;
- the input exposes combobox, expanded, controls, and active-descendant semantics; and
- any open autocomplete popup suppresses transaction submission. Enter selects an active option or
  does nothing when the open popup has no active option; it submits only after the popup is closed.

The current separate Search chip and `PlaceSearchDrawer` are removed because typing in the note is
now the search entry point. Nearby chips remain beneath the note only while the note is empty. They
continue to show at most five nearby places. As soon as the user types, that idle chip rail is hidden
and the autocomplete layer owns the suggestion presentation.

Selecting either a nearby chip or an autocomplete result atomically:

1. writes the resolved place display name into the note;
2. records `{ provider: "google", placeId }` in the active form;
3. closes the list and ends the autocomplete session; and
4. keeps focus associated with the note field.

The completed selection does not immediately reopen a list for its own display name. A subsequent
user edit starts a new autocomplete session. Selecting another result replaces both the note and the
structured reference. A nonempty manual edit retains the existing reference until the note is
cleared or another place is selected.

### Session and stale-result safety

The inline combobox reuses TanStack Query for autocomplete queries and mutations. The note value is
the single controlled query input; it is not mirrored into a second drawer-only input state. Each
focus/edit search lifecycle receives a distinct Places session identifier. Selecting, clearing,
escaping, blurring outside the combobox, changing flow eligibility, navigating away, or unmounting
retires that session and removes its unselected query data.

Generation checks remain around async place-name resolution. A late result or selection cannot
change the note, place reference, focus, or open state after a newer query, clear, mode change, flow
reset, or remount.

Note changes use explicit paths rather than treating every `setFieldValue("note", ...)` alike:

- manual nonempty typing retains the current place reference;
- selecting a place replaces both values atomically;
- clear removes both values atomically; and
- a programmatic create-flow replacement, including Quick Note application, clears any previous
  reference before writing its new free-text note.

Going back to change the category while remaining in the same create-expense flow retires the active
autocomplete session but preserves both the nonempty note and its place reference. Changing the
create type to income or transfer clears the reference while retaining the note. A programmatic note
replacement or full flow reset also clears it. Submission first captures the reference into the
transaction; the later receipt/reset lifecycle may then clear the ephemeral form. These rules do not
remove an existing transaction's hydrated reference merely because that transaction is being edited
in a search-ineligible mode.

## Form and domain model

### Atomic form state

The form and transaction domain share one optional nested value:

```ts
type TransactionPlace = {
  provider: "google";
  placeId: string;
};

interface TransactionInput {
  // existing fields
  place?: TransactionPlace;
}

type TransactionFormValues = {
  // existing fields
  place?: TransactionPlace;
};
```

Keeping the provider and ID in one optional object prevents transient half-populated form, queue, or
sync state. `useTransactionForm` defaults it to `undefined`. Create/reset and reimbursement defaults
also reset it to `undefined`; edit hydration reconstructs it from a valid stored pair. Create/update
input builders copy the object, and the Sheet serializer flattens it into M/N. The app creates only
the provider value `google`, trims the Place ID, and treats an empty or incomplete Sheet pair as no
structured place.

Updates need a three-way patch contract that is separate from the stored record type:

```ts
type TransactionUpdateInput = Partial<Omit<TransactionInput, "place">> & {
  place?: TransactionPlace | null;
};
```

- an absent own `place` property preserves the authoritative value;
- a valid `TransactionPlace` replaces it; and
- `place: null` explicitly clears it.

Update code checks own-property presence rather than truthiness. A malformed runtime object is
rejected before local or remote mutation; it is never interpreted as an implicit preserve or clear.
Edit input builders compare the active form with the original record and include the patch only when
the reference changed. During edit, clearing a nonblank note always emits the explicit tombstone.

### Preservation rules

- A newly selected expense carries the selected pair.
- Opening an existing transaction hydrates its valid pair into the form.
- A nonempty note edit preserves the hydrated pair.
- Clearing the note, or reducing it to whitespace after trimming, removes the pair.
- Changing the transaction type during an edit does not silently remove a valid pair; the explicit
  clear action remains the removal mechanism.
- New income, transfer, reimbursement, and Quick Note transactions start without a pair because
  Places is not offered in those flows.
- A reimbursement never inherits the source expense's place.
- A linked reimbursement edit preserves only metadata already belonging to that child; it does not
  copy metadata from the source.
- A compensating reversal preserves the original transaction's place pair because it represents the
  same purchase being reversed.
- Exact delete and undo continue operating by stable transaction ID and require no special place
  handling.

## Google Sheet schema

The transaction row expands from A:L to A:N:

| Column | Header | Value |
| --- | --- | --- |
| M | `Place Provider` | `google` for a linked place, otherwise blank |
| N | `Place ID` | Stable Google Place ID, otherwise blank |

The display name remains solely in column E (`Note`). No raw coordinates, address, nearby-query
location, search text, or unselected provider content is added to the Sheet.

`TRANSACTION_HEADERS`, append ranges, update ranges, recent reads, focused reads, serializers,
parsers, tests, and mock adapters move from A:L to A:N. Column K remains the stable transaction ID,
and column L remains `Reimburses Id`; reimbursement ID-map and ledger behavior therefore retain
their existing positions.

Header management has two explicit paths. New Sheet creation and the existing full Sheet setup keep
using `ensureHeaders`, expanded from A:L to A:N. Write paths that can run without that setup use the
existing narrow L1 reimbursement upgrader plus a new narrow M1:N1 place-header upgrader. M1:N1 is
assured before every place-bearing append, compensation, or retry and before every existing-row
update carrying either `set` or `clear` place intent. Header assurance runs under the existing
mutation guard/lock, is idempotent, and must succeed before the transaction row is written.

Rows with the pre-reimbursement A:K shape and the current A:L shape both parse exactly as before,
with `place` undefined. A row is place-linked only when the trimmed note is nonblank, M is the
recognized provider, and N is nonempty. A manually malformed or incomplete M/N pair is treated as
unlinked and is normalized to two blank cells on the next write of that row.

M and N are user-entered text columns. The existing formula-literalization boundary extends to both
columns so a manually supplied or future provider identifier cannot be interpreted as a Sheet
formula. Dates retain `USER_ENTERED` behavior and amount remains numeric.

## Offline and sync behavior

The optional fields are stored naturally on the existing Dexie transaction object, so no database
version or data migration is required. New pending records capture the pair at enqueue time alongside
their existing immutable target Sheet and user scope.

Existing-row updates also carry one optional local-only `placeUpdateIntent` value: `preserve`, `set`,
or `clear`. The provider derives and composes it for every path that queues an existing-row update,
including an update begun while already offline and a fallback after a failed direct update. It is
never serialized to Sheets and is removed after successful reconciliation. On sync, `preserve`
adopts the freshly read authoritative pair, `set` applies the queued valid pair, and `clear` removes
it. New-row appends already own their entire final record and do not need the intent. Legacy pending
records without an intent retain the existing full-record, last-write-wins behavior.

Intent composition follows revision order. A newer explicit `set` or `clear` replaces any older
intent. A newer unrelated patch that omits `place` preserves an already queued `set` or `clear`
instead of downgrading it to `preserve`; if no place intent is queued, it records `preserve`. This
ensures an offline place selection or clear survives a later account, date, category, or note-only
edit before reconnect.

Append, existing-ID update, direct synced update, rollback, retry, duplicate-ID protection, and
cross-tab lock paths all serialize A:N. Any authoritative remote record used to sanitize or roll back
an update includes its place fields. The intent is merged only after that authoritative read and
before the guarded write. Existing revision/CAS rules decide concurrent local updates; the newest
surviving revision carries its corresponding intent. This prevents an unrelated metadata edit,
failed direct write, or cross-tab reconciliation from dropping or inventing the pair.

The local form invariant is revalidated at the provider/sync boundary rather than trusted solely to
the UI. A stored place requires a nonblank trimmed note, the recognized provider, and a nonblank ID.
A malformed create or update object is rejected before mutation. A malformed pair read from a Sheet
is treated as absent and normalized on its next write. Place metadata never changes reimbursement
totals, source validation, queue scoping, transaction identity, or delete intent.

## Error handling and accessibility

- Places script, geolocation, autocomplete, and selection failures do not disable the note or submit
  action.
- A failed autocomplete may show a compact non-sensitive status in the overlay; the next changed
  query naturally retries with a new query key, and an explicit retry is not required.
- Clearing or leaving the eligible flow immediately hides cached results, even if cancellation of
  provider work completes later.
- The clear control is a real button with a minimum mobile touch target, `Clear note` accessible
  name, decorative icon, visible keyboard focus, and no shadow.
- The note input has an explicit accessible name, `aria-autocomplete="list"`, and the appropriate
  combobox expanded/controls/active-descendant state. The result layer uses listbox/option semantics,
  announces loading and result changes politely, and retains visible active-option focus.
- Pointer, keyboard, and touch selection must not trigger transaction submission accidentally.

## Testing

Implementation follows test-driven development with these focused contracts:

### Note and combobox components

- The clear button is absent for an empty note and present for nonempty notes in every `StepAmount`
  mode.
- Clicking it clears the note and place reference and restores focus.
- Manually reaching an empty note clears the pair; nonempty manual edits retain it.
- Nearby chips appear only for an empty eligible note and remain capped at five.
- The Search chip and drawer are absent.
- The list overlays rather than resizing the keypad area and uses no shadow utility.
- Two-character threshold, 250 ms debounce, loading/empty/error rows, pointer selection, keyboard
  navigation, Escape, Enter arbitration, blur handling, and ARIA relationships are covered.
- Stale query and selection completions cannot mutate a cleared, replaced, ineligible, or remounted
  flow.

### Form, row, and sync contracts

- Create and edit builders preserve the nested place reference, and row serialization maps it to the
  flat M/N pair.
- Reimbursement creation omits source place metadata.
- Linked edits, ordinary edits, reversals, offline retries, rollback, and exact undo preserve or clear
  the pair according to this design.
- A:N headers and request ranges are exact; K and L retain their existing meaning.
- A:K and A:L legacy rows parse unchanged.
- Valid M/N pairs round-trip; incomplete and unknown pairs normalize blank.
- Update tests distinguish absent/preserve, valid/set, explicit-null/clear, and malformed patch
  behavior through direct, queued, retry, and cross-tab paths.
- Multiple offline edits prove that an unrelated newer patch retains an older queued `set`/`clear`,
  while a newer explicit place change replaces it.
- Programmatic Quick Note replacement and create-type changes clear the pair; same-expense back
  navigation preserves it; whitespace-only notes clear it.
- Header assurance is ordered before `set` and `clear` writes, and an assurance failure prevents the
  row mutation while retaining the queued operation for retry.
- Formula-like M/N values remain literal text.
- Mock Google and real Google adapters expose the same behavior.

### Mobile end-to-end coverage

In deterministic Mobile Chrome:

1. create a new expense and confirm the unchanged note visual plus trailing clear control;
2. type a query and observe one debounced provider request and a rendered result; exact 249/250 ms
   timing remains a deterministic fake-timer unit-test contract;
3. confirm results are displayed above the app keypad without shifting it;
4. select a result and verify the resolved display name fills the note;
5. edit the note to another nonempty value and confirm the stored Place ID remains;
6. clear it and confirm both note and place metadata disappear; and
7. select again, submit, and assert the mock Sheet row contains the expected M/N values.

Capture an updated mobile screenshot of the populated inline result layer for the pull-request
artifact so the unchanged note visual and keypad overlay can be reviewed directly.

The final gate includes the full unit suite, `npx tsc --noEmit`, `npm run lint`, production build,
Mobile Chrome Playwright coverage, diff checks, and a changed-UI scan proving no shadow utility was
introduced.

## Acceptance criteria

- The note field looks the same except for a trailing clear control when populated.
- The clear control works everywhere the note field is reused.
- New-expense autocomplete operates directly from the note field and the separate Search drawer is
  gone.
- Results can cover the keypad without moving the transaction layout.
- Nearby chips remain available before typing and are capped at five.
- Selecting a place stores `google` and its stable Place ID in M/N while the display name remains the
  note.
- Nonempty manual note edits retain the structured link; an empty note removes it.
- Legacy Sheets, offline transactions, edits, reimbursements, reversals, retries, deletes, and undo
  retain their established behavior.
- No coordinates, addresses, unselected results, or duplicate display-name metadata are persisted.
