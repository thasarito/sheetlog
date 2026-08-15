import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlaceAutocompleteSession,
  endPlaceAutocompleteSession,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
} from "../../lib/googlePlaces";
import { usePlaceAutocomplete } from "./usePlaceAutocomplete";

vi.mock("../../lib/googlePlaces", () => ({
  createPlaceAutocompleteSession: vi.fn(),
  endPlaceAutocompleteSession: vi.fn(),
  resolvePlaceSuggestionName: vi.fn(),
  searchPlaceSuggestions: vi.fn(),
}));

const session = { token: {} as GoogleAutocompleteSessionToken };
const firstSuggestion = {
  placeId: "place-1",
  name: "Coffee House",
  secondaryText: "123 Main Street",
};
const secondSuggestion = {
  placeId: "place-2",
  name: "Coffee Roasters",
  secondaryText: "456 High Street",
};

function createWrapper() {
  return createTestHarness().Wrapper;
}

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { Wrapper, queryClient };
}

async function enterSearch(
  result: { current: ReturnType<typeof usePlaceAutocomplete> },
  input: string
) {
  act(() => result.current.setInput(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

async function flushQueries() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("usePlaceAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(createPlaceAutocompleteSession).mockResolvedValue(session);
    vi.mocked(searchPlaceSuggestions).mockResolvedValue([firstSuggestion]);
    vi.mocked(resolvePlaceSuggestionName).mockResolvedValue("Coffee House");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not create a session while closed or disabled", () => {
    const closed = renderHook(
      () => usePlaceAutocomplete({ open: false, enabled: true, sessionId: "closed" }),
      { wrapper: createWrapper() }
    );
    const disabled = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: false, sessionId: "disabled" }),
      { wrapper: createWrapper() }
    );

    expect(closed.result.current.suggestions).toEqual([]);
    expect(disabled.result.current.suggestions).toEqual([]);
    expect(createPlaceAutocompleteSession).not.toHaveBeenCalled();
  });

  it("immediately clears cached suggestions below two trimmed characters without another request", async () => {
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "threshold" }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);

    act(() => result.current.setInput(" c "));

    expect(result.current.suggestions).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(searchPlaceSuggestions).toHaveBeenCalledTimes(1);
  });

  it("stores an opened session under the exact session cache key", async () => {
    const { Wrapper, queryClient } = createTestHarness();
    renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "session-key" }),
      { wrapper: Wrapper }
    );

    await flushQueries();
    expect(queryClient.getQueryData(["placeAutocompleteSession", "session-key"])).toBe(
      session
    );
  });

  it("debounces a normalized query for exactly 250ms and uses one session token", async () => {
    const { result, rerender } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "one-token" }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    act(() => result.current.setInput("  Coffee   Shop  "));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(searchPlaceSuggestions).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("Coffee Shop", session, undefined);
    rerender();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
  });

  it("forwards a location bias to autocomplete", async () => {
    const locationBias = { lat: 13.7563, lng: 100.5018 };
    const { result } = renderHook(
      () =>
        usePlaceAutocomplete({
          open: true,
          enabled: true,
          sessionId: "location-bias",
          locationBias,
        }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("coffee", session, locationBias);
  });

  it("keeps the newer result when an older unresolved query completes later", async () => {
    let resolveFirst: ((value: typeof firstSuggestion[]) => void) | undefined;
    let resolveSecond: ((value: typeof secondSuggestion[]) => void) | undefined;
    vi.mocked(searchPlaceSuggestions).mockImplementation((input) => {
      return new Promise((resolve) => {
        if (input === "first") resolveFirst = resolve;
        if (input === "second") resolveSecond = resolve;
      });
    });
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "race" }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "first");
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("first", session, undefined);

    await enterSearch(result, "second");
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("second", session, undefined);
    resolveSecond?.([secondSuggestion]);
    await flushQueries();
    expect(result.current.suggestions).toEqual([secondSuggestion]);
    resolveFirst?.([firstSuggestion]);
    await flushQueries();
    expect(result.current.suggestions).toEqual([secondSuggestion]);
  });

  it("resolves a selected suggestion once and ends its session", async () => {
    let resolveName: ((value: string) => void) | undefined;
    vi.mocked(resolvePlaceSuggestionName).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveName = resolve;
        })
    );
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "selection" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);

    let first: Promise<string> | undefined;
    let second: Promise<string> | undefined;
    act(() => {
      first = result.current.selectSuggestion(firstSuggestion);
      second = result.current.selectSuggestion(firstSuggestion);
    });
    await flushQueries();
    expect(result.current.isSelecting).toBe(true);
    expect(resolvePlaceSuggestionName).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveName?.("Resolved Coffee");
    await expect(first).resolves.toBe("Resolved Coffee");
    await flushQueries();
    expect(result.current.isSelecting).toBe(false);
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(session);
  });

  it("ignores input changes while a selection is still pending", async () => {
    let resolveName: ((value: string) => void) | undefined;
    vi.mocked(resolvePlaceSuggestionName).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveName = resolve;
        })
    );
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "selection-input-race" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();

    let selectionPromise: Promise<string> | undefined;
    act(() => {
      selectionPromise = result.current.selectSuggestion(firstSuggestion);
    });
    await flushQueries();
    expect(result.current.isSelecting).toBe(true);

    act(() => result.current.setInput("tea"));
    expect(result.current.input).toBe("");
    expect(result.current.isSelecting).toBe(true);

    resolveName?.("Coffee House");
    await expect(selectionPromise).resolves.toBe("Coffee House");
    await flushQueries();
    act(() => result.current.setInput("tea"));
    expect(result.current.input).toBe("tea");
  });

  it("keeps query errors separate from a failed selection and lets the user tap again", async () => {
    vi.mocked(resolvePlaceSuggestionName)
      .mockRejectedValueOnce(new Error("selection unavailable"))
      .mockResolvedValueOnce("Coffee House");
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "selection-retry" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();
    await enterSearch(result, "coffee");
    await flushQueries();

    let firstAttempt: Promise<string> | undefined;
    act(() => {
      firstAttempt = result.current.selectSuggestion(firstSuggestion);
    });
    await expect(firstAttempt).rejects.toThrow("selection unavailable");
    await flushQueries();
    expect(result.current.isError).toBe(false);
    expect(result.current.selectionError).toMatchObject({ message: "selection unavailable" });

    await expect(result.current.selectSuggestion(firstSuggestion)).resolves.toBe("Coffee House");
    await flushQueries();
    expect(resolvePlaceSuggestionName).toHaveBeenCalledTimes(2);
    expect(result.current.selectionError).toBeNull();
  });

  it("clears a selection error when the user changes the query", async () => {
    vi.mocked(resolvePlaceSuggestionName).mockRejectedValueOnce(
      new Error("selection unavailable")
    );
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "selection-input" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();

    await expect(result.current.selectSuggestion(firstSuggestion)).rejects.toThrow(
      "selection unavailable"
    );
    await flushQueries();
    expect(result.current.selectionError).toMatchObject({ message: "selection unavailable" });

    act(() => result.current.setInput("coffee"));
    expect(result.current.selectionError).toBeNull();
  });

  it("retries failed session creation without clearing the typed input", async () => {
    vi.mocked(createPlaceAutocompleteSession)
      .mockRejectedValueOnce(new Error("session unavailable"))
      .mockResolvedValueOnce(session);
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "retry-session" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();
    expect(result.current.isError).toBe(true);
    act(() => result.current.setInput("coffee"));
    let retryResult: unknown;
    await act(async () => {
      retryResult = await result.current.retry();
    });
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(2);
    expect(retryResult).toBeUndefined();
    expect(result.current.input).toBe("coffee");
  });

  it("retries a failed suggestion query without clearing the typed input", async () => {
    vi.mocked(searchPlaceSuggestions)
      .mockRejectedValueOnce(new Error("suggestion unavailable"))
      .mockResolvedValueOnce([firstSuggestion]);
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "retry-suggestions" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(result.current.isError).toBe(true);
    await act(async () => result.current.retry());
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);
    expect(result.current.input).toBe("coffee");
  });

  it("hides an unresolved stale suggestion request after the input becomes too short", async () => {
    let rejectSearch: ((reason: Error) => void) | undefined;
    vi.mocked(searchPlaceSuggestions).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSearch = reject;
        })
    );
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "short-input" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(result.current.isLoading).toBe(true);

    act(() => result.current.setInput("c"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);

    rejectSearch?.(new Error("stale search error"));
    await flushQueries();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("ends a deferred provider session and clears its caches after unmount", async () => {
    const deferredSession = { token: {} as GoogleAutocompleteSessionToken };
    let resolveSession: ((value: typeof deferredSession) => void) | undefined;
    vi.mocked(createPlaceAutocompleteSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        })
    );
    const { Wrapper, queryClient } = createTestHarness();
    const { unmount } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "deferred-unmount" }),
      { wrapper: Wrapper }
    );
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);

    unmount();
    resolveSession?.(deferredSession);
    await flushQueries();
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(deferredSession);
    expect(
      queryClient.getQueryData(["placeAutocompleteSession", "deferred-unmount"])
    ).toBeUndefined();
  });

  it("ends a newly resolved session when unmounted before its passive registration effect", async () => {
    const deferredSession = { token: {} as GoogleAutocompleteSessionToken };
    let resolveSession: ((value: typeof deferredSession) => void) | undefined;
    vi.mocked(createPlaceAutocompleteSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        })
    );
    const { unmount } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "sync-registration" }),
      { wrapper: createWrapper() }
    );
    await flushQueries();

    resolveSession?.(deferredSession);
    await Promise.resolve();
    unmount();
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(deferredSession);
  });

  it("ends a deferred session when autocomplete is disabled before creation resolves", async () => {
    const deferredSession = { token: {} as GoogleAutocompleteSessionToken };
    let resolveSession: ((value: typeof deferredSession) => void) | undefined;
    vi.mocked(createPlaceAutocompleteSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        })
    );
    const { rerender } = renderHook(
      ({ enabled }) =>
        usePlaceAutocomplete({ open: true, enabled, sessionId: "disabled-before-create" }),
      { initialProps: { enabled: true }, wrapper: createWrapper() }
    );
    await flushQueries();

    rerender({ enabled: false });
    resolveSession?.(deferredSession);
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(deferredSession);
  });

  it("cleans up old session caches on close and creates a distinct token for a new session", async () => {
    const firstSession = { token: {} as GoogleAutocompleteSessionToken };
    const secondSession = { token: {} as GoogleAutocompleteSessionToken };
    vi.mocked(createPlaceAutocompleteSession)
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const { Wrapper, queryClient } = createTestHarness();
    const { result, rerender } = renderHook(
      ({ open, sessionId }) => usePlaceAutocomplete({ open, enabled: true, sessionId }),
      { initialProps: { open: true, sessionId: "first" }, wrapper: Wrapper }
    );
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(queryClient.getQueryData(["placeAutocompleteSession", "first"])).toBe(
      firstSession
    );
    expect(
      queryClient.getQueryData(["placeAutocomplete", "first", "suggestions", "coffee"])
    ).toEqual([firstSuggestion]);

    rerender({ open: false, sessionId: "first" });
    await flushQueries();
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
    expect(result.current.input).toBe("");
    expect(result.current.suggestions).toEqual([]);
    expect(queryClient.getQueryData(["placeAutocompleteSession", "first"])).toBeUndefined();
    expect(
      queryClient.getQueryData(["placeAutocomplete", "first", "suggestions", "coffee"])
    ).toBeUndefined();

    rerender({ open: true, sessionId: "second" });
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(["placeAutocompleteSession", "second"])).toBe(
      secondSession
    );
  });

  it("keeps a usable session through the Strict Mode effect probe and cleans its queries on real unmount", async () => {
    const strictSession = { token: {} as GoogleAutocompleteSessionToken };
    vi.mocked(createPlaceAutocompleteSession).mockResolvedValue(strictSession);
    const { Wrapper, queryClient } = createTestHarness();
    const { result, unmount } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "strict-mode" }),
      { wrapper: Wrapper, reactStrictMode: true }
    );

    await flushQueries();
    expect(queryClient.getQueryData(["placeAutocompleteSession", "strict-mode"])).toBe(
      strictSession
    );
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);

    unmount();
    await flushQueries();
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(strictSession);
    expect(queryClient.getQueryData(["placeAutocompleteSession", "strict-mode"])).toBeUndefined();
    expect(
      queryClient.getQueryData(["placeAutocomplete", "strict-mode", "suggestions", "coffee"])
    ).toBeUndefined();
  });
});
