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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
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

  it("does not search or expose cached suggestions below two trimmed characters", async () => {
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "threshold" }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, " c ");

    expect(searchPlaceSuggestions).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
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

  it("keeps prior suggestions while a valid newer query loads and ignores an older response", async () => {
    let resolveOld: ((value: typeof firstSuggestion[]) => void) | undefined;
    let resolveNew: ((value: typeof secondSuggestion[]) => void) | undefined;
    vi.mocked(searchPlaceSuggestions).mockImplementation((input) => {
      return new Promise((resolve) => {
        if (input === "old") resolveOld = resolve;
        if (input === "new") resolveNew = resolve;
      });
    });
    const { result } = renderHook(
      () => usePlaceAutocomplete({ open: true, enabled: true, sessionId: "race" }),
      { wrapper: createWrapper() }
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "old");
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("old", session, undefined);
    resolveOld?.([firstSuggestion]);
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);

    await enterSearch(result, "new");
    expect(result.current.suggestions).toEqual([firstSuggestion]);
    await flushQueries();
    expect(searchPlaceSuggestions).toHaveBeenCalledWith("new", session, undefined);
    resolveNew?.([secondSuggestion]);
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
    await act(async () => result.current.retry());
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(2);
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

  it("cleans up the session and cached results when closed, then creates a new token", async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ open, sessionId }) => usePlaceAutocomplete({ open, enabled: true, sessionId }),
      { initialProps: { open: true, sessionId: "first" }, wrapper }
    );
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await enterSearch(result, "coffee");
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);

    rerender({ open: false, sessionId: "first" });
    await flushQueries();
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(session);
    expect(result.current.input).toBe("");
    expect(result.current.suggestions).toEqual([]);

    rerender({ open: true, sessionId: "second" });
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(2);
  });
});
