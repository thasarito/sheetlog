import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentCoordinates,
  getNearbyPlaces,
  hasGoogleMapsApiKey,
} from "../../lib/googlePlaces";
import {
  nearbyPlaceSuggestionKeys,
  useNearbyPlaceSuggestions,
} from "./useNearbyPlaceSuggestions";

vi.mock("../../lib/googlePlaces", () => ({
  getCurrentCoordinates: vi.fn(),
  getNearbyPlaces: vi.fn(),
  hasGoogleMapsApiKey: vi.fn(),
}));

const coordinates = { lat: 13.7563, lng: 100.5018 };
const suggestions = [
  {
    placeId: "place-1",
    name: "Starbucks",
    secondaryText: "Bangkok",
  },
];
const sessionIds = {
  disabled: "0198b949-5f77-7d98-a53a-bce26d004a2a",
  missingKey: "0198b949-5f77-7d98-a53a-bce26d004a2b",
  offline: "0198b949-5f77-7d98-a53a-bce26d004a2c",
  success: "0198b949-5f77-7d98-a53a-bce26d004a2d",
  geolocationFailure: "0198b949-5f77-7d98-a53a-bce26d004a2e",
  placesFailure: "0198b949-5f77-7d98-a53a-bce26d004a2f",
  oneLookup: "0198b949-5f77-7d98-a53a-bce26d004a30",
  lifecycleA: "0198b949-5f77-7d98-a53a-bce26d004a31",
  lifecycleB: "0198b949-5f77-7d98-a53a-bce26d004a32",
  lifecycleC: "0198b949-5f77-7d98-a53a-bce26d004a33",
  deferred: "0198b949-5f77-7d98-a53a-bce26d004a34",
  disabledAfterSuccess: "0198b949-5f77-7d98-a53a-bce26d004a35",
  deferredGeolocation: "0198b949-5f77-7d98-a53a-bce26d004a36",
  deferredPlaces: "0198b949-5f77-7d98-a53a-bce26d004a37",
};

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return {
    queryClient,
    wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    },
  };
}

function createWrapper() {
  return createHarness().wrapper;
}

describe("useNearbyPlaceSuggestions", () => {
  beforeEach(() => {
    vi.mocked(hasGoogleMapsApiKey).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not query when disabled", () => {
    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: false,
          isOnline: true,
          sessionId: sessionIds.disabled,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canSearch).toBe(false);
    expect(getCurrentCoordinates).not.toHaveBeenCalled();
    expect(getNearbyPlaces).not.toHaveBeenCalled();
  });

  it("does not query when the Google Maps API key is missing", () => {
    vi.mocked(hasGoogleMapsApiKey).mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.missingKey,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.canSearch).toBe(false);
    expect(getCurrentCoordinates).not.toHaveBeenCalled();
    expect(getNearbyPlaces).not.toHaveBeenCalled();
  });

  it("does not query while offline", () => {
    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: false,
          sessionId: sessionIds.offline,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.canSearch).toBe(false);
    expect(getCurrentCoordinates).not.toHaveBeenCalled();
    expect(getNearbyPlaces).not.toHaveBeenCalled();
  });

  it("returns structured nearby places and coordinates", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    vi.mocked(getNearbyPlaces).mockResolvedValue(suggestions);

    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.success,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(suggestions);
    });
    expect(result.current.coordinates).toEqual(coordinates);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canSearch).toBe(true);
    expect(getNearbyPlaces).toHaveBeenCalledWith(coordinates);
  });

  it("returns no nearby result when geolocation fails", async () => {
    vi.mocked(getCurrentCoordinates).mockRejectedValue(new Error("denied"));

    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.geolocationFailure,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current).toMatchObject({ coordinates: undefined });
    expect(result.current.canSearch).toBe(true);
    expect(getNearbyPlaces).not.toHaveBeenCalled();
  });

  it("retains coordinates when nearby Places fails", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    vi.mocked(getNearbyPlaces).mockRejectedValue(new Error("unavailable"));

    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.placesFailure,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.coordinates).toEqual(coordinates);
    expect(result.current.canSearch).toBe(true);
  });

  it("uses one lookup for a session across rerender, focus, and reconnect", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    vi.mocked(getNearbyPlaces).mockResolvedValue(suggestions);

    const { result, rerender } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.oneLookup,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(suggestions);
    });

    rerender();
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(getCurrentCoordinates).toHaveBeenCalledTimes(1);
    expect(getNearbyPlaces).toHaveBeenCalledTimes(1);
  });

  it("uses separate cache entries for each session lifecycle", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    vi.mocked(getNearbyPlaces).mockResolvedValue(suggestions);
    const wrapper = createWrapper();
    const { result, rerender, unmount } = renderHook(
      ({ sessionId }) =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId,
        }),
      {
        initialProps: { sessionId: sessionIds.lifecycleA },
        wrapper,
      }
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(suggestions);
    });
    expect(getCurrentCoordinates).toHaveBeenCalledTimes(1);

    rerender({ sessionId: sessionIds.lifecycleB });
    await waitFor(() => {
      expect(getCurrentCoordinates).toHaveBeenCalledTimes(2);
    });

    unmount();
    const remounted = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.lifecycleC,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(remounted.result.current.suggestions).toEqual(suggestions);
      expect(getCurrentCoordinates).toHaveBeenCalledTimes(3);
    });
    expect(getNearbyPlaces).toHaveBeenCalledTimes(3);
  });

  it("changes isLoading from true to false when a nearby request resolves", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    let resolveNearbyPlaces: ((value: typeof suggestions) => void) | undefined;
    vi.mocked(getNearbyPlaces).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNearbyPlaces = resolve;
        })
    );

    const { result } = renderHook(
      () =>
        useNearbyPlaceSuggestions({
          enabled: true,
          isOnline: true,
          sessionId: sessionIds.deferred,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    if (!resolveNearbyPlaces) {
      throw new Error("Nearby Places request did not start");
    }
    resolveNearbyPlaces(suggestions);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual(suggestions);
  });

  it("clears coordinates, suggestions, and the session cache when disabled", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    vi.mocked(getNearbyPlaces).mockResolvedValue(suggestions);
    const { queryClient, wrapper } = createHarness();
    const queryKey = nearbyPlaceSuggestionKeys.session(
      sessionIds.disabledAfterSuccess,
    );
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useNearbyPlaceSuggestions({
          enabled,
          isOnline: true,
          sessionId: sessionIds.disabledAfterSuccess,
        }),
      { initialProps: { enabled: true }, wrapper },
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(suggestions);
    });
    expect(queryClient.getQueryData(queryKey)).toEqual({
      coordinates,
      suggestions,
    });

    rerender({ enabled: false });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.coordinates).toBeUndefined();
    await waitFor(() => {
      expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    });
  });

  it("does not start Places or cache coordinates when disabled during geolocation", async () => {
    let resolveCoordinates: ((value: typeof coordinates) => void) | undefined;
    vi.mocked(getCurrentCoordinates).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCoordinates = resolve;
        }),
    );
    vi.mocked(getNearbyPlaces).mockResolvedValue(suggestions);
    const { queryClient, wrapper } = createHarness();
    const queryKey = nearbyPlaceSuggestionKeys.session(
      sessionIds.deferredGeolocation,
    );
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useNearbyPlaceSuggestions({
          enabled,
          isOnline: true,
          sessionId: sessionIds.deferredGeolocation,
        }),
      { initialProps: { enabled: true }, wrapper },
    );

    await waitFor(() => {
      expect(getCurrentCoordinates).toHaveBeenCalledTimes(1);
    });
    rerender({ enabled: false });
    if (!resolveCoordinates) {
      throw new Error("Geolocation request did not start");
    }
    const finishGeolocation = resolveCoordinates;
    await act(async () => {
      finishGeolocation(coordinates);
      await Promise.resolve();
    });

    expect(getNearbyPlaces).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.coordinates).toBeUndefined();
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });

  it("does not cache a Places result that completes after the session closes", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue(coordinates);
    let resolveNearbyPlaces: ((value: typeof suggestions) => void) | undefined;
    vi.mocked(getNearbyPlaces).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNearbyPlaces = resolve;
        }),
    );
    const { queryClient, wrapper } = createHarness();
    const queryKey = nearbyPlaceSuggestionKeys.session(sessionIds.deferredPlaces);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useNearbyPlaceSuggestions({
          enabled,
          isOnline: true,
          sessionId: sessionIds.deferredPlaces,
        }),
      { initialProps: { enabled: true }, wrapper },
    );

    await waitFor(() => {
      expect(getNearbyPlaces).toHaveBeenCalledTimes(1);
    });
    rerender({ enabled: false });
    if (!resolveNearbyPlaces) {
      throw new Error("Nearby Places request did not start");
    }
    const finishNearbyPlaces = resolveNearbyPlaces;
    await act(async () => {
      finishNearbyPlaces(suggestions);
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.coordinates).toBeUndefined();
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });
});
