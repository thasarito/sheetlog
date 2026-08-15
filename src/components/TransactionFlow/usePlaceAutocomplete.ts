import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPlaceAutocompleteSession,
  endPlaceAutocompleteSession,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
  type Coordinates,
  type PlaceAutocompleteSession,
  type PlaceSuggestion,
} from "../../lib/googlePlaces";

const INPUT_DEBOUNCE_MS = 250;

export const placeAutocompleteKeys = {
  session: (sessionId: string) =>
    ["placeAutocompleteSession", sessionId] as const,
  suggestions: (sessionId: string, input: string) =>
    ["placeAutocomplete", sessionId, "suggestions", input] as const,
  suggestionsForSession: (sessionId: string) =>
    ["placeAutocomplete", sessionId, "suggestions"] as const,
};

function normalizeInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function usePlaceAutocomplete({
  open,
  enabled,
  sessionId,
  locationBias,
}: {
  open: boolean;
  enabled: boolean;
  sessionId: string;
  locationBias?: Coordinates;
}) {
  const queryClient = useQueryClient();
  const [input, setInputValue] = useState("");
  const [debouncedInput, setDebouncedInput] = useState("");
  const activeSessionRef = useRef<{
    sessionId: string;
    session: PlaceAutocompleteSession;
  }>();
  const selectionPromiseRef = useRef<Promise<string>>();
  const openRef = useRef(open);
  const scopeRef = useRef({ mounted: true, sessionId });
  if (scopeRef.current.sessionId !== sessionId) {
    scopeRef.current = { mounted: true, sessionId };
  }
  const scope = scopeRef.current;
  openRef.current = open;

  const normalizedInput = normalizeInput(input);
  const canLoad = open && enabled;
  const canSearch = canLoad && normalizedInput.length >= 2 && debouncedInput.length >= 2;

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedInput(normalizedInput),
      INPUT_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timeoutId);
  }, [normalizedInput]);

  const sessionQuery = useQuery({
    queryKey: placeAutocompleteKeys.session(sessionId),
    enabled: canLoad,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const placeSession = await createPlaceAutocompleteSession();
      if (!openRef.current || !scope.mounted || scopeRef.current !== scope) {
        endPlaceAutocompleteSession(placeSession);
        throw new Error("Place autocomplete session is no longer active");
      }
      return placeSession;
    },
  });

  useEffect(() => {
    if (canLoad && sessionQuery.data && scopeRef.current === scope) {
      activeSessionRef.current = { sessionId, session: sessionQuery.data };
    }
  }, [canLoad, scope, sessionId, sessionQuery.data]);

  const suggestionQuery = useQuery({
    queryKey: placeAutocompleteKeys.suggestions(sessionId, debouncedInput),
    enabled: canSearch && Boolean(sessionQuery.data),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: canSearch ? keepPreviousData : undefined,
    queryFn: () => {
      if (!sessionQuery.data) {
        throw new Error("Place autocomplete session is not available");
      }
      return searchPlaceSuggestions(debouncedInput, sessionQuery.data, locationBias);
    },
  });

  const selection = useMutation({
    mutationFn: async ({
      suggestion,
      placeSession,
    }: {
      suggestion: PlaceSuggestion;
      placeSession: PlaceAutocompleteSession;
    }) => {
      const displayName = await resolvePlaceSuggestionName(suggestion, placeSession);
      endPlaceAutocompleteSession(placeSession);
      if (activeSessionRef.current?.session === placeSession) {
        activeSessionRef.current = undefined;
      }
      return displayName;
    },
  });

  const setInput = useCallback(
    (nextInput: string) => {
      selection.reset();
      setInputValue(nextInput);
    },
    [selection]
  );

  const reset = useCallback(() => {
    setInputValue("");
    setDebouncedInput("");
    selection.reset();
    selectionPromiseRef.current = undefined;

    const activeSession = activeSessionRef.current?.session;
    if (activeSession) {
      endPlaceAutocompleteSession(activeSession);
      activeSessionRef.current = undefined;
    }

    queryClient.removeQueries({
      queryKey: placeAutocompleteKeys.suggestionsForSession(sessionId),
      exact: false,
    });
    queryClient.removeQueries({
      queryKey: placeAutocompleteKeys.session(sessionId),
      exact: true,
    });
  }, [queryClient, selection, sessionId]);

  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      reset();
    }
    wasOpenRef.current = open;
  }, [open, reset]);

  useEffect(() => {
    return () => {
      scope.mounted = false;
      const activeSession = activeSessionRef.current;
      if (activeSession?.sessionId === scope.sessionId) {
        endPlaceAutocompleteSession(activeSession.session);
        activeSessionRef.current = undefined;
      }
      queryClient.removeQueries({
        queryKey: placeAutocompleteKeys.suggestionsForSession(scope.sessionId),
        exact: false,
      });
      queryClient.removeQueries({
        queryKey: placeAutocompleteKeys.session(scope.sessionId),
        exact: true,
      });
    };
  }, [queryClient, scope]);

  const selectSuggestion = useCallback(
    (suggestion: PlaceSuggestion) => {
      if (selectionPromiseRef.current) {
        return selectionPromiseRef.current;
      }
      if (!sessionQuery.data) {
        return Promise.reject(new Error("Place autocomplete session is not available"));
      }

      const promise = selection.mutateAsync({
        suggestion,
        placeSession: sessionQuery.data,
      });
      selectionPromiseRef.current = promise;
      void promise.then(
        () => {
          if (selectionPromiseRef.current === promise) {
            selectionPromiseRef.current = undefined;
          }
        },
        () => {
          if (selectionPromiseRef.current === promise) {
            selectionPromiseRef.current = undefined;
          }
        }
      );
      return promise;
    },
    [selection, sessionQuery.data]
  );

  const retry = useCallback(async () => {
    if (sessionQuery.isError) {
      await sessionQuery.refetch();
      return;
    }
    if (suggestionQuery.isError) {
      await suggestionQuery.refetch();
    }
  }, [sessionQuery, suggestionQuery]);

  const isError =
    (canLoad && sessionQuery.isError) || (canSearch && suggestionQuery.isError);
  const error =
    (canSearch ? suggestionQuery.error : null) ??
    (canLoad ? sessionQuery.error : null) ??
    null;

  return {
    input,
    setInput,
    suggestions: canSearch ? (suggestionQuery.data ?? []) : [],
    isLoading:
      (canLoad && (sessionQuery.isLoading || sessionQuery.isFetching)) ||
      (canSearch && (suggestionQuery.isLoading || suggestionQuery.isFetching)),
    isSelecting: selection.isPending,
    isError,
    error,
    selectionError: selection.error ?? null,
    retry,
    selectSuggestion,
    reset,
  };
}
