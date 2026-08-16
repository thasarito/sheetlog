# Location-Based Note Suggestions Design

## Goal

Add nearby place-name suggestions to the transaction note input in the Money transaction flow. When the amount step opens, the app requests the user's current location, queries Google Places from the browser, and shows nearby venue names as chips. Tapping a chip fills the note with that place name.

This is an enhancement to fast transaction logging. It must never block amount entry, note typing, submit, edit, delete, receipt display, sync, or undo.

## Decisions

- Suggestions are nearby place names, such as `Starbucks`, `7-Eleven`, or `Terminal 21`.
- Use client-side Google Maps JavaScript API Places, not a backend proxy.
- Request location automatically when the normal transaction amount step opens.
- Render suggestion chips directly under the note input.
- Tapping a chip replaces the current note value, even if the user already typed a note.
- Suggestions never auto-fill or modify the form unless the user taps a chip.
- Quick Note creation/editing does not request location and does not show nearby suggestions.

## Architecture

`TransactionFlow` remains the owner of transaction flow state. It enables nearby place suggestions only while rendering the normal transaction `StepAmount` view. It passes suggestion state and a chip-select handler into `StepAmount`.

`StepAmount` remains mostly presentational. It continues to own the amount screen layout, account/currency handling, note input, keypad, and submit/delete controls. It renders an optional nearby suggestion chip row when props are provided. This protects the existing Quick Note reuse path, where `StepAmount` is used with `customHeader` and `optionalAmount`.

Add these focused nearby places modules:

- `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`
- `src/lib/googlePlaces.ts`

The hook uses TanStack Query, matching the project rule to use `tanstack/query` for async query work. The query function performs browser geolocation, loads Google Maps Places, and returns a small list of display names.

## Google Places Integration

Use the current Maps JavaScript API Places Nearby Search path:

1. Load the Maps JavaScript API with the Places library through an isolated loader helper.
2. Import the Places library.
3. Call `Place.searchNearby()`.

The request should be minimal:

```ts
{
  fields: ["displayName"],
  locationRestriction: {
    center: { lat, lng },
    radius: 100
  },
  maxResultCount: 5,
  rankPreference: SearchNearbyRankPreference.POPULARITY
}
```

Use a 100 meter radius for the first implementation because the UI is trying to suggest the current venue, not browse the neighborhood.

Configuration:

- Add `VITE_GOOGLE_MAPS_API_KEY`.
- The browser key must be restricted by HTTP referrer for the deployed PWA origins.
- The key should be API-restricted to the Google Maps and Places APIs used by this app.
- Google Cloud billing must be enabled.
- Maps JavaScript API and Places API/Places API (New) must be enabled.

Because Google Places data is shown without a map, the chip area must include compact Google attribution, such as `Powered by Google`, near the suggestions.

## Location And Privacy

Use `navigator.geolocation.getCurrentPosition()` with:

- `enableHighAccuracy: false`
- `timeout: 2000`
- `maximumAge: 60000`, so the browser may return a location from the last minute

Do not persist raw latitude/longitude. Do not write Google Places results to IndexedDB or localStorage. TanStack Query may hold ephemeral in-memory state only for the current interaction, with short garbage collection.

Permission and API failures are normal states. The feature should fail closed and leave the regular note input unchanged.

## UI Behavior

The note input remains the source of truth:

- The user can type freely.
- Pressing Enter in the note input keeps the existing submit behavior.
- Suggestion loading never disables submit.
- Tapping a suggestion calls `form.setFieldValue("note", placeName)`.
- If the note is empty, the chip fills it.
- If the note has text, the chip replaces it.

Render suggestions in a single horizontal row below the note input and above the keypad. Show up to 5 chips. Chips should be real `<button>` elements with accessible labels such as `Use Starbucks as note`.

Recommended states:

- Loading: keep the form usable. If loading lasts longer than 300 ms, show a quiet `Nearby` loading indicator.
- Available: show chips plus Google attribution.
- Empty, denied, unavailable, offline, missing API key, timeout, or Places error: hide or collapse the chip row.

The row should avoid layout jumps that move the keypad during common cases. A small reserved area is acceptable while loading or showing results.

## Data Flow

1. User selects a transaction category and confirms date/time.
2. `TransactionFlow` enters amount step.
3. `useNearbyPlaceSuggestions` is enabled for this amount-step session.
4. The hook asks for geolocation and then queries nearby places.
5. `TransactionFlow` passes suggestions and status into `StepAmount`.
6. `StepAmount` renders chips under the note input.
7. User taps a chip.
8. `StepAmount` updates the existing form note field.
9. Submit continues through the existing validation, mutation, receipt, sync, and undo path.

## Error Handling

All location and Places errors are non-fatal:

- Permission denied: hide suggestions.
- Permission prompt dismissed: hide suggestions.
- Geolocation unsupported or insecure context: hide suggestions.
- Timeout: hide suggestions.
- Offline: hide suggestions.
- Missing API key: hide suggestions and log a development-only warning.
- Places API error, quota issue, or empty result: hide suggestions.

Do not toast these failures in the normal transaction flow. Toasts would slow down logging for an optional convenience feature.

## Testing

Add focused tests around the hook and `StepAmount` behavior where practical:

- Suggestions are not active in Quick Note usage.
- Amount step can render with loading, available, and hidden suggestion states.
- Tapping a chip fills an empty note.
- Tapping a chip replaces a non-empty note.
- Suggestion loading does not disable submit.
- Note Enter-to-submit behavior still works.
- Geolocation denied, timeout, and Places errors return hidden/empty suggestions.
- Missing API key degrades without breaking the amount step.
- Chips are keyboard reachable and use clear accessible labels.

Manual verification should cover first-run browser permission prompts on mobile Safari/Chrome and the deployed HTTPS PWA.

## Sources

- Google Maps JavaScript Nearby Search: https://developers.google.com/maps/documentation/javascript/nearby-search
- Google Maps JavaScript loading/import libraries: https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- Google API key security best practices: https://developers.google.com/maps/api-security-best-practices
- Google Places policies and attribution: https://developers.google.com/maps/documentation/places/web-service/policies
- MDN Geolocation `getCurrentPosition`: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
