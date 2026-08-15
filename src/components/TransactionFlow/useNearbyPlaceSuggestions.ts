import { useQuery } from "@tanstack/react-query";
import {
  getCurrentCoordinates,
  getNearbyPlaces,
  hasGoogleMapsApiKey,
  type Coordinates,
  type PlaceSuggestion,
} from "../../lib/googlePlaces";

export const nearbyPlaceSuggestionKeys = {
  all: ["nearbyPlaceSuggestions"] as const,
  session: (sessionId: number) =>
    [...nearbyPlaceSuggestionKeys.all, sessionId] as const,
};

export function useNearbyPlaceSuggestions({
  enabled,
  isOnline,
  sessionId,
}: {
  enabled: boolean;
  isOnline: boolean;
  sessionId: number;
}) {
  const canSearch = enabled && isOnline && hasGoogleMapsApiKey();
  const query = useQuery({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    enabled: canSearch,
    retry: false,
    staleTime: Infinity,
    gcTime: 1000 * 30,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      let coordinates: Coordinates;
      try {
        coordinates = await getCurrentCoordinates();
      } catch {
        return { suggestions: [] };
      }

      try {
        return {
          coordinates,
          suggestions: await getNearbyPlaces(coordinates),
        };
      } catch {
        return { coordinates, suggestions: [] };
      }
    },
  });

  const data: { suggestions: PlaceSuggestion[]; coordinates?: Coordinates } =
    query.data ?? { suggestions: [] };

  return {
    suggestions: data.suggestions,
    coordinates: data.coordinates,
    isLoading: canSearch && (query.isLoading || query.isFetching),
    canSearch,
  };
}
