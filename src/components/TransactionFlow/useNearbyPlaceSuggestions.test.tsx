import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentCoordinates,
  getNearbyPlaceNames,
  hasGoogleMapsApiKey,
} from "../../lib/googlePlaces";
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";

vi.mock("../../lib/googlePlaces", () => ({
  getCurrentCoordinates: vi.fn(),
  getNearbyPlaceNames: vi.fn(),
  hasGoogleMapsApiKey: vi.fn(),
}));

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
      () => useNearbyPlaceSuggestions({ enabled: false, sessionId: 1 }),
      { wrapper: createWrapper() }
    );

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(getCurrentCoordinates).not.toHaveBeenCalled();
    expect(getNearbyPlaceNames).not.toHaveBeenCalled();
  });

  it("returns nearby place names when enabled", async () => {
    vi.mocked(getCurrentCoordinates).mockResolvedValue({
      lat: 13.7563,
      lng: 100.5018,
    });
    vi.mocked(getNearbyPlaceNames).mockResolvedValue(["Starbucks", "7-Eleven"]);

    const { result } = renderHook(
      () => useNearbyPlaceSuggestions({ enabled: true, sessionId: 2 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(["Starbucks", "7-Eleven"]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.shouldShowAttribution).toBe(true);
  });

  it("fails closed when geolocation or places rejects", async () => {
    vi.mocked(getCurrentCoordinates).mockRejectedValue(new Error("denied"));

    const { result } = renderHook(
      () => useNearbyPlaceSuggestions({ enabled: true, sessionId: 3 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.shouldShowAttribution).toBe(false);
  });

  it("does not request location when the Google Maps API key is missing", async () => {
    vi.mocked(hasGoogleMapsApiKey).mockReturnValue(false);

    const { result } = renderHook(
      () => useNearbyPlaceSuggestions({ enabled: true, sessionId: 4 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.shouldShowAttribution).toBe(false);
    expect(getCurrentCoordinates).not.toHaveBeenCalled();
    expect(getNearbyPlaceNames).not.toHaveBeenCalled();
  });
});
