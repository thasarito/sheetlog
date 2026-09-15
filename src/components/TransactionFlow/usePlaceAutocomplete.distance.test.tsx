import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Coordinates,
  createPlaceAutocompleteSession,
  searchPlaceSuggestions,
} from "../../lib/googlePlaces";
import { placeAutocompleteKeys, usePlaceAutocomplete } from "./usePlaceAutocomplete";

vi.mock("../../lib/googlePlaces", () => ({
  createPlaceAutocompleteSession: vi.fn(),
  endPlaceAutocompleteSession: vi.fn(),
  searchPlaceSuggestions: vi.fn(),
  resolvePlaceSuggestionName: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createPlaceAutocompleteSession).mockResolvedValue({ token: {} });
  vi.mocked(searchPlaceSuggestions).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("autocomplete distance origin", () => {
  it("uses coordinate values in cache keys while preserving the session cleanup prefix", () => {
    const first = { lat: 13.7563, lng: 100.5018 };
    const second = { lat: 13.8, lng: 100.6 };
    const key = placeAutocompleteKeys.suggestions("session", "cafe", first);
    expect(key).toEqual(placeAutocompleteKeys.suggestions("session", "cafe", { ...first }));
    expect(key).not.toEqual(placeAutocompleteKeys.suggestions("session", "cafe", second));
    expect(key).not.toEqual(placeAutocompleteKeys.suggestions("session", "cafe"));
    expect(key.slice(0, 3)).toEqual(placeAutocompleteKeys.suggestionsForSession("session"));
  });

  it("refetches the same text when location arrives or changes without recreating its session", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { rerender } = renderHook(
      ({ locationBias }: { locationBias?: Coordinates }) => usePlaceAutocomplete({
        value: "cafe", active: true, enabled: true, sessionId: "distance-test", locationBias,
      }),
      { wrapper, initialProps: { locationBias: undefined as Coordinates | undefined } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchPlaceSuggestions).toHaveBeenCalledTimes(1);
    expect(searchPlaceSuggestions).toHaveBeenLastCalledWith("cafe", expect.any(Object), undefined);

    const first = { lat: 13.7563, lng: 100.5018 };
    rerender({ locationBias: first });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(searchPlaceSuggestions).toHaveBeenCalledTimes(2);
    expect(searchPlaceSuggestions).toHaveBeenLastCalledWith("cafe", expect.any(Object), first);

    const second = { lat: 13.8, lng: 100.6 };
    rerender({ locationBias: second });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(searchPlaceSuggestions).toHaveBeenCalledTimes(3);
    expect(searchPlaceSuggestions).toHaveBeenLastCalledWith("cafe", expect.any(Object), second);
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
  });
});
