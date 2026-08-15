# Google Places Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing Google Places integration so a new expense shows up to five nearby place chips and a final Search chip that opens an autofocus autocomplete sheet.

**Architecture:** Keep all Google Maps browser work in `googlePlaces.ts`, expose nearby and autocomplete through separate TanStack Query hooks, and keep the amount step provider-agnostic through structured suggestion props. `TransactionFlow` owns the place-search session and writes only the selected display name into the note.

**Tech Stack:** React 18, TypeScript, TanStack Query, Google Maps JavaScript Places API (New), Vaul drawer, Vitest, Testing Library.

---

## File structure

- Modify `global.d.ts`: minimal Maps JavaScript declarations for Nearby Search and Autocomplete Data.
- Modify `src/lib/googlePlaces.ts`: script loading, structured nearby results, autocomplete sessions, selection resolution, and loader recovery.
- Modify `src/lib/googlePlaces.test.ts`: browser-client contract tests.
- Modify `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`: one lookup per eligible expense session and retained coordinates.
- Modify `src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`: online/key/refetch behavior.
- Create `src/components/TransactionFlow/usePlaceAutocomplete.ts`: debounce and TanStack autocomplete query lifecycle.
- Create `src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`: threshold, debounce, session, and race tests.
- Create `src/components/TransactionFlow/GoogleMapsAttribution.tsx`: accessible provider attribution.
- Create `src/components/TransactionFlow/PlaceSearchDrawer.tsx`: dedicated autofocus search sheet.
- Create `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`: drawer behavior and selection tests.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.tsx`: structured nearby chips plus final Search chip.
- Modify `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`: layout, empty-state Search, and attribution tests.
- Modify `src/components/TransactionFlow/StepAmount.tsx`: opt-in search props.
- Modify `src/components/TransactionFlow/StepAmount.test.tsx`: note replacement and search action tests.
- Modify `src/components/TransactionFlow/index.tsx`: expense-only gating and drawer state.
- Create `src/components/TransactionFlow/placesEligibility.ts`: pure flow eligibility predicate.
- Create `src/components/TransactionFlow/placesEligibility.test.ts`: create/edit/type/step matrix.
- Modify `.env.example`, `README.md`, `src/routes/PrivacyPolicyPage.tsx`, and `src/routes/TermsPage.tsx`: configuration and disclosure.

### Task 1: Structured Google Places browser client

**Files:**
- Modify: `global.d.ts`
- Modify: `src/lib/googlePlaces.ts`
- Test: `src/lib/googlePlaces.test.ts`

- [ ] **Step 1: Write failing structured-nearby and autocomplete tests**

Add tests that assert the exact public contract:

```ts
expect(await getNearbyPlaces(coords, { apiKey: "test-key" })).toEqual([
  { placeId: "cafe-1", name: "Cafe Amazon", secondaryText: "Sukhumvit Road" },
]);

const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
const suggestions = await searchPlaceSuggestions("cafe", session, coords);
expect(suggestions).toEqual([
  { placeId: "cafe-1", name: "Cafe Amazon", secondaryText: "Sukhumvit Road" },
]);
expect(await resolvePlaceSuggestionName(suggestions[0], session)).toBe("Cafe Amazon");
endPlaceAutocompleteSession(session);
```

Also add a loader-recovery test: dispatch `error` on the first inserted script, call the client again, and assert a new script is inserted and can resolve. After ending the autocomplete session, assert selection resolution for its old suggestion fails without retaining the raw prediction.

- [ ] **Step 2: Run the browser-client tests and verify they fail**

Run: `npm run test -- src/lib/googlePlaces.test.ts`

Expected: FAIL because `getNearbyPlaces`, autocomplete session helpers, place IDs, and loader recovery do not exist.

- [ ] **Step 3: Replace loose string results with the shared contract**

In `src/lib/googlePlaces.ts`, export these exact types and entry points:

```ts
export type PlaceSuggestion = {
  placeId: string;
  name: string;
  secondaryText?: string;
};

export type PlaceAutocompleteSession = {
  token: GoogleAutocompleteSessionToken;
  apiKey?: string;
};

export async function getNearbyPlaces(
  coordinates: Coordinates,
  options: { apiKey?: string; radius?: number; maxResultCount?: number } = {},
): Promise<PlaceSuggestion[]>;

export async function createPlaceAutocompleteSession(
  options: { apiKey?: string } = {},
): Promise<PlaceAutocompleteSession>;

export async function searchPlaceSuggestions(
  input: string,
  session: PlaceAutocompleteSession,
  locationBias?: Coordinates,
): Promise<PlaceSuggestion[]>;

export async function resolvePlaceSuggestionName(
  suggestion: PlaceSuggestion,
  session: PlaceAutocompleteSession,
): Promise<string>;

export function endPlaceAutocompleteSession(session: PlaceAutocompleteSession): void;
```

Use `fields: ["id", "displayName", "formattedAddress"]` for nearby, cap and deduplicate by `placeId`, and use `locationBias: { center: locationBias, radius: 5_000 }` when coordinates exist. Do not send `includedPrimaryTypes: ["establishment"]`: Google applies it to the single primary type and it excludes categorized cafes, restaurants, and stores. Instead, inspect `prediction.types` and retain only predictions tagged `establishment` or `point_of_interest`, which excludes address/region predictions while preserving categorized venues. Read `prediction.mainText` and `prediction.secondaryText` directly, falling back to `prediction.text` only for the primary label. Call `prediction.toPlace().fetchFields({ fields: ["displayName"] })` on selection. Keep raw predictions in a module-scoped `Map<GoogleAutocompleteSessionToken, Map<string, GooglePlacePrediction>>`; this makes the token object plus place ID the in-memory lookup key and allows `endPlaceAutocompleteSession` to delete all entries when the sheet closes or selection completes.

- [ ] **Step 4: Make script failure retryable**

Use one rejection path for existing and newly-created scripts:

```ts
function rejectAndReset(script: HTMLScriptElement, reject: (error: Error) => void) {
  mapsScriptPromise = null;
  script.remove();
  reject(new Error("Failed to load Google Maps"));
}
```

The next explicit client call must create a fresh script. `resetGooglePlacesLoaderForTests()` must clear the promise, prediction map, and script element.

- [ ] **Step 5: Extend only the Maps shapes the client uses**

In `global.d.ts`, place IDs, formatted addresses, autocomplete tokens, suggestions, predictions, `toPlace()`, and `fetchFields()` inside `declare global` so the aliases are visible to `googlePlaces.ts`, without using `any`. Keep `window.google` optional so tests can exercise script loading.

- [ ] **Step 6: Run the browser-client tests**

Run: `npm run test -- src/lib/googlePlaces.test.ts`

Expected: PASS, including at-most-five deduplication, autocomplete request fields, selection completion, and failed-loader retry.

- [ ] **Step 7: Commit the browser client**

```bash
git add global.d.ts src/lib/googlePlaces.ts src/lib/googlePlaces.test.ts
git commit -m "feat: extend google places browser client"
```

### Task 2: Session-scoped nearby query

**Files:**
- Modify: `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`
- Test: `src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`

- [ ] **Step 1: Write failing query-lifecycle tests**

Cover these calls explicitly:

```ts
useNearbyPlaceSuggestions({ enabled: true, isOnline: false, sessionId: "expense-a" });
expect(getCurrentCoordinates).not.toHaveBeenCalled();

useNearbyPlaceSuggestions({ enabled: true, isOnline: true, sessionId: "expense-b" });
window.dispatchEvent(new Event("focus"));
window.dispatchEvent(new Event("online"));
expect(getNearbyPlaces).toHaveBeenCalledTimes(1);
```

Assert that successful data includes both `suggestions` and the coordinates used for location bias. With one shared QueryClient, change to a new UUID session and assert exactly one additional lookup; then remount with another UUID and prove it cannot reuse the first mount's fresh cache entry. Use a deferred geolocation promise to assert `isLoading` transitions from true to false.

- [ ] **Step 2: Run the hook test and verify failure**

Run: `npm run test -- src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`

Expected: FAIL because the hook lacks `isOnline`, returns strings, and can refetch.

- [ ] **Step 3: Implement the exact TanStack query policy**

Use a collision-free UUID string generated for every logical expense-entry session; a component-local numeric counter can collide with the global QueryClient's still-fresh cache after remount. Use this query shape:

```ts
useQuery({
  queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
  enabled: enabled && isOnline && hasGoogleMapsApiKey(),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  queryFn: async () => {
    const coordinates = await getCurrentCoordinates();
    return { coordinates, suggestions: await getNearbyPlaces(coordinates) };
  },
});
```

Catch geolocation failure around the whole lookup and return `{ coordinates: undefined, suggestions: [] }`. Once coordinates resolve, catch only Nearby Search failure and return `{ coordinates, suggestions: [] }` so autocomplete can still use the location bias. Return `canSearch` separately as `enabled && isOnline && hasGoogleMapsApiKey()`.

- [ ] **Step 4: Run the hook tests**

Run: `npm run test -- src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`

Expected: PASS with zero geolocation calls offline or without a key and one nearby call per session.

- [ ] **Step 5: Commit the nearby query**

```bash
git add src/components/TransactionFlow/useNearbyPlaceSuggestions.ts src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx
git commit -m "fix: scope nearby places to expense sessions"
```

### Task 3: Autocomplete query and search sheet

**Files:**
- Create: `src/components/TransactionFlow/usePlaceAutocomplete.ts`
- Create: `src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`
- Create: `src/components/TransactionFlow/GoogleMapsAttribution.tsx`
- Create: `src/components/TransactionFlow/PlaceSearchDrawer.tsx`
- Create: `src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`

- [ ] **Step 1: Write failing autocomplete-hook tests**

Use fake timers and assert this lifecycle:

```ts
result.current.setInput("c");
await vi.advanceTimersByTimeAsync(250);
expect(searchPlaceSuggestions).not.toHaveBeenCalled();

result.current.setInput("ca");
await vi.advanceTimersByTimeAsync(249);
expect(searchPlaceSuggestions).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(1);
expect(searchPlaceSuggestions).toHaveBeenCalledTimes(1);
```

Rerender with a longer query while the first promise is unresolved and verify the older resolution never replaces the current result. Close and reopen the sheet and verify a new session token is created.

Also assert that `open: false`, `enabled: false`, and an input shortened below two characters make no request and expose an empty suggestion list, even when a previous query has cached results. Simulate failure once in session creation and once in suggestions; the exposed Retry must recover the failed layer after the loader resets.

- [ ] **Step 2: Run the hook tests and verify failure**

Run: `npm run test -- src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`

Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement the autocomplete hook**

Export this interface:

```ts
export function usePlaceAutocomplete({
  open,
  enabled,
  sessionId,
  locationBias,
}: {
  open: boolean;
  enabled: boolean;
  sessionId: string;
  locationBias?: Coordinates;
}): {
  input: string;
  setInput: (value: string) => void;
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  isSelecting: boolean;
  isError: boolean;
  error: Error | null;
  retry: () => Promise<void>;
  selectSuggestion: (suggestion: PlaceSuggestion) => Promise<string>;
  reset: () => void;
};
```

Create one session with a TanStack query keyed by `['placeAutocompleteSession', sessionId]`. Both session and suggestion queries require `open && enabled`; use `retry: false`, `refetchOnWindowFocus: false`, and `refetchOnReconnect: false`. Debounce normalized input by 250 ms, enable suggestions only at two characters, use `placeholderData: (previous) => previous` only while the current normalized input still meets the threshold, and key by session ID plus normalized debounced input. Expose `[]` immediately below threshold or while closed.

Implement `selectSuggestion` with TanStack `useMutation`, disable repeat selection while it is pending, and resolve the display name through the same session. `retry()` refetches a failed session query first and otherwise the failed suggestion query. When `open` becomes false, call `endPlaceAutocompleteSession`, clear input, and remove both the session key and every suggestion key for that session so token and unselected prediction state cannot persist.

- [ ] **Step 4: Run the autocomplete-hook tests**

Run: `npm run test -- src/components/TransactionFlow/usePlaceAutocomplete.test.tsx`

Expected: PASS for threshold, debounce, one token, stale-response isolation, selection, and reset.

- [ ] **Step 5: Write failing search-sheet tests**

Assert that opening renders a dialog named `Search places`, focuses the search box, shows name plus secondary address, preserves text on an inline error, calls Retry, and emits the selected `PlaceSuggestion`. While selection is pending, keep the sheet open and disable result buttons; the flow—not this presentational drawer—closes it only after successful `fetchFields()` resolution.

- [ ] **Step 6: Implement attribution and the drawer**

`GoogleMapsAttribution` renders exact, untranslated text:

```tsx
<p translate="no" className="text-xs font-normal text-muted-foreground">
  Google Maps
</p>
```

`PlaceSearchDrawer` uses the shared Vaul primitives, a controlled `open`, and a `requestAnimationFrame` in an effect to call `inputRef.current?.focus()` only after opening. Results are buttons with the primary name and `secondaryText`; loading, empty, error, Retry, and selection errors remain inside the sheet. Accept `isSelecting` and `onSelect: (suggestion: PlaceSuggestion) => void`. Do not initialize its input from the transaction note.

- [ ] **Step 7: Run the search-sheet tests**

Run: `npm run test -- src/components/TransactionFlow/PlaceSearchDrawer.test.tsx`

Expected: PASS with no toast expectations and focused input.

- [ ] **Step 8: Commit autocomplete and drawer**

```bash
git add src/components/TransactionFlow/usePlaceAutocomplete.ts src/components/TransactionFlow/usePlaceAutocomplete.test.tsx src/components/TransactionFlow/GoogleMapsAttribution.tsx src/components/TransactionFlow/PlaceSearchDrawer.tsx src/components/TransactionFlow/PlaceSearchDrawer.test.tsx
git commit -m "feat: add place autocomplete sheet"
```

### Task 4: Nearby/Search chips and amount-step wiring

**Files:**
- Modify: `src/components/TransactionFlow/NearbyPlaceChips.tsx`
- Modify: `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`
- Modify: `src/components/TransactionFlow/StepAmount.tsx`
- Modify: `src/components/TransactionFlow/StepAmount.test.tsx`

- [ ] **Step 1: Replace string fixtures with structured suggestions and add Search tests**

Use fixtures of this shape:

```ts
const suggestions = Array.from({ length: 6 }, (_, index) => ({
  placeId: `place-${index}`,
  name: `Place ${index}`,
}));
```

Assert only five nearby buttons render, Search is the last chip, Search renders with zero results when `canSearch`, and attribution is present whenever nearby or search provider content is visible.

- [ ] **Step 2: Run component tests and verify failure**

Run: `npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/StepAmount.test.tsx`

Expected: FAIL because the components accept strings and have no Search action.

- [ ] **Step 3: Implement structured chip props**

Use these props:

```ts
type NearbyPlaceChipsProps = {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  canSearch: boolean;
  onSelect: (suggestion: PlaceSuggestion) => void;
  onSearch: () => void;
};
```

Render `suggestions.slice(0, 5)` followed by exactly one Search button. Replace `Powered by Google` with `GoogleMapsAttribution`. Preserve the quiet 300 ms nearby loading state, but never hide Search while `canSearch` is true.

- [ ] **Step 4: Add opt-in amount-step search props**

Add these fields without changing Quick Note callers:

```ts
nearbyPlaceSuggestions?: PlaceSuggestion[];
canSearchPlaces?: boolean;
onNearbyPlaceSelect?: (suggestion: PlaceSuggestion) => void;
onSearchPlaces?: () => void;
```

Render `NearbyPlaceChips` when loading, suggestions exist, or `canSearchPlaces` is true. Selecting a nearby suggestion still replaces an existing note.

- [ ] **Step 5: Run amount and chip tests**

Run: `npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/StepAmount.test.tsx`

Expected: PASS, including submit remaining enabled during provider loading or failure.

- [ ] **Step 6: Commit the amount-step UI**

```bash
git add src/components/TransactionFlow/NearbyPlaceChips.tsx src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/StepAmount.tsx src/components/TransactionFlow/StepAmount.test.tsx
git commit -m "feat: add search chip to place suggestions"
```

### Task 5: Expense-only flow integration

**Files:**
- Create: `src/components/TransactionFlow/placesEligibility.ts`
- Create: `src/components/TransactionFlow/placesEligibility.test.ts`
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Write the full eligibility matrix**

Test this pure input:

```ts
type PlacesEligibilityInput = {
  step: number;
  type: TransactionType;
  mode: "create" | "edit" | "reimburse" | "quick-note";
  hasReceipt: boolean;
};
```

Only `{ step: 1, type: 'expense', mode: 'create', hasReceipt: false }` returns true. Income, transfer, edit, reimbursement, Quick Note, category step, and receipt step return false.

- [ ] **Step 2: Run eligibility tests and verify failure**

Run: `npm run test -- src/components/TransactionFlow/placesEligibility.test.ts`

Expected: FAIL because the predicate is absent.

- [ ] **Step 3: Implement and use the predicate**

In the current flow, map state into the predicate as `mode: editingTransaction ? "edit" : "create"` and `hasReceipt: step === 2 || receiptData !== null`. Always call nearby/autocomplete hooks, but pass `enabled: false` outside eligibility; never conditionally call a hook. Search enablement is also gated by `isOnline && hasGoogleMapsApiKey()`, so opening/closed state cannot load Maps while offline or unconfigured.

Keep a separate `placeSearchOpen`, generate a fresh UUID string for the nearby transaction session and each opened place-search session, and retain a ref to the Search chip. Render `PlaceSearchDrawer` at the flow root. A nearby selection writes `suggestion.name`; an autocomplete selection first calls the hook's `selectSuggestion(suggestion)` so `fetchFields()` completes the provider session, then writes the resolved display name and closes:

```ts
const displayName = await placeAutocomplete.selectSuggestion(suggestion);
form.setFieldValue("note", displayName);
setPlaceSearchOpen(false);
```

Pass the nearby coordinates as autocomplete bias. Do not mount or query Places for edit, receipt, or reimbursement mode; the later reimbursement plan must preserve this predicate when it introduces the discriminated flow mode.

After a successful selection/close, restore focus to the Search chip (or the note input if the chip is no longer mounted) and test the focus target. On selection failure, keep the drawer and input open with an inline retryable error.

- [ ] **Step 4: Run focused Places tests**

Run: `npm run test -- src/lib/googlePlaces.test.ts src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx src/components/TransactionFlow/usePlaceAutocomplete.test.tsx src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/PlaceSearchDrawer.test.tsx src/components/TransactionFlow/StepAmount.test.tsx src/components/TransactionFlow/placesEligibility.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit flow integration**

```bash
git add src/components/TransactionFlow/index.tsx src/components/TransactionFlow/placesEligibility.ts src/components/TransactionFlow/placesEligibility.test.ts
git commit -m "feat: wire places search into expense entry"
```

### Task 6: Configuration, legal copy, and Places verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/routes/PrivacyPolicyPage.tsx`
- Modify: `src/routes/TermsPage.tsx`

- [ ] **Step 1: Document browser configuration**

Add `VITE_GOOGLE_MAPS_API_KEY=your-restricted-browser-key` to `.env.example`. In README setup and Cloudflare Pages sections, state that Maps JavaScript API and Places API (New) must be enabled with billing; restrict the key by exact local/deployed HTTP referrers and to those two APIs; configure quota and billing alerts.

- [ ] **Step 2: Add the required disclosures**

Privacy copy must say the browser may send precise location and place-search text directly to Google Maps when the user opens expense entry/search, that raw coordinates and unselected suggestions are not stored by SheetLog, and link to Google Privacy Policy. Terms copy must say Google Maps content is subject to Google Maps/Google Earth Additional Terms. Update both effective dates to `2026-08-15`.

- [ ] **Step 3: Record the release gate prominently**

Add a README subsection named `Google place-name storage release gate` stating that standard Maps terms do not authorize persisting Google business names and production release is blocked until written storage rights are obtained; otherwise disable name persistence or store only place IDs.

- [ ] **Step 4: Run Places verification**

Run:

```bash
npm run test -- src/lib/googlePlaces.test.ts src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx src/components/TransactionFlow/usePlaceAutocomplete.test.tsx src/components/TransactionFlow/NearbyPlaceChips.test.tsx src/components/TransactionFlow/PlaceSearchDrawer.test.tsx src/components/TransactionFlow/StepAmount.test.tsx src/components/TransactionFlow/placesEligibility.test.ts
npm run test
npx tsc --noEmit
npm run lint
CI=1 VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=test-key npx playwright test --project="Mobile Chrome"
```

Expected: all unit and Mobile Chrome tests and typecheck pass; lint exits 0 with no new findings.

Manually verify the HTTPS PWA with permission allow/deny, offline and missing-key no-prompt behavior, five nearby chips plus Search, real mobile keyboard focus, explicit loader Retry, Google Maps attribution, and no Places work in income/transfer/edit/receipt/Quick Note/reimbursement modes.

- [ ] **Step 5: Commit docs and disclosures**

```bash
git add .env.example README.md src/routes/PrivacyPolicyPage.tsx src/routes/TermsPage.tsx
git commit -m "docs: configure and disclose google places"
```
