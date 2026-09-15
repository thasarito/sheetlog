import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlaceAutocompleteSession,
  formatPlaceDistance,
  resetGooglePlacesLoaderForTests,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
} from "./googlePlaces";

const origin = { lat: 13.7563, lng: 100.5018 };

function installPredictions(predictions: GooglePlacePrediction[]) {
  class AutocompleteSessionToken {}
  const fetchAutocompleteSuggestions = vi.fn(async () => ({
    suggestions: predictions.map((placePrediction) => ({ placePrediction })),
  }));
  window.google = {
    maps: {
      importLibrary: vi.fn(async () => ({
        AutocompleteSessionToken,
        AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      })),
    },
  };
  return fetchAutocompleteSuggestions;
}

function prediction(placeId: string, distanceMeters?: number): GooglePlacePrediction {
  return { placeId, mainText: placeId, types: ["establishment"], distanceMeters };
}

afterEach(() => {
  resetGooglePlacesLoaderForTests();
  delete window.google;
  vi.restoreAllMocks();
});

describe("place search distance", () => {
  it("uses the existing coordinates as origin and sorts measured venues nearest first", async () => {
    const fetchAutocompleteSuggestions = installPredictions([
      prediction("far", 1200),
      prediction("unknown"),
      prediction("near", 250),
      prediction("here", 0),
      prediction("also-near", 250),
    ]);
    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const results = await searchPlaceSuggestions("cafe", session, origin);

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: "cafe",
      sessionToken: session.token,
      origin,
      locationBias: { center: origin, radius: 5000 },
    });
    expect(results.map(({ placeId }) => placeId)).toEqual([
      "here", "near", "also-near", "far", "unknown",
    ]);
    expect(results[0].distanceMeters).toBe(0);
    expect(results[1].distanceMeters).toBe(250);
    expect(results[4]).not.toHaveProperty("distanceMeters");
  });

  it("keeps missing and invalid distances last in provider order", async () => {
    installPredictions([
      prediction("missing"),
      prediction("negative", -1),
      prediction("nan", Number.NaN),
      prediction("infinity", Number.POSITIVE_INFINITY),
      prediction("known", 500),
    ]);
    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const results = await searchPlaceSuggestions("cafe", session, origin);

    expect(results.map(({ placeId }) => placeId)).toEqual([
      "known", "missing", "negative", "nan", "infinity",
    ]);
    for (const result of results.slice(1)) {
      expect(result).not.toHaveProperty("distanceMeters");
    }
  });

  it("preserves provider order and omits distances without a location", async () => {
    const fetchAutocompleteSuggestions = installPredictions([
      prediction("far", 1200), prediction("near", 250),
    ]);
    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });

    expect(await searchPlaceSuggestions("cafe", session)).toEqual([
      { placeId: "far", name: "far" }, { placeId: "near", name: "near" },
    ]);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: "cafe", sessionToken: session.token,
    });
  });

  it("preserves venue filtering and resolves the selected place only after sorting", async () => {
    const resolvedPlace: GooglePlace = {
      displayName: "Near Cafe",
      fetchFields: vi.fn(async () => ({ place: resolvedPlace })),
    };
    const toPlace = vi.fn(() => resolvedPlace);
    installPredictions([
      prediction("far", 1200),
      { ...prediction("city", 0), types: ["locality", "political"] },
      { ...prediction("near", 250), toPlace },
      prediction("near", 1),
    ]);
    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const results = await searchPlaceSuggestions("cafe", session, origin);

    expect(results.map(({ placeId }) => placeId)).toEqual(["near", "far"]);
    expect(toPlace).not.toHaveBeenCalled();
    expect(resolvedPlace.fetchFields).not.toHaveBeenCalled();
    expect(await resolvePlaceSuggestionName(results[0], session)).toBe("Near Cafe");
    expect(resolvedPlace.fetchFields).toHaveBeenCalledWith({ fields: ["displayName"] });
  });
});

describe("formatPlaceDistance", () => {
  it.each<[number | undefined, string | null]>([
    [0, "0 m"], [0.4, "0 m"], [250, "250 m"], [999.4, "999 m"],
    [999.6, "1.0 km"], [1000, "1.0 km"], [1234, "1.2 km"], [10000, "10.0 km"],
    [undefined, null], [-1, null], [Number.NaN, null], [Number.POSITIVE_INFINITY, null],
  ])("formats %s as %s", (distance, expected) => {
    expect(formatPlaceDistance(distance)).toBe(expected);
  });
});
