export {};

declare global {
  type GooglePlaceDisplayName = string | { text?: string };

  type GoogleNearbyPlace = {
    id?: string;
    displayName?: GooglePlaceDisplayName;
    formattedAddress?: string;
  };

  type GoogleAutocompleteSessionToken = object;

  type GooglePlacePrediction = {
    placeId?: string;
    text?: GooglePlaceDisplayName;
    structuredFormat?: {
      mainText?: GooglePlaceDisplayName;
      secondaryText?: GooglePlaceDisplayName;
    };
    toPlace?: () => GooglePlace;
  };

  type GoogleAutocompleteSuggestion = {
    placePrediction?: GooglePlacePrediction;
  };

  type GooglePlace = {
    fetchFields: (request: {
      fields: string[];
    }) => Promise<{ displayName?: GooglePlaceDisplayName }>;
  };

  type GooglePlacesLibrary = {
    Place?: {
      searchNearby: (request: {
        fields: string[];
        locationRestriction: {
          center: { lat: number; lng: number };
          radius: number;
        };
        maxResultCount: number;
        rankPreference: unknown;
      }) => Promise<{ places?: GoogleNearbyPlace[] }>;
    };
    SearchNearbyRankPreference?: {
      POPULARITY: unknown;
      DISTANCE?: unknown;
    };
    AutocompleteSessionToken?: new () => GoogleAutocompleteSessionToken;
    AutocompleteSuggestion?: {
      fetchAutocompleteSuggestions: (request: {
        input: string;
        includedPrimaryTypes: string[];
        sessionToken: GoogleAutocompleteSessionToken;
        locationBias?: {
          center: { lat: number; lng: number };
          radius: number;
        };
      }) => Promise<{ suggestions?: GoogleAutocompleteSuggestion[] }>;
    };
  };

  interface Window {
    google?: {
      maps?: {
        importLibrary?: (library: "places") => Promise<GooglePlacesLibrary>;
      };
    };
  }
}
