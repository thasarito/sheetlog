import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentCoordinates,
  getNearbyPlaces,
  hasGoogleMapsApiKey,
} from "../../lib/googlePlaces";
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
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
          sessionId: 1,
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
          sessionId: 2,
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
          sessionId: 3,
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
          sessionId: 4,
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
          sessionId: 5,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.coordinates).toBeUndefined();
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
          sessionId: 6,
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
          sessionId: 7,
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
});
