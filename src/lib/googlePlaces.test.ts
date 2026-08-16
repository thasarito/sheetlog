import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEOLOCATION_OPTIONS,
  MissingGoogleMapsApiKeyError,
  createPlaceAutocompleteSession,
  getCurrentCoordinates,
  getNearbyPlaces,
  resetGooglePlacesLoaderForTests,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
  endPlaceAutocompleteSession,
} from "./googlePlaces";

function installGeolocationMock(
  implementation: PositionCallback | PositionErrorCallback
) {
  const getCurrentPosition = vi.fn(
    (
      success: PositionCallback,
      error?: PositionErrorCallback,
      _options?: PositionOptions
    ) => {
      if (implementation.length === 1) {
        success({
          coords: { latitude: 13.7563, longitude: 100.5018 },
        } as GeolocationPosition);
        return;
      }
      (implementation as PositionErrorCallback)({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      error?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  return getCurrentPosition;
}

describe("getCurrentCoordinates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fast cached geolocation options", async () => {
    const getCurrentPosition = installGeolocationMock(
      (position: GeolocationPosition) => position
    );

    const result = await getCurrentCoordinates();

    expect(result).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      GEOLOCATION_OPTIONS
    );
  });

  it("rejects when geolocation is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });

    await expect(getCurrentCoordinates()).rejects.toThrow(
      "Geolocation is not available"
    );
  });
});

describe("Google Places browser client", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetGooglePlacesLoaderForTests();
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    delete window.google;
  });

  it("throws a typed error when the API key is missing", async () => {
    await expect(
      getNearbyPlaces({ lat: 13.7563, lng: 100.5018 }, { apiKey: "" })
    ).rejects.toBeInstanceOf(MissingGoogleMapsApiKeyError);
  });

  it("returns up to five unique, well-formed nearby suggestions", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [
        { id: "starbucks", displayName: "Starbucks", formattedAddress: "Bangkok" },
        { id: "seven-eleven", displayName: { text: "7-Eleven" } },
        { id: "starbucks", displayName: "Duplicate", formattedAddress: "Other" },
        { id: "missing-name", formattedAddress: "Bangkok" },
        { displayName: "Missing id" },
        { id: "cafe-amazon", displayName: "Cafe Amazon" },
        { id: "dunkin", displayName: "Dunkin" },
        { id: "kfc", displayName: "KFC" },
        { id: "pizza", displayName: "Pizza" },
      ],
    }));

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const suggestions = await getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "test-key" }
    );

    expect(suggestions).toEqual([
      { placeId: "starbucks", name: "Starbucks", secondaryText: "Bangkok" },
      { placeId: "seven-eleven", name: "7-Eleven" },
      { placeId: "cafe-amazon", name: "Cafe Amazon" },
      { placeId: "dunkin", name: "Dunkin" },
      { placeId: "kfc", name: "KFC" },
    ]);
    expect(searchNearby).toHaveBeenCalledWith({
      fields: ["id", "displayName", "formattedAddress"],
      locationRestriction: {
        center: { lat: 13.7563, lng: 100.5018 },
        radius: 100,
      },
      maxResultCount: 5,
      rankPreference: "POPULARITY",
    });
  });

  it("returns an empty nearby result before loading Maps when the normalized limit is zero", async () => {
    const searchNearby = vi.fn();
    const importLibrary = vi.fn(async () => ({
      Place: { searchNearby },
      SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
    }));
    window.google = { maps: { importLibrary } };

    await expect(
      getNearbyPlaces(
        { lat: 13.7563, lng: 100.5018 },
        { apiKey: "", maxResultCount: 0 }
      )
    ).resolves.toEqual([]);
    expect(importLibrary).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();
    expect(document.getElementById("google-maps-js-api")).toBeNull();
  });

  it("normalizes nearby result counts to integers through five", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [
        { id: "one", displayName: "One" },
        { id: "two", displayName: "Two" },
        { id: "three", displayName: "Three" },
        { id: "four", displayName: "Four" },
        { id: "five", displayName: "Five" },
        { id: "six", displayName: "Six" },
      ],
    }));

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const coordinates = { lat: 13.7563, lng: 100.5018 };
    const fractionalResults = await getNearbyPlaces(coordinates, {
      apiKey: "test-key",
      maxResultCount: 2.8,
    });
    const oversizedResults = await getNearbyPlaces(coordinates, {
      apiKey: "test-key",
      maxResultCount: 99,
    });

    expect(fractionalResults).toHaveLength(2);
    expect(oversizedResults).toHaveLength(5);
    expect(searchNearby).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxResultCount: 2 })
    );
    expect(searchNearby).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxResultCount: 5 })
    );
  });

  it("loads the Maps JavaScript API when the importer is missing", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [{ id: "cafe-amazon", displayName: "Cafe Amazon" }],
    }));

    const promise = getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );

    const script = document.getElementById(
      "google-maps-js-api"
    ) as HTMLScriptElement;
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect(script.src).toContain("https://maps.googleapis.com/maps/api/js");
    expect(script.src).toContain("key=browser-key");
    expect(script.src).toContain("loading=async");
    expect(script.src).toContain("v=weekly");
    const removeEventListener = vi.spyOn(script, "removeEventListener");

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };
    script.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toEqual([
      { placeId: "cafe-amazon", name: "Cafe Amazon" },
    ]);
    expect(removeEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function)
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );
  });

  it("waits for the Maps importer after the script load event", async () => {
    vi.useFakeTimers();
    const searchNearby = vi.fn(async () => ({
      places: [{ id: "ready-cafe", displayName: "Ready Cafe" }],
    }));
    window.google = { maps: {} };
    const maps = window.google.maps;
    if (!maps) {
      throw new Error("Maps test fixture is unavailable");
    }

    const request = getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );
    const script = document.getElementById(
      "google-maps-js-api"
    ) as HTMLScriptElement;

    script.dispatchEvent(new Event("load"));
    await Promise.resolve();
    maps.importLibrary = vi.fn(async () => ({
      Place: { searchNearby },
      SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
    }));
    await vi.advanceTimersByTimeAsync(10);

    await expect(request).resolves.toEqual([
      { placeId: "ready-cafe", name: "Ready Cafe" },
    ]);
  });

  it("uses one autocomplete session and maps prediction names with address text", async () => {
    class AutocompleteSessionToken {}
    const fetchAutocompleteSuggestions = vi.fn(async () => ({
      suggestions: [
        {
          placePrediction: {
            placeId: "cafe-amazon",
            mainText: { text: "Cafe Amazon" },
            secondaryText: { text: "Sukhumvit, Bangkok" },
            types: ["cafe", "point_of_interest"],
            toPlace: vi.fn(),
          },
        },
        {
          placePrediction: {
            placeId: "fallback-cafe",
            text: { text: "Fallback Cafe" },
            types: ["cafe", "establishment"],
          },
        },
        {
          placePrediction: {
            placeId: "bangkok-region",
            mainText: { text: "Bangkok" },
            types: ["locality", "political"],
          },
        },
      ],
    }));

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          AutocompleteSessionToken,
          AutocompleteSuggestion: { fetchAutocompleteSuggestions },
          Place: { searchNearby: vi.fn() },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const suggestions = await searchPlaceSuggestions(
      "cafe",
      session,
      { lat: 13.7563, lng: 100.5018 }
    );

    expect(suggestions).toEqual([
      {
        placeId: "cafe-amazon",
        name: "Cafe Amazon",
        secondaryText: "Sukhumvit, Bangkok",
      },
      { placeId: "fallback-cafe", name: "Fallback Cafe" },
    ]);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: "cafe",
      sessionToken: session.token,
      locationBias: {
        center: { lat: 13.7563, lng: 100.5018 },
        radius: 5000,
      },
    });
  });

  it("resolves a selected prediction name and forgets it when the session ends", async () => {
    class AutocompleteSessionToken {}
    const resolvedPlace: GooglePlace = {
      displayName: { text: "Resolved Cafe" },
      fetchFields: vi.fn(async () => ({ place: resolvedPlace })),
    };
    const fetchFields = vi.fn(async () => ({
      place: resolvedPlace,
    }));
    const selectedPlace: GooglePlace = { fetchFields };
    const toPlace = vi.fn(() => selectedPlace);

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          AutocompleteSessionToken,
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: vi.fn(async () => ({
              suggestions: [
                {
                  placePrediction: {
                    placeId: "resolved-cafe",
                    mainText: { text: "Predicted Cafe" },
                    types: ["cafe", "establishment"],
                    toPlace,
                  },
                },
              ],
            })),
          },
          Place: { searchNearby: vi.fn() },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const [suggestion] = await searchPlaceSuggestions("cafe", session);

    await expect(resolvePlaceSuggestionName(suggestion, session)).resolves.toBe(
      "Resolved Cafe"
    );
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["displayName"] });

    endPlaceAutocompleteSession(session);
    await expect(resolvePlaceSuggestionName(suggestion, session)).rejects.toThrow(
      "Place suggestion is no longer available"
    );
  });

  it("keeps newer autocomplete predictions resolvable when an older search finishes later", async () => {
    class AutocompleteSessionToken {}
    let releaseOlderSearch = () => {};
    const olderResponse = new Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>(
      (resolve) => {
        releaseOlderSearch = () => {
          resolve({
            suggestions: [
              {
                placePrediction: {
                  placeId: "older-cafe",
                  mainText: { text: "Older Cafe" },
                  types: ["cafe", "establishment"],
                },
              },
            ],
          });
        };
      }
    );
    const resolvedPlace: GooglePlace = {
      displayName: { text: "Newer Cafe" },
      fetchFields: vi.fn(async () => ({ place: resolvedPlace })),
    };
    const fetchFields = vi.fn(async () => ({
      place: resolvedPlace,
    }));
    const selectedPlace: GooglePlace = { fetchFields };
    const fetchAutocompleteSuggestions = vi
      .fn()
      .mockImplementationOnce(() => olderResponse)
      .mockResolvedValueOnce({
        suggestions: [
          {
            placePrediction: {
              placeId: "newer-cafe",
              mainText: { text: "Newer Cafe" },
              types: ["cafe", "establishment"],
              toPlace: () => selectedPlace,
            },
          },
        ],
      });

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          AutocompleteSessionToken,
          AutocompleteSuggestion: { fetchAutocompleteSuggestions },
          Place: { searchNearby: vi.fn() },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const session = await createPlaceAutocompleteSession({ apiKey: "test-key" });
    const olderSearch = searchPlaceSuggestions("old", session);
    const [newerSuggestion] = await searchPlaceSuggestions("new", session);
    releaseOlderSearch();
    await olderSearch;

    await expect(
      resolvePlaceSuggestionName(newerSuggestion, session)
    ).resolves.toBe("Newer Cafe");
  });

  it("retries script loading with a fresh script after a load failure", async () => {
    const firstRequest = getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );
    const failedScript = document.getElementById(
      "google-maps-js-api"
    ) as HTMLScriptElement;
    const removeEventListener = vi.spyOn(
      failedScript,
      "removeEventListener"
    );
    failedScript.dispatchEvent(new Event("error"));

    await expect(firstRequest).rejects.toThrow("Failed to load Google Maps");
    expect(document.getElementById("google-maps-js-api")).toBeNull();
    expect(removeEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function)
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );

    const searchNearby = vi.fn(async () => ({
      places: [{ id: "fresh-cafe", displayName: "Fresh Cafe" }],
    }));
    const secondRequest = getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );
    const freshScript = document.getElementById(
      "google-maps-js-api"
    ) as HTMLScriptElement;
    expect(freshScript).not.toBe(failedScript);

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };
    freshScript.dispatchEvent(new Event("load"));

    await expect(secondRequest).resolves.toEqual([
      { placeId: "fresh-cafe", name: "Fresh Cafe" },
    ]);
  });
});
