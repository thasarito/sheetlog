export type Coordinates = {
  lat: number;
  lng: number;
};

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  secondaryText?: string;
  distanceMeters?: number;
};

export type PlaceAutocompleteSession = {
  token: GoogleAutocompleteSessionToken;
  apiKey?: string;
};

type NearbyPlacesOptions = {
  apiKey?: string;
  radius?: number;
  maxResultCount?: number;
};

type PlaceAutocompleteOptions = {
  apiKey?: string;
};

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 2000,
  maximumAge: 60000,
};

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js-api";
const GOOGLE_MAPS_READY_POLL_INTERVAL_MS = 10;
const GOOGLE_MAPS_READY_TIMEOUT_MS = 5000;
const MAX_NEARBY_RESULT_COUNT = 5;

let mapsScriptPromise: Promise<void> | null = null;
const autocompletePredictions = new Map<
  GoogleAutocompleteSessionToken,
  Map<string, GooglePlacePrediction>
>();

export class MissingGoogleMapsApiKeyError extends Error {
  constructor() {
    super("Missing VITE_GOOGLE_MAPS_API_KEY");
    this.name = "MissingGoogleMapsApiKeyError";
  }
}

export function hasGoogleMapsApiKey(explicitApiKey?: string) {
  return Boolean(explicitApiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

// Interactive callers may prompt. Automatic lookups must pass allowPrompt: false.
export async function getCurrentCoordinates({
  allowPrompt = true,
}: { allowPrompt?: boolean } = {}): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Geolocation is not available"));
  }

  if (!allowPrompt) {
    let permission: PermissionState | undefined;
    try {
      permission = (
        await navigator.permissions?.query({ name: "geolocation" })
      )?.state;
    } catch {
      // Unsupported Permissions APIs are not evidence of a grant.
    }
    // Grants can expire between transactions. Never cache an earlier grant or
    // probe with getCurrentPosition: that probe itself can display a prompt.
    if (permission !== "granted") {
      throw new Error("Location permission requires a user action");
    }
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

  let loaderPromise: Promise<void>;
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    const mapsScript = script ?? document.createElement("script");
    let readyPoll: number | null = null;
    let readyDeadline = 0;

    function cleanup() {
      mapsScript.removeEventListener("load", succeed);
      mapsScript.removeEventListener("error", fail);
      if (readyPoll !== null) {
        window.clearTimeout(readyPoll);
        readyPoll = null;
      }
    }

    function resolveWhenReady() {
      if (hasPlacesImporter()) {
        cleanup();
        resolve();
        return;
      }
      if (Date.now() >= readyDeadline) {
        fail();
        return;
      }
      readyPoll = window.setTimeout(
        resolveWhenReady,
        GOOGLE_MAPS_READY_POLL_INTERVAL_MS
      );
    }

    function succeed() {
      readyDeadline = Date.now() + GOOGLE_MAPS_READY_TIMEOUT_MS;
      resolveWhenReady();
    }

    function fail() {
      cleanup();
      if (mapsScriptPromise === loaderPromise) {
        mapsScriptPromise = null;
      }
      mapsScript.remove();
      reject(new Error("Failed to load Google Maps"));
    }

    mapsScript.addEventListener("load", succeed, { once: true });
    mapsScript.addEventListener("error", fail, { once: true });

    if (script) {
      return;
    }

    mapsScript.id = GOOGLE_MAPS_SCRIPT_ID;
    mapsScript.async = true;
    mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&loading=async&v=weekly`;
    document.head.appendChild(mapsScript);
  });
  mapsScriptPromise = loaderPromise;

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

function normalizeDistanceMeters(distanceMeters: unknown): number | undefined {
  return typeof distanceMeters === "number" &&
    Number.isFinite(distanceMeters) &&
    distanceMeters >= 0
    ? distanceMeters
    : undefined;
}

export function formatPlaceDistance(distanceMeters?: number): string | null {
  const distance = normalizeDistanceMeters(distanceMeters);
  if (distance === undefined) return null;

  const roundedMeters = Math.round(distance);
  return roundedMeters < 1000
    ? `${roundedMeters} m`
    : `${(distance / 1000).toFixed(1)} km`;
}

function createPlaceSuggestion(
  placeId: unknown,
  displayName: unknown,
  secondaryText?: unknown,
  distanceMeters?: unknown
): PlaceSuggestion | null {
  if (typeof placeId !== "string" || placeId.trim().length === 0) {
    return null;
  }

  const name = normalizeDisplayName(displayName);
  if (!name) {
    return null;
  }

  const secondary = normalizeDisplayName(secondaryText);
  const distance = normalizeDistanceMeters(distanceMeters);
  return {
    placeId,
    name,
    ...(secondary ? { secondaryText: secondary } : {}),
    ...(distance !== undefined ? { distanceMeters: distance } : {}),
  };
}

function limitNearbyResults(maxResultCount?: number) {
  if (maxResultCount === undefined || !Number.isFinite(maxResultCount)) {
    return MAX_NEARBY_RESULT_COUNT;
  }

  return Math.max(
    0,
    Math.min(Math.trunc(maxResultCount), MAX_NEARBY_RESULT_COUNT)
  );
}

async function getPlacesLibrary(apiKey: string) {
  await loadGoogleMapsScript(apiKey);

  const placesLibrary = await window.google?.maps?.importLibrary?.("places");
  if (!placesLibrary) {
    throw new Error("Google Places library is not available");
  }

  return placesLibrary;
}

export async function getNearbyPlaces(
  coordinates: Coordinates,
  options: NearbyPlacesOptions = {}
): Promise<PlaceSuggestion[]> {
  const maxResultCount = limitNearbyResults(options.maxResultCount);
  if (maxResultCount === 0) {
    return [];
  }

  const placesLibrary = await getPlacesLibrary(getApiKey(options.apiKey));
  const searchNearby = placesLibrary.Place?.searchNearby;
  const popularity = placesLibrary.SearchNearbyRankPreference?.POPULARITY;
  if (!searchNearby || popularity === undefined) {
    throw new Error("Google Places nearby search is not available");
  }

  const response = await searchNearby({
    fields: ["id", "displayName", "formattedAddress"],
    locationRestriction: {
      center: coordinates,
      radius: options.radius ?? 100,
    },
    maxResultCount,
    rankPreference: popularity,
  });

  const placeIds = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const place of response.places ?? []) {
    const suggestion = createPlaceSuggestion(
      place.id,
      place.displayName,
      place.formattedAddress
    );
    if (!suggestion || placeIds.has(suggestion.placeId)) {
      continue;
    }
    placeIds.add(suggestion.placeId);
    suggestions.push(suggestion);
    if (suggestions.length === maxResultCount) {
      break;
    }
  }

  return suggestions.slice(0, maxResultCount);
}

export async function createPlaceAutocompleteSession(
  options: PlaceAutocompleteOptions = {}
): Promise<PlaceAutocompleteSession> {
  const placesLibrary = await getPlacesLibrary(getApiKey(options.apiKey));
  const SessionToken = placesLibrary.AutocompleteSessionToken;
  if (!SessionToken) {
    throw new Error("Google Places autocomplete is not available");
  }

  const token = new SessionToken();
  autocompletePredictions.set(token, new Map());
  return { token, apiKey: options.apiKey };
}

function isPlacePredictionForVenue(prediction: GooglePlacePrediction) {
  return (
    Array.isArray(prediction.types) &&
    prediction.types.some(
      (type) => type === "establishment" || type === "point_of_interest"
    )
  );
}

export async function searchPlaceSuggestions(
  input: string,
  session: PlaceAutocompleteSession,
  locationBias?: Coordinates
): Promise<PlaceSuggestion[]> {
  const predictions = autocompletePredictions.get(session.token);
  if (!predictions) {
    throw new Error("Place autocomplete session has ended");
  }

  const placesLibrary = await getPlacesLibrary(getApiKey(session.apiKey));
  const fetchAutocompleteSuggestions =
    placesLibrary.AutocompleteSuggestion?.fetchAutocompleteSuggestions;
  if (!fetchAutocompleteSuggestions) {
    throw new Error("Google Places autocomplete is not available");
  }

  const response = await fetchAutocompleteSuggestions({
    input,
    sessionToken: session.token,
    ...(locationBias
      ? {
          origin: locationBias,
          locationBias: {
            center: locationBias,
            radius: 5000,
          },
        }
      : {}),
  });

  const responsePlaceIds = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const autocompleteSuggestion of response.suggestions ?? []) {
    const prediction = autocompleteSuggestion.placePrediction;
    const suggestion = createPlaceSuggestion(
      prediction?.placeId,
      prediction?.mainText ?? prediction?.text,
      prediction?.secondaryText,
      locationBias ? prediction?.distanceMeters : undefined
    );
    if (
      !prediction ||
      !isPlacePredictionForVenue(prediction) ||
      !suggestion ||
      responsePlaceIds.has(suggestion.placeId)
    ) {
      continue;
    }
    responsePlaceIds.add(suggestion.placeId);
    predictions.set(suggestion.placeId, prediction);
    suggestions.push(suggestion);
  }

  if (locationBias) {
    // Preserve Google's ordering for ties and results without a distance.
    suggestions.sort((a, b) => {
      if (a.distanceMeters === undefined) {
        return b.distanceMeters === undefined ? 0 : 1;
      }
      if (b.distanceMeters === undefined) return -1;
      return a.distanceMeters - b.distanceMeters;
    });
  }
  return suggestions;
}

export async function resolvePlaceSuggestionName(
  suggestion: PlaceSuggestion,
  session: PlaceAutocompleteSession
): Promise<string> {
  const prediction = autocompletePredictions
    .get(session.token)
    ?.get(suggestion.placeId);
  if (!prediction?.toPlace) {
    throw new Error("Place suggestion is no longer available");
  }

  const place = prediction.toPlace();
  const { place: resolvedPlace } = await place.fetchFields({
    fields: ["displayName"],
  });
  return normalizeDisplayName(resolvedPlace.displayName) || suggestion.name;
}

export function endPlaceAutocompleteSession(session: PlaceAutocompleteSession) {
  autocompletePredictions.delete(session.token);
}

export async function getNearbyPlaceNames(
  coordinates: Coordinates,
  options: NearbyPlacesOptions = {}
) {
  const places = await getNearbyPlaces(coordinates, options);
  return places.map((place) => place.name);
}

export function resetGooglePlacesLoaderForTests() {
  mapsScriptPromise = null;
  autocompletePredictions.clear();
  document.getElementById(GOOGLE_MAPS_SCRIPT_ID)?.remove();
}
