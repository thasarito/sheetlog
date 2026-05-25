export {};

type GooglePlaceDisplayName = string | { text?: string };

type GoogleNearbyPlace = {
  displayName?: GooglePlaceDisplayName;
};

type GooglePlacesLibrary = {
  Place: {
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
  SearchNearbyRankPreference: {
    POPULARITY: unknown;
    DISTANCE?: unknown;
  };
};

declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (library: "places") => Promise<GooglePlacesLibrary>;
      };
    };
  }
}
