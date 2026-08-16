import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPlaceAutocompleteSession,
  endPlaceAutocompleteSession,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
  type Coordinates,
  type PlaceAutocompleteSession,
  type PlaceSuggestion,
} from '../../lib/googlePlaces';

const INPUT_DEBOUNCE_MS = 250;
const INACTIVE_SESSION_ERROR = 'Place autocomplete session is no longer active';
const INACTIVE_SELECTION_ERROR =
  'Place autocomplete selection is no longer active';

type SessionCleanupTimer = ReturnType<typeof globalThis.setTimeout>;

type SessionScope = {
  active: boolean;
  sessionId: string;
  session?: PlaceAutocompleteSession;
  cleanupTimer?: SessionCleanupTimer;
};

type SelectionAttempt = {
  suggestion: PlaceSuggestion;
  placeSession: PlaceAutocompleteSession;
  normalizedValue: string;
  sessionId: string;
  scope: SessionScope;
};

type PendingSelection = Pick<
  SelectionAttempt,
  'placeSession' | 'normalizedValue' | 'sessionId' | 'scope'
> & {
  promise: Promise<ResolvedPlaceSuggestion>;
};

export type ResolvedPlaceSuggestion = {
  displayName: string;
  placeId: string;
};

export type UsePlaceAutocompleteOptions = {
  value: string;
  active: boolean;
  enabled: boolean;
  sessionId: string;
  locationBias?: Coordinates;
};

export type UsePlaceAutocompleteResult = {
  suggestions: PlaceSuggestion[];
  isDebouncing: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  sessionError: Error | null;
  hasSearched: boolean;
  isSelecting: boolean;
  selectionError: Error | null;
  selectSuggestion(
    suggestion: PlaceSuggestion,
  ): Promise<ResolvedPlaceSuggestion>;
};

export const placeAutocompleteKeys = {
  session: (sessionId: string) =>
    ['placeAutocompleteSession', sessionId] as const,
  suggestions: (sessionId: string, input: string) =>
    ['placeAutocomplete', sessionId, 'suggestions', input] as const,
  suggestionsForSession: (sessionId: string) =>
    ['placeAutocomplete', sessionId, 'suggestions'] as const,
};

function normalizeInput(input: string) {
  return input.trim().replace(/\s+/g, ' ');
}

function cancelScheduledCleanup(scope: SessionScope) {
  if (scope.cleanupTimer === undefined) return;
  globalThis.clearTimeout(scope.cleanupTimer);
  scope.cleanupTimer = undefined;
}

function endScopedSession(scope: SessionScope) {
  const placeSession = scope.session;
  if (!placeSession) return;
  scope.session = undefined;
  endPlaceAutocompleteSession(placeSession);
}

function clearSessionQueries(
  queryClient: QueryClient,
  sessionId: string,
) {
  const suggestionKey = placeAutocompleteKeys.suggestionsForSession(sessionId);
  const sessionKey = placeAutocompleteKeys.session(sessionId);
  void queryClient.cancelQueries({ queryKey: suggestionKey, exact: false });
  queryClient.removeQueries({ queryKey: suggestionKey, exact: false });
  void queryClient.cancelQueries({ queryKey: sessionKey, exact: true });
  queryClient.removeQueries({ queryKey: sessionKey, exact: true });
}

function retireScope(queryClient: QueryClient, scope: SessionScope) {
  cancelScheduledCleanup(scope);
  scope.active = false;
  endScopedSession(scope);
  clearSessionQueries(queryClient, scope.sessionId);
}

function scheduleScopeCleanup(
  queryClient: QueryClient,
  scope: SessionScope,
) {
  cancelScheduledCleanup(scope);
  const cleanupTimer = globalThis.setTimeout(() => {
    if (scope.cleanupTimer !== cleanupTimer) return;
    scope.cleanupTimer = undefined;
    retireScope(queryClient, scope);
  }, 0);
  scope.cleanupTimer = cleanupTimer;
}

export function usePlaceAutocomplete({
  value,
  active,
  enabled,
  sessionId,
  locationBias,
}: UsePlaceAutocompleteOptions): UsePlaceAutocompleteResult {
  const queryClient = useQueryClient();
  const normalizedValue = normalizeInput(value);
  const [debouncedValue, setDebouncedValue] = useState('');
  const mountedRef = useRef(true);
  const activeRef = useRef(active);
  const enabledRef = useRef(enabled);
  const normalizedValueRef = useRef(normalizedValue);
  const sessionIdRef = useRef(sessionId);
  const scopeRef = useRef<SessionScope>();
  const pendingSelectionRef = useRef<PendingSelection>();

  const canLoad = enabled && active && normalizedValue.length >= 2;
  const isCurrentDebouncedValue = debouncedValue === normalizedValue;
  const canSearch =
    canLoad && isCurrentDebouncedValue && debouncedValue.length >= 2;

  if (!scopeRef.current || scopeRef.current.sessionId !== sessionId) {
    scopeRef.current = { active: canLoad, sessionId };
  } else if (canLoad) {
    scopeRef.current.active = true;
  }
  const scope = scopeRef.current;

  activeRef.current = active;
  enabledRef.current = enabled;
  normalizedValueRef.current = normalizedValue;
  sessionIdRef.current = sessionId;

  const isCurrentSessionScope = useCallback(
    (expectedScope: SessionScope, expectedSessionId: string) =>
      mountedRef.current &&
      activeRef.current &&
      enabledRef.current &&
      normalizedValueRef.current.length >= 2 &&
      sessionIdRef.current === expectedSessionId &&
      scopeRef.current === expectedScope &&
      expectedScope.active,
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(
      () => setDebouncedValue(normalizedValue),
      INPUT_DEBOUNCE_MS,
    );
    return () => globalThis.clearTimeout(timeoutId);
  }, [normalizedValue]);

  const sessionQuery = useQuery({
    queryKey: placeAutocompleteKeys.session(sessionId),
    enabled: canLoad,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const placeSession = await createPlaceAutocompleteSession();
      if (!isCurrentSessionScope(scope, sessionId)) {
        endPlaceAutocompleteSession(placeSession);
        throw new Error(INACTIVE_SESSION_ERROR);
      }
      scope.session = placeSession;
      return placeSession;
    },
  });

  const suggestionQuery = useQuery({
    queryKey: placeAutocompleteKeys.suggestions(sessionId, debouncedValue),
    enabled: canSearch && Boolean(sessionQuery.data),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const placeSession = sessionQuery.data;
      if (!placeSession) {
        throw new Error('Place autocomplete session is not available');
      }
      const suggestions = await searchPlaceSuggestions(
        debouncedValue,
        placeSession,
        locationBias,
      );
      if (
        !isCurrentSessionScope(scope, sessionId) ||
        normalizedValueRef.current !== debouncedValue ||
        scope.session !== placeSession
      ) {
        throw new Error(INACTIVE_SESSION_ERROR);
      }
      return suggestions;
    },
  });

  const selectionMutation = useMutation({
    mutationFn: async ({
      suggestion,
      placeSession,
      normalizedValue: selectionValue,
      sessionId: selectionSessionId,
      scope: selectionScope,
    }: SelectionAttempt) => {
      const displayName = await resolvePlaceSuggestionName(
        suggestion,
        placeSession,
      );
      const selectionIsCurrent =
        isCurrentSessionScope(selectionScope, selectionSessionId) &&
        normalizedValueRef.current === selectionValue &&
        selectionScope.session === placeSession;

      if (selectionScope.session === placeSession) {
        selectionScope.session = undefined;
        endPlaceAutocompleteSession(placeSession);
      }

      if (!selectionIsCurrent) {
        throw new Error(INACTIVE_SELECTION_ERROR);
      }

      return { displayName, placeId: suggestion.placeId };
    },
  });

  const resetSelection = selectionMutation.reset;
  useEffect(() => {
    resetSelection();
    const pendingSelection = pendingSelectionRef.current;
    if (
      pendingSelection &&
      (pendingSelection.normalizedValue !== normalizedValue ||
        pendingSelection.sessionId !== sessionId ||
        pendingSelection.scope !== scope ||
        !active ||
        !enabled)
    ) {
      pendingSelectionRef.current = undefined;
    }
  }, [active, enabled, normalizedValue, resetSelection, scope, sessionId]);

  useEffect(() => {
    cancelScheduledCleanup(scope);
    if (canLoad) {
      scope.active = true;
    } else {
      retireScope(queryClient, scope);
    }

    return () => {
      if (canLoad) scheduleScopeCleanup(queryClient, scope);
    };
  }, [canLoad, queryClient, scope]);

  const mutateSelection = selectionMutation.mutateAsync;
  const selectSuggestion = useCallback(
    (suggestion: PlaceSuggestion) => {
      const placeSession = sessionQuery.data;
      if (
        !placeSession ||
        !isCurrentSessionScope(scope, sessionId) ||
        scope.session !== placeSession
      ) {
        return Promise.reject(
          new Error('Place autocomplete session is not available'),
        );
      }

      const pendingSelection = pendingSelectionRef.current;
      if (
        pendingSelection?.placeSession === placeSession &&
        pendingSelection.normalizedValue === normalizedValue &&
        pendingSelection.sessionId === sessionId &&
        pendingSelection.scope === scope
      ) {
        return pendingSelection.promise;
      }

      const promise = mutateSelection({
        suggestion,
        placeSession,
        normalizedValue,
        sessionId,
        scope,
      });
      pendingSelectionRef.current = {
        placeSession,
        normalizedValue,
        sessionId,
        scope,
        promise,
      };
      void promise.then(
        () => {
          if (pendingSelectionRef.current?.promise === promise) {
            pendingSelectionRef.current = undefined;
          }
        },
        () => {
          if (pendingSelectionRef.current?.promise === promise) {
            pendingSelectionRef.current = undefined;
          }
        },
      );
      return promise;
    },
    [
      isCurrentSessionScope,
      mutateSelection,
      normalizedValue,
      scope,
      sessionId,
      sessionQuery.data,
    ],
  );

  const sessionError =
    canLoad && sessionQuery.error instanceof Error ? sessionQuery.error : null;
  const suggestionError =
    canSearch && suggestionQuery.error instanceof Error
      ? suggestionQuery.error
      : null;
  const error = sessionError ?? suggestionError;
  const isDebouncing = canLoad && !isCurrentDebouncedValue;
  const isLoading =
    canLoad &&
    (isDebouncing ||
      sessionQuery.isPending ||
      (canSearch && suggestionQuery.isFetching));
  const hasSearched = canSearch && suggestionQuery.isSuccess;
  const selectionAttempt = selectionMutation.variables;
  const selectionErrorIsCurrent =
    active &&
    enabled &&
    selectionAttempt?.normalizedValue === normalizedValue &&
    selectionAttempt.sessionId === sessionId &&
    selectionAttempt.scope === scope;

  return {
    suggestions:
      canSearch && suggestionQuery.isSuccess
        ? (suggestionQuery.data ?? [])
        : [],
    isDebouncing,
    isLoading,
    isError: error !== null,
    error,
    sessionError,
    hasSearched,
    isSelecting: selectionMutation.isPending,
    selectionError:
      selectionErrorIsCurrent && selectionMutation.error instanceof Error
        ? selectionMutation.error
        : null,
    selectSuggestion,
  };
}
