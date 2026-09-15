import { useEffect } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

type SessionCleanupTimer = ReturnType<typeof globalThis.setTimeout>;
type NearbySessionScope = {
  active: boolean;
  cleanupTimer?: SessionCleanupTimer;
  requestedCoordinates?: Promise<Coordinates>;
};

const nearbySessionScopes = new WeakMap<
  QueryClient,
  Map<string, NearbySessionScope>
>();

function getSessionScope(queryClient: QueryClient, sessionId: string) {
  let scopes = nearbySessionScopes.get(queryClient);
  if (!scopes) {
    scopes = new Map();
    nearbySessionScopes.set(queryClient, scopes);
  }
  let scope = scopes.get(sessionId);
  if (!scope) {
    scope = { active: true };
    scopes.set(sessionId, scope);
  }
  return scope;
}

function retireSessionScope(
  queryClient: QueryClient,
  sessionId: string,
  scope: NearbySessionScope,
) {
  scope.active = false;
  scope.requestedCoordinates = undefined;
  const scopes = nearbySessionScopes.get(queryClient);
  if (scopes?.get(sessionId) === scope) {
    scopes.delete(sessionId);
  }
}

function assertSessionActive(
  scope: NearbySessionScope,
  queryClient: QueryClient,
  sessionId: string,
) {
  const query = queryClient.getQueryCache().find({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    exact: true,
  });
  if (!scope.active || !query?.isActive()) {
    throw new Error("Nearby place session is no longer active");
  }
}

function cancelScheduledSessionCleanup(scope: NearbySessionScope) {
  const timer = scope.cleanupTimer;
  if (timer === undefined) {
    return;
  }
  globalThis.clearTimeout(timer);
  scope.cleanupTimer = undefined;
}

function clearSessionQuery(queryClient: QueryClient, sessionId: string) {
  const queryKey = nearbyPlaceSuggestionKeys.session(sessionId);
  void queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.removeQueries({ queryKey, exact: true });
}

function scheduleSessionCleanup(
  queryClient: QueryClient,
  sessionId: string,
  scope: NearbySessionScope,
) {
  cancelScheduledSessionCleanup(scope);
  const timer = globalThis.setTimeout(() => {
    if (scope.cleanupTimer !== timer) {
      return;
    }
    scope.cleanupTimer = undefined;
    retireSessionScope(queryClient, sessionId, scope);
    clearSessionQuery(queryClient, sessionId);
  }, 0);
  scope.cleanupTimer = timer;
}

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
  const sessionScope = getSessionScope(queryClient, sessionId);
  const query = useQuery({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    enabled: canSearch,
    retry: false,
    staleTime: Infinity,
    gcTime: 1000 * 30,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      // A tap contributes one already-started request, never reusable consent.
      const requestedCoordinates = sessionScope.requestedCoordinates;
      sessionScope.requestedCoordinates = undefined;
      let coordinates: Coordinates;
      try {
        coordinates = await (
          requestedCoordinates ?? getCurrentCoordinates({ allowPrompt: false })
        );
      } catch {
        assertSessionActive(sessionScope, queryClient, sessionId);
        return { coordinates: undefined, suggestions: [] };
      }
      assertSessionActive(sessionScope, queryClient, sessionId);

      try {
        const suggestions = await getNearbyPlaces(coordinates);
        assertSessionActive(sessionScope, queryClient, sessionId);
        return {
          coordinates,
          suggestions,
        };
      } catch {
        assertSessionActive(sessionScope, queryClient, sessionId);
        return { coordinates, suggestions: [] };
      }
    },
  });

  useEffect(() => {
    cancelScheduledSessionCleanup(sessionScope);
    sessionScope.active = true;

    if (!canSearch) {
      retireSessionScope(queryClient, sessionId, sessionScope);
      clearSessionQuery(queryClient, sessionId);
    }

    return () => {
      if (canSearch) {
        scheduleSessionCleanup(queryClient, sessionId, sessionScope);
      }
    };
  }, [canSearch, queryClient, sessionId, sessionScope]);

  const data: { suggestions: PlaceSuggestion[]; coordinates?: Coordinates } =
    canSearch ? (query.data ?? { suggestions: [] }) : { suggestions: [] };

  const requestLocation = () => {
    const currentQuery = queryClient.getQueryCache().find({
      queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
      exact: true,
    });
    if (
      !canSearch ||
      !sessionScope.active ||
      !currentQuery?.isActive() ||
      currentQuery.state.fetchStatus !== "idle"
    ) {
      return;
    }

    // Start in the click handler, not in a retry/reconnect or deferred query.
    const requestedCoordinates = getCurrentCoordinates({ allowPrompt: true });
    sessionScope.requestedCoordinates = requestedCoordinates;
    // The session can close before its query consumes this promise.
    void requestedCoordinates.catch(() => undefined);
    void query.refetch({ cancelRefetch: false });
  };

  return {
    suggestions: data.suggestions,
    coordinates: data.coordinates,
    isLoading: canSearch && (query.isLoading || query.isFetching),
    canSearch,
    canRequestLocation:
      canSearch &&
      !query.isLoading &&
      !query.isFetching &&
      !data.coordinates &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.geolocation),
    requestLocation,
  };
}
