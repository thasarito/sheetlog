import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEOLOCATION_OPTIONS,
  MissingGoogleMapsApiKeyError,
  getCurrentCoordinates,
  getNearbyPlaceNames,
  resetGooglePlacesLoaderForTests,
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

describe("getNearbyPlaceNames", () => {
  afterEach(() => {
    resetGooglePlacesLoaderForTests();
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    delete window.google;
  });

  it("throws a typed error when the API key is missing", async () => {
    await expect(
      getNearbyPlaceNames({ lat: 13.7563, lng: 100.5018 }, { apiKey: "" })
    ).rejects.toBeInstanceOf(MissingGoogleMapsApiKeyError);
  });

  it("requests only displayName and returns place names", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [
        { displayName: "Starbucks" },
        { displayName: { text: "7-Eleven" } },
        { displayName: "" },
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

    const names = await getNearbyPlaceNames(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "test-key" }
    );

    expect(names).toEqual(["Starbucks", "7-Eleven"]);
    expect(searchNearby).toHaveBeenCalledWith({
      fields: ["displayName"],
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
      places: [{ displayName: "Cafe Amazon" }],
    }));

    const promise = getNearbyPlaceNames(
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

    await expect(promise).resolves.toEqual(["Cafe Amazon"]);
  });
});
