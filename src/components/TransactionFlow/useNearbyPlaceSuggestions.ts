import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentCoordinates,
  getNearbyPlaces,
  hasGoogleMapsApiKey,
  type Coordinates,
  type PlaceSuggestion,
} from "../../lib/googlePlaces";

export const nearbyPlaceSuggestionKeys = {
  all: ["nearbyPlaceSuggestions"] as const,
  session: (sessionId: string) =>
    [...nearbyPlaceSuggestionKeys.all, sessionId] as const,
};

export function useNearbyPlaceSuggestions({
  enabled,
  isOnline,
  sessionId,
}: {
  enabled: boolean;
  isOnline: boolean;
  sessionId: string;
}) {
  const canSearch = enabled && isOnline && hasGoogleMapsApiKey();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    enabled: canSearch,
    retry: false,
    staleTime: Infinity,
    gcTime: 1000 * 30,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      let coordinates: Coordinates;
      try {
        coordinates = await getCurrentCoordinates();
      } catch {
        signal.throwIfAborted();
        return { coordinates: undefined, suggestions: [] };
      }
      signal.throwIfAborted();

      try {
        const suggestions = await getNearbyPlaces(coordinates);
        signal.throwIfAborted();
        return {
          coordinates,
          suggestions,
        };
      } catch {
        signal.throwIfAborted();
        return { coordinates, suggestions: [] };
      }
    },
  });

  useEffect(() => {
    const queryKey = nearbyPlaceSuggestionKeys.session(sessionId);
    const clearSession = () => {
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.removeQueries({ queryKey, exact: true });
    };

    if (!canSearch) {
      clearSession();
    }

    return clearSession;
  }, [canSearch, queryClient, sessionId]);

  const data: { suggestions: PlaceSuggestion[]; coordinates?: Coordinates } =
    canSearch ? (query.data ?? { suggestions: [] }) : { suggestions: [] };

  return {
    suggestions: data.suggestions,
    coordinates: data.coordinates,
    isLoading: canSearch && (query.isLoading || query.isFetching),
    canSearch,
  };
}
