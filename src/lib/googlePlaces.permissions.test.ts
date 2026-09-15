import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentCoordinates } from "./googlePlaces";

const coordinates = { lat: 13.7563, lng: 100.5018 };
const position = {
  coords: { latitude: coordinates.lat, longitude: coordinates.lng },
} as GeolocationPosition;
const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);
const originalPermissions = Object.getOwnPropertyDescriptor(
  navigator,
  "permissions",
);
let permissionState: PermissionState;
const query = vi.fn(async () => ({ state: permissionState }));
const getCurrentPosition = vi.fn(
  (success: PositionCallback, _error?: PositionErrorCallback) => success(position),
);

function setPermissions(value: unknown) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value,
  });
}

describe("getCurrentCoordinates permission policy", () => {
  beforeEach(() => {
    permissionState = "prompt";
    query.mockReset().mockImplementation(async () => ({ state: permissionState }));
    getCurrentPosition.mockReset().mockImplementation((success) => success(position));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    setPermissions({ query });
  });

  afterEach(() => {
    for (const [key, descriptor] of [
      ["geolocation", originalGeolocation],
      ["permissions", originalPermissions],
    ] as const) {
      if (descriptor) Object.defineProperty(navigator, key, descriptor);
      else Reflect.deleteProperty(navigator, key);
    }
  });

  it.each(["prompt", "denied"] as const)(
    "does not automatically request location when permission is %s",
    async (state) => {
      permissionState = state;
      await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow(
        "Location permission requires a user action",
      );
      expect(getCurrentPosition).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the Permissions API is unavailable", async () => {
    setPermissions(undefined);
    await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("fails closed when querying geolocation permission is unsupported", async () => {
    query.mockRejectedValueOnce(new TypeError("Unsupported permission"));
    await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("automatically retrieves coordinates when permission is currently granted", async () => {
    permissionState = "granted";
    await expect(getCurrentCoordinates({ allowPrompt: false })).resolves.toEqual(
      coordinates,
    );
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a grant after it expires between transactions", async () => {
    permissionState = "granted";
    await getCurrentCoordinates({ allowPrompt: false });
    permissionState = "prompt";

    for (let transaction = 0; transaction < 3; transaction += 1) {
      await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow();
    }
    expect(query).toHaveBeenCalledTimes(4);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("starts an explicit request synchronously within the user's click", async () => {
    const request = getCurrentCoordinates({ allowPrompt: true });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    await expect(request).resolves.toEqual(coordinates);
  });

  it("allows explicit requests without the Permissions API", async () => {
    setPermissions(undefined);
    await expect(getCurrentCoordinates({ allowPrompt: true })).resolves.toEqual(
      coordinates,
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not turn an explicit request into permanent automatic consent", async () => {
    await getCurrentCoordinates({ allowPrompt: true });
    // Some browsers still report prompt after a successful one-time request.
    await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("preserves native geolocation errors", async () => {
    permissionState = "granted";
    const error = { code: 3, message: "Timed out" } as GeolocationPositionError;
    getCurrentPosition.mockImplementationOnce((_success, onError) => onError?.(error));
    await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toBe(error);
  });

  it("rejects when geolocation itself is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    await expect(getCurrentCoordinates({ allowPrompt: false })).rejects.toThrow(
      "Geolocation is not available",
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("preserves the existing interactive helper behavior", async () => {
    await expect(getCurrentCoordinates()).resolves.toEqual(coordinates);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
