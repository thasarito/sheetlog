import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNearbyPlaces } from "../../lib/googlePlaces";
import {
  nearbyPlaceSuggestionKeys,
  useNearbyPlaceSuggestions,
} from "./useNearbyPlaceSuggestions";

// Keep the real permission/geolocation boundary; only avoid Google network calls.
vi.mock("../../lib/googlePlaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/googlePlaces")>();
  return {
    ...actual,
    hasGoogleMapsApiKey: () => true,
    getNearbyPlaces: vi.fn(),
  };
});

const coordinates = { lat: 13.7563, lng: 100.5018 };
const position = {
  coords: { latitude: coordinates.lat, longitude: coordinates.lng },
} as GeolocationPosition;
const suggestions = [{ placeId: "cafe", name: "Cafe" }];
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
const clients: QueryClient[] = [];
let permissionState: PermissionState;
const getCurrentPosition = vi.fn(
  (success: PositionCallback, _error?: PositionErrorCallback) => success(position),
);

function mountNearby() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(queryClient);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    (props) => useNearbyPlaceSuggestions(props),
    {
      wrapper,
      initialProps: { enabled: true, isOnline: true, sessionId: "transaction-1" },
    },
  );
  return { ...hook, queryClient };
}

describe("nearby-place permission lifecycle", () => {
  beforeEach(() => {
    permissionState = "prompt";
    getCurrentPosition.mockReset().mockImplementation((success) => success(position));
    vi.mocked(getNearbyPlaces).mockReset().mockResolvedValue(suggestions);
    Object.defineProperties(navigator, {
      geolocation: { configurable: true, value: { getCurrentPosition } },
      permissions: {
        configurable: true,
        value: { query: async () => ({ state: permissionState }) },
      },
    });
  });

  afterEach(() => {
    cleanup();
    for (const client of clients.splice(0)) client.clear();
    for (const [key, descriptor] of [
      ["geolocation", originalGeolocation],
      ["permissions", originalPermissions],
    ] as const) {
      if (descriptor) Object.defineProperty(navigator, key, descriptor);
      else Reflect.deleteProperty(navigator, key);
    }
  });

  it("offers opt-in without opening a native prompt on transaction entry", async () => {
    const { result } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    expect(result.current.canSearch).toBe(true);
    expect(result.current.suggestions).toEqual([]);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(getNearbyPlaces).not.toHaveBeenCalled();

    act(() => result.current.requestLocation());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.suggestions).toEqual(suggestions));
    expect(result.current.coordinates).toEqual(coordinates);
  });

  it("stops automatic native requests after permission expires across sessions", async () => {
    permissionState = "granted";
    const { result, rerender } = mountNearby();
    await waitFor(() => expect(result.current.suggestions).toEqual(suggestions));
    permissionState = "prompt";

    for (const sessionId of ["transaction-2", "transaction-3"]) {
      rerender({ enabled: true, isOnline: true, sessionId });
      await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
      expect(result.current.suggestions).toEqual([]);
    }
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getNearbyPlaces).toHaveBeenCalledTimes(1);
  });

  it("requires a new tap after an explicit lookup and a later automatic refetch", async () => {
    const { result, queryClient } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.suggestions).toEqual(suggestions));

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: nearbyPlaceSuggestionKeys.all });
    });
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not request twice on rapid repeated taps", async () => {
    let finish: PositionCallback | undefined;
    getCurrentPosition.mockImplementation((success) => { finish = success; });
    const { result } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));

    act(() => {
      result.current.requestLocation();
      result.current.requestLocation();
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.(position); });
    await waitFor(() => expect(result.current.suggestions).toEqual(suggestions));
  });

  it("supports explicit opt-in when the Permissions API is missing", async () => {
    Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    const { result } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.suggestions).toEqual(suggestions));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not retain a late explicit location result after leaving the flow", async () => {
    let finish: PositionCallback | undefined;
    getCurrentPosition.mockImplementation((success) => { finish = success; });
    const { result, rerender, queryClient } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    act(() => result.current.requestLocation());
    rerender({ enabled: false, isOnline: true, sessionId: "transaction-1" });

    await act(async () => { finish?.(position); });
    expect(getNearbyPlaces).not.toHaveBeenCalled();
    expect(result.current.coordinates).toBeUndefined();
    expect(queryClient.getQueryData(nearbyPlaceSuggestionKeys.session("transaction-1"))).toBeUndefined();
  });

  it("does not request location from a disabled flow or a stale unmounted handler", async () => {
    const { result, rerender, unmount } = mountNearby();
    await waitFor(() => expect(result.current.canRequestLocation).toBe(true));
    const staleRequest = result.current.requestLocation;
    rerender({ enabled: false, isOnline: true, sessionId: "transaction-1" });
    act(() => result.current.requestLocation());
    unmount();
    staleRequest();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
