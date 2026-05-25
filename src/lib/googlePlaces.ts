export type Coordinates = {
  lat: number;
  lng: number;
};

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 2000,
  maximumAge: 60000,
};

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js-api";

let mapsScriptPromise: Promise<void> | null = null;

export class MissingGoogleMapsApiKeyError extends Error {
  constructor() {
    super("Missing VITE_GOOGLE_MAPS_API_KEY");
    this.name = "MissingGoogleMapsApiKeyError";
  }
}

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Geolocation is not available"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => reject(error),
      GEOLOCATION_OPTIONS
    );
  });
}

function getApiKey(explicitApiKey?: string) {
  const apiKey = explicitApiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new MissingGoogleMapsApiKeyError();
  }
  return apiKey;
}

function hasPlacesImporter() {
  return (
    typeof window !== "undefined" && Boolean(window.google?.maps?.importLibrary)
  );
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in a browser"));
  }

  if (hasPlacesImporter()) {
    return Promise.resolve();
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as
      | HTMLScriptElement
      | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&loading=async&v=weekly`;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load Google Maps")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

function normalizeDisplayName(displayName: unknown) {
  if (typeof displayName === "string") {
    return displayName.trim();
  }
  if (
    displayName &&
    typeof displayName === "object" &&
    "text" in displayName &&
    typeof displayName.text === "string"
  ) {
    return displayName.text.trim();
  }
  return "";
}

export async function getNearbyPlaceNames(
  coordinates: Coordinates,
  options: {
    apiKey?: string;
    radius?: number;
    maxResultCount?: number;
  } = {}
) {
  const apiKey = getApiKey(options.apiKey);
  await loadGoogleMapsScript(apiKey);

  const placesLibrary = await window.google?.maps?.importLibrary?.("places");
  if (!placesLibrary) {
    throw new Error("Google Places library is not available");
  }

  const { Place, SearchNearbyRankPreference } = placesLibrary;
  const response = await Place.searchNearby({
    fields: ["displayName"],
    locationRestriction: {
      center: coordinates,
      radius: options.radius ?? 100,
    },
    maxResultCount: options.maxResultCount ?? 5,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
  });

  const names = (response.places ?? [])
    .map((place) => normalizeDisplayName(place.displayName))
    .filter((name) => name.length > 0);

  return Array.from(new Set(names)).slice(0, options.maxResultCount ?? 5);
}

export function resetGooglePlacesLoaderForTests() {
  mapsScriptPromise = null;
}
