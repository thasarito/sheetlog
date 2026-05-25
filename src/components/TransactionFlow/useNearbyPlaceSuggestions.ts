import { useQuery } from "@tanstack/react-query";
import {
  getCurrentCoordinates,
  getNearbyPlaceNames,
} from "../../lib/googlePlaces";

export const nearbyPlaceSuggestionKeys = {
  all: ["nearbyPlaceSuggestions"] as const,
  session: (sessionId: number) =>
    [...nearbyPlaceSuggestionKeys.all, sessionId] as const,
};

export function useNearbyPlaceSuggestions({
  enabled,
  sessionId,
}: {
  enabled: boolean;
  sessionId: number;
}) {
  const query = useQuery({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 1000 * 30,
    queryFn: async () => {
      try {
        const coordinates = await getCurrentCoordinates();
        return await getNearbyPlaceNames(coordinates);
      } catch {
        return [];
      }
    },
  });

  const suggestions = query.data ?? [];

  return {
    suggestions,
    isLoading: enabled && (query.isLoading || query.isFetching),
    shouldShowAttribution: suggestions.length > 0,
  };
}
