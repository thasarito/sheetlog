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
  });

  it("uses one autocomplete session and maps prediction names with address text", async () => {
    class AutocompleteSessionToken {}
    const fetchAutocompleteSuggestions = vi.fn(async () => ({
      suggestions: [
        {
          placePrediction: {
            placeId: "cafe-amazon",
            structuredFormat: {
              mainText: { text: "Cafe Amazon" },
              secondaryText: { text: "Sukhumvit, Bangkok" },
            },
            toPlace: vi.fn(),
          },
        },
        { placePrediction: { placeId: "missing-name" } },
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
    ]);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: "cafe",
      includedPrimaryTypes: ["establishment"],
      sessionToken: session.token,
      locationBias: {
        center: { lat: 13.7563, lng: 100.5018 },
        radius: 5000,
      },
    });
  });

  it("resolves a selected prediction name and forgets it when the session ends", async () => {
    class AutocompleteSessionToken {}
    const fetchFields = vi.fn(async () => ({
      displayName: { text: "Resolved Cafe" },
    }));
    const toPlace = vi.fn(() => ({ fetchFields }));

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
                    structuredFormat: { mainText: { text: "Predicted Cafe" } },
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

  it("retries script loading with a fresh script after a load failure", async () => {
    const firstRequest = getNearbyPlaces(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );
    const failedScript = document.getElementById(
      "google-maps-js-api"
    ) as HTMLScriptElement;
    failedScript.dispatchEvent(new Event("error"));

    await expect(firstRequest).rejects.toThrow("Failed to load Google Maps");
    expect(document.getElementById("google-maps-js-api")).toBeNull();

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
