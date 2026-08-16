# Location Note Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nearby Google Places venue-name chips under the transaction note input so a user can tap a nearby place to fill or replace the note.

**Architecture:** Keep `StepAmount` presentational and opt-in. `TransactionFlow` enables a TanStack Query hook only for new transaction entry on the amount step, then passes suggestion props into `StepAmount`. A small `googlePlaces` library owns geolocation, Maps JavaScript loading, and `Place.searchNearby()`.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, TanStack Form, Vitest, Testing Library, Google Maps JavaScript API Places.

---

## File Structure

- Create `src/lib/googlePlaces.ts`: browser-only geolocation, Google Maps JavaScript script loading, Places library import, and nearby place-name search.
- Create `src/lib/googlePlaces.test.ts`: unit tests for geolocation options, missing API key behavior, Maps script loading, and `displayName` extraction.
- Create `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`: TanStack Query hook that runs geolocation plus Places lookup when enabled.
- Create `src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`: hook tests with a `QueryClientProvider`.
- Create `src/components/TransactionFlow/NearbyPlaceChips.tsx`: compact presentational chip rail plus Google attribution.
- Create `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`: component tests for loading, hidden, chip click, and accessibility labels.
- Modify `src/components/TransactionFlow/StepAmount.tsx`: add optional nearby-place props and render `NearbyPlaceChips` below the note input.
- Create `src/components/TransactionFlow/StepAmount.test.tsx`: integration tests proving chip taps replace the note and loading does not disable submit.
- Modify `src/components/TransactionFlow/index.tsx`: enable the hook only for new transaction amount-step sessions and pass props to `StepAmount`.
- Modify `vite.config.ts`: configure Vitest `jsdom` and setup file.
- Create `src/test/setup.ts`: register Testing Library jest-dom matchers.
- Modify `tsconfig.json`: include Vitest globals and jest-dom matcher types.
- Modify `vite-env.d.ts`: add `VITE_GOOGLE_MAPS_API_KEY`.
- Modify `global.d.ts`: replace the loose `window.google` type with the minimal Google Maps shape used by `googlePlaces.ts`.
- Modify `package.json` and `package-lock.json`: add React test dependencies.

## Task 1: Add Component Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install test dependencies**

Run:

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected:

- `package.json` gains these four dev dependencies.
- `package-lock.json` updates.
- No source files change.

- [ ] **Step 2: Configure Vitest for React component tests**

In `vite.config.ts`, add this reference at the top of the file:

```ts
/// <reference types="vitest/config" />
```

Then add a `test` block inside the returned config object:

```ts
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
    },
```

The returned config should keep the existing `base` and `plugins` settings.

- [ ] **Step 3: Register jest-dom matchers**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add Vitest and jest-dom types**

In `tsconfig.json`, replace the current `types` array:

```json
"types": ["vite/client", "vite-plugin-pwa/client"]
```

with:

```json
"types": [
  "vite/client",
  "vite-plugin-pwa/client",
  "vitest/globals",
  "@testing-library/jest-dom"
]
```

- [ ] **Step 5: Run the existing unit tests**

Run:

```bash
npm run test -- src/lib/date-utils.test.ts
```

Expected:

- PASS for `src/lib/date-utils.test.ts`.

- [ ] **Step 6: Commit test harness**

Run:

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json src/test/setup.ts
git commit -m "test: add react component test harness"
```

## Task 2: Add Google Places Browser Client

**Files:**
- Modify: `global.d.ts`
- Modify: `vite-env.d.ts`
- Create: `src/lib/googlePlaces.ts`
- Create: `src/lib/googlePlaces.test.ts`

- [ ] **Step 1: Write failing Google Places client tests**

Create `src/lib/googlePlaces.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEOLOCATION_OPTIONS,
  MissingGoogleMapsApiKeyError,
  getCurrentCoordinates,
  getNearbyPlaceNames,
  resetGooglePlacesLoaderForTests,
} from "./googlePlaces";

function installGeolocationMock(
  implementation: PositionCallback | PositionErrorCallback
) {
  const getCurrentPosition = vi.fn(
    (
      success: PositionCallback,
      error?: PositionErrorCallback,
      options?: PositionOptions
    ) => {
      if (implementation.length === 1) {
        (implementation as PositionCallback)({
          coords: { latitude: 13.7563, longitude: 100.5018 },
        } as GeolocationPosition);
        return;
      }
      (implementation as PositionErrorCallback)({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      error?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  return getCurrentPosition;
}

describe("getCurrentCoordinates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fast cached geolocation options", async () => {
    const getCurrentPosition = installGeolocationMock((position) => position);

    const result = await getCurrentCoordinates();

    expect(result).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      GEOLOCATION_OPTIONS
    );
  });

  it("rejects when geolocation is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });

    await expect(getCurrentCoordinates()).rejects.toThrow(
      "Geolocation is not available"
    );
  });
});

describe("getNearbyPlaceNames", () => {
  afterEach(() => {
    resetGooglePlacesLoaderForTests();
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    delete window.google;
  });

  it("throws a typed error when the API key is missing", async () => {
    await expect(
      getNearbyPlaceNames({ lat: 13.7563, lng: 100.5018 }, { apiKey: "" })
    ).rejects.toBeInstanceOf(MissingGoogleMapsApiKeyError);
  });

  it("requests only displayName and returns place names", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [
        { displayName: "Starbucks" },
        { displayName: { text: "7-Eleven" } },
        { displayName: "" },
      ],
    }));

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };

    const names = await getNearbyPlaceNames(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "test-key" }
    );

    expect(names).toEqual(["Starbucks", "7-Eleven"]);
    expect(searchNearby).toHaveBeenCalledWith({
      fields: ["displayName"],
      locationRestriction: {
        center: { lat: 13.7563, lng: 100.5018 },
        radius: 100,
      },
      maxResultCount: 5,
      rankPreference: "POPULARITY",
    });
  });

  it("loads the Maps JavaScript API when the importer is missing", async () => {
    const searchNearby = vi.fn(async () => ({
      places: [{ displayName: "Cafe Amazon" }],
    }));

    const promise = getNearbyPlaceNames(
      { lat: 13.7563, lng: 100.5018 },
      { apiKey: "browser-key" }
    );

    const script = document.getElementById("google-maps-js-api") as HTMLScriptElement;
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect(script.src).toContain("https://maps.googleapis.com/maps/api/js");
    expect(script.src).toContain("key=browser-key");
    expect(script.src).toContain("loading=async");
    expect(script.src).toContain("v=weekly");

    window.google = {
      maps: {
        importLibrary: vi.fn(async () => ({
          Place: { searchNearby },
          SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
        })),
      },
    };
    script.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toEqual(["Cafe Amazon"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/lib/googlePlaces.test.ts
```

Expected:

- FAIL because `src/lib/googlePlaces.ts` does not exist.

- [ ] **Step 3: Add minimal Google Maps types**

Replace `global.d.ts` with:

```ts
export {};

type GooglePlaceDisplayName = string | { text?: string };

type GoogleNearbyPlace = {
  displayName?: GooglePlaceDisplayName;
};

type GooglePlacesLibrary = {
  Place: {
    searchNearby: (request: {
      fields: string[];
      locationRestriction: {
        center: { lat: number; lng: number };
        radius: number;
      };
      maxResultCount: number;
      rankPreference: unknown;
    }) => Promise<{ places?: GoogleNearbyPlace[] }>;
  };
  SearchNearbyRankPreference: {
    POPULARITY: unknown;
    DISTANCE?: unknown;
  };
};

declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (
          library: "places"
        ) => Promise<GooglePlacesLibrary>;
      };
    };
  }
}
```

- [ ] **Step 4: Add the Google Maps env var type**

In `vite-env.d.ts`, add this line inside `ImportMetaEnv`:

```ts
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
```

- [ ] **Step 5: Implement the Google Places client**

Create `src/lib/googlePlaces.ts`:

```ts
export type Coordinates = {
  lat: number;
  lng: number;
};

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 2000,
  maximumAge: 60000,
};

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js-api";

let mapsScriptPromise: Promise<void> | null = null;

export class MissingGoogleMapsApiKeyError extends Error {
  constructor() {
    super("Missing VITE_GOOGLE_MAPS_API_KEY");
    this.name = "MissingGoogleMapsApiKeyError";
  }
}

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Geolocation is not available"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => reject(error),
      GEOLOCATION_OPTIONS
    );
  });
}

function getApiKey(explicitApiKey?: string) {
  const apiKey = explicitApiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new MissingGoogleMapsApiKeyError();
  }
  return apiKey;
}

function hasPlacesImporter() {
  return typeof window !== "undefined" && Boolean(window.google?.maps?.importLibrary);
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in a browser"));
  }

  if (hasPlacesImporter()) {
    return Promise.resolve();
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as
      | HTMLScriptElement
      | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&loading=async&v=weekly`;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

function normalizeDisplayName(displayName: unknown) {
  if (typeof displayName === "string") {
    return displayName.trim();
  }
  if (
    displayName &&
    typeof displayName === "object" &&
    "text" in displayName &&
    typeof displayName.text === "string"
  ) {
    return displayName.text.trim();
  }
  return "";
}

export async function getNearbyPlaceNames(
  coordinates: Coordinates,
  options: {
    apiKey?: string;
    radius?: number;
    maxResultCount?: number;
  } = {}
) {
  const apiKey = getApiKey(options.apiKey);
  await loadGoogleMapsScript(apiKey);

  const placesLibrary = await window.google?.maps?.importLibrary?.("places");
  if (!placesLibrary) {
    throw new Error("Google Places library is not available");
  }

  const { Place, SearchNearbyRankPreference } = placesLibrary;
  const response = await Place.searchNearby({
    fields: ["displayName"],
    locationRestriction: {
      center: coordinates,
      radius: options.radius ?? 100,
    },
    maxResultCount: options.maxResultCount ?? 5,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
  });

  const names = (response.places ?? [])
    .map((place) => normalizeDisplayName(place.displayName))
    .filter((name) => name.length > 0);

  return Array.from(new Set(names)).slice(0, options.maxResultCount ?? 5);
}

export function resetGooglePlacesLoaderForTests() {
  mapsScriptPromise = null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
npm run test -- src/lib/googlePlaces.test.ts
```

Expected:

- PASS for `getCurrentCoordinates`.
- PASS for `getNearbyPlaceNames`.

- [ ] **Step 7: Commit Google Places client**

Run:

```bash
git add global.d.ts vite-env.d.ts src/lib/googlePlaces.ts src/lib/googlePlaces.test.ts
git commit -m "feat: add google places browser client"
```

## Task 3: Add Nearby Place Suggestions Query Hook

**Files:**
- Create: `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`
- Create: `src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentCoordinates, getNearbyPlaceNames } from "../../lib/googlePlaces";
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";

vi.mock("../../lib/googlePlaces", () => ({
  getCurrentCoordinates: vi.fn(),
  getNearbyPlaceNames: vi.fn(),
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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useNearbyPlaceSuggestions", () => {
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
    vi.mocked(getCurrentCoordinates).mockResolvedValue({ lat: 13.7563, lng: 100.5018 });
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx
```

Expected:

- FAIL because `useNearbyPlaceSuggestions.ts` does not exist.

- [ ] **Step 3: Implement the query hook**

Create `src/components/TransactionFlow/useNearbyPlaceSuggestions.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getCurrentCoordinates, getNearbyPlaceNames } from "../../lib/googlePlaces";

export const nearbyPlaceSuggestionKeys = {
  all: ["nearbyPlaceSuggestions"] as const,
  session: (sessionId: number) =>
    [...nearbyPlaceSuggestionKeys.all, sessionId] as const,
};

export function useNearbyPlaceSuggestions({
  enabled,
  sessionId,
}: {
  enabled: boolean;
  sessionId: number;
}) {
  const query = useQuery({
    queryKey: nearbyPlaceSuggestionKeys.session(sessionId),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 1000 * 30,
    queryFn: async () => {
      const coordinates = await getCurrentCoordinates();
      return getNearbyPlaceNames(coordinates);
    },
  });

  const suggestions = query.data ?? [];

  return {
    suggestions,
    isLoading: enabled && (query.isLoading || query.isFetching),
    shouldShowAttribution: suggestions.length > 0,
  };
}
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
npm run test -- src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx
```

Expected:

- PASS for disabled state.
- PASS for successful suggestions.
- PASS for fail-closed errors.

- [ ] **Step 5: Commit hook**

Run:

```bash
git add src/components/TransactionFlow/useNearbyPlaceSuggestions.ts src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx
git commit -m "feat: add nearby place suggestions hook"
```

## Task 4: Add Nearby Place Chips UI

**Files:**
- Create: `src/components/TransactionFlow/NearbyPlaceChips.tsx`
- Create: `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`

- [ ] **Step 1: Write failing chip component tests**

Create `src/components/TransactionFlow/NearbyPlaceChips.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NearbyPlaceChips } from "./NearbyPlaceChips";

describe("NearbyPlaceChips", () => {
  it("renders nothing when not loading and no suggestions exist", () => {
    const { container } = render(
      <NearbyPlaceChips suggestions={[]} isLoading={false} onSelect={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a quiet loading state after 300 ms", async () => {
    vi.useFakeTimers();
    render(<NearbyPlaceChips suggestions={[]} isLoading onSelect={vi.fn()} />);

    expect(screen.queryByText("Finding places")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Nearby")).toBeInTheDocument();
    expect(screen.getByText("Finding places")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders place chips with attribution", () => {
    render(
      <NearbyPlaceChips
        suggestions={["Starbucks", "7-Eleven"]}
        isLoading={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Use Starbucks as note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use 7-Eleven as note" })).toBeInTheDocument();
    expect(screen.getByText("Powered by Google")).toBeInTheDocument();
  });

  it("calls onSelect when a chip is tapped", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <NearbyPlaceChips
        suggestions={["Terminal 21"]}
        isLoading={false}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole("button", { name: "Use Terminal 21 as note" }));

    expect(onSelect).toHaveBeenCalledWith("Terminal 21");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx
```

Expected:

- FAIL because `NearbyPlaceChips.tsx` does not exist.

- [ ] **Step 3: Implement the chip component**

Create `src/components/TransactionFlow/NearbyPlaceChips.tsx`:

```tsx
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

type NearbyPlaceChipsProps = {
  suggestions: string[];
  isLoading: boolean;
  onSelect: (placeName: string) => void;
};

export function NearbyPlaceChips({
  suggestions,
  isLoading,
  onSelect,
}: NearbyPlaceChipsProps) {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setShowLoading(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  if ((!isLoading || !showLoading) && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="min-h-[42px] pt-2" aria-live="polite">
      {isLoading && showLoading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium">Nearby</span>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Finding places</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((placeName) => (
              <button
                key={placeName}
                type="button"
                className="min-h-8 shrink-0 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Use ${placeName} as note`}
                onClick={() => onSelect(placeName)}
              >
                {placeName}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-medium text-muted-foreground/70">
            Powered by Google
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run chip tests**

Run:

```bash
npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx
```

Expected:

- PASS for hidden, loading, available, and click states.

- [ ] **Step 5: Commit chip UI**

Run:

```bash
git add src/components/TransactionFlow/NearbyPlaceChips.tsx src/components/TransactionFlow/NearbyPlaceChips.test.tsx
git commit -m "feat: add nearby place chips"
```

## Task 5: Wire Chips Into StepAmount

**Files:**
- Modify: `src/components/TransactionFlow/StepAmount.tsx`
- Create: `src/components/TransactionFlow/StepAmount.test.tsx`

- [ ] **Step 1: Write failing StepAmount tests**

Create `src/components/TransactionFlow/StepAmount.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepAmount } from "./StepAmount";
import { useTransactionForm } from "./useTransactionForm";

function StepAmountHarness({
  suggestions = [],
  isLoading = false,
  initialNote = "",
  onSubmit = vi.fn(),
}: {
  suggestions?: string[];
  isLoading?: boolean;
  initialNote?: string;
  onSubmit?: () => void;
}) {
  const form = useTransactionForm({
    initialValues: {
      category: "Coffee",
      amount: "125",
      currency: "THB",
      account: "Wallet",
      note: initialNote,
    },
  });

  return (
    <StepAmount
      form={form}
      accounts={["Wallet"]}
      onBack={vi.fn()}
      onSubmit={onSubmit}
      nearbyPlaceSuggestions={suggestions}
      isNearbyPlacesLoading={isLoading}
      onNearbyPlaceSelect={(placeName) => form.setFieldValue("note", placeName)}
    />
  );
}

describe("StepAmount nearby place suggestions", () => {
  it("replaces an empty note when a place chip is tapped", async () => {
    const user = userEvent.setup();

    render(<StepAmountHarness suggestions={["Starbucks"]} />);

    await user.click(screen.getByRole("button", { name: "Use Starbucks as note" }));

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Starbucks");
  });

  it("replaces an existing note when a place chip is tapped", async () => {
    const user = userEvent.setup();

    render(<StepAmountHarness suggestions={["Terminal 21"]} initialNote="Lunch" />);

    await user.click(screen.getByRole("button", { name: "Use Terminal 21 as note" }));

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Terminal 21");
  });

  it("does not disable submit while suggestions are loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<StepAmountHarness isLoading onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/components/TransactionFlow/StepAmount.test.tsx
```

Expected:

- FAIL because `StepAmount` does not accept the nearby-place props.

- [ ] **Step 3: Add nearby-place props to StepAmount**

In `src/components/TransactionFlow/StepAmount.tsx`, add the import:

```ts
import { NearbyPlaceChips } from "./NearbyPlaceChips";
```

Extend `StepAmountProps`:

```ts
  nearbyPlaceSuggestions?: string[];
  isNearbyPlacesLoading?: boolean;
  onNearbyPlaceSelect?: (placeName: string) => void;
```

Add defaults in the function parameters:

```ts
  nearbyPlaceSuggestions = [],
  isNearbyPlacesLoading = false,
  onNearbyPlaceSelect,
```

Add this constant after `selectedFor`:

```ts
  const shouldRenderNearbyPlaces =
    Boolean(onNearbyPlaceSelect) &&
    (isNearbyPlacesLoading || nearbyPlaceSuggestions.length > 0);
```

- [ ] **Step 4: Render chips below the note input**

In `StepAmount.tsx`, immediately after the closing `</div>` for the note input row, add:

```tsx
        {shouldRenderNearbyPlaces && onNearbyPlaceSelect ? (
          <NearbyPlaceChips
            suggestions={nearbyPlaceSuggestions}
            isLoading={isNearbyPlacesLoading}
            onSelect={onNearbyPlaceSelect}
          />
        ) : null}
```

The new chip block must be inside the upper flex content area, below the note row and above the transfer account warning/keypad.

- [ ] **Step 5: Run StepAmount tests**

Run:

```bash
npm run test -- src/components/TransactionFlow/StepAmount.test.tsx
```

Expected:

- PASS for empty note replacement.
- PASS for existing note replacement.
- PASS for submit while suggestion loading.

- [ ] **Step 6: Run chip tests again**

Run:

```bash
npm run test -- src/components/TransactionFlow/NearbyPlaceChips.test.tsx
```

Expected:

- PASS.

- [ ] **Step 7: Commit StepAmount wiring**

Run:

```bash
git add src/components/TransactionFlow/StepAmount.tsx src/components/TransactionFlow/StepAmount.test.tsx
git commit -m "feat: show nearby places in amount step"
```

## Task 6: Enable Suggestions From TransactionFlow

**Files:**
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Import the hook**

In `src/components/TransactionFlow/index.tsx`, add:

```ts
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";
```

- [ ] **Step 2: Add a create-flow suggestion session id**

Near the existing `step` state, add:

```ts
  const [placeSuggestionSessionId, setPlaceSuggestionSessionId] = useState(0);
```

Add this callback near `resetFlow`:

```ts
  const openCreateAmountStep = useCallback(() => {
    setPlaceSuggestionSessionId((current) => current + 1);
    setStep(1);
  }, []);
```

- [ ] **Step 3: Enable the query only for new transaction amount entry**

After the `form.useStore` destructuring and before effects, add:

```ts
  const shouldFetchNearbyPlaces = step === 1 && editingTransaction === null;
  const nearbyPlaces = useNearbyPlaceSuggestions({
    enabled: shouldFetchNearbyPlaces,
    sessionId: placeSuggestionSessionId,
  });
```

This intentionally disables suggestions when editing an existing transaction and when `StepAmount` is reused by Quick Note setup.

- [ ] **Step 4: Use the session-opening callback from the category step**

Replace:

```tsx
          onConfirm={() => setStep(1)}
```

with:

```tsx
          onConfirm={openCreateAmountStep}
```

- [ ] **Step 5: Pass suggestion props into StepAmount**

In the `StepAmount` render inside `steps`, add these props:

```tsx
          nearbyPlaceSuggestions={
            shouldFetchNearbyPlaces ? nearbyPlaces.suggestions : []
          }
          isNearbyPlacesLoading={
            shouldFetchNearbyPlaces ? nearbyPlaces.isLoading : false
          }
          onNearbyPlaceSelect={
            shouldFetchNearbyPlaces
              ? (placeName) => form.setFieldValue("note", placeName)
              : undefined
          }
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test -- src/components/TransactionFlow/useNearbyPlaceSuggestions.test.tsx src/components/TransactionFlow/StepAmount.test.tsx
```

Expected:

- PASS for the hook tests.
- PASS for the amount-step tests.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected:

- PASS with no TypeScript errors.

- [ ] **Step 8: Commit TransactionFlow integration**

Run:

```bash
git add src/components/TransactionFlow/index.tsx
git commit -m "feat: enable nearby places for new transactions"
```

## Task 7: Final Verification And Manual Checks

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full unit test suite**

Run:

```bash
npm run test
```

Expected:

- PASS for existing date utility tests.
- PASS for Google Places tests.
- PASS for hook tests.
- PASS for chip and StepAmount tests.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected:

- PASS with no Biome errors.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected:

- PASS with no TypeScript errors.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected:

- PASS and Vite writes `dist`.

- [ ] **Step 5: Manual browser verification**

Run:

```bash
npm run dev -- --host 0.0.0.0
```

Open the dev URL and verify:

- Starting a new Money transaction and entering the amount step prompts for location.
- If permission is granted and `VITE_GOOGLE_MAPS_API_KEY` is configured, nearby chips appear under the note input with `Powered by Google`.
- Tapping a chip fills an empty note.
- Tapping a chip replaces a typed note.
- Submit remains enabled while chips load.
- Denying permission leaves the note input and submit flow usable.
- Editing an existing transaction does not request location.
- Quick Note setup does not request location.

- [ ] **Step 6: Inspect final repository state**

Run:

```bash
git status --short
```

Expected:

- No uncommitted source, test, config, package, or lockfile changes remain.

## Self-Review

Spec coverage:

- Nearby place-name suggestions: Tasks 2, 3, 4, 5, and 6.
- Client-side Google Maps JavaScript Places: Task 2.
- Automatic location request on new amount step: Tasks 3 and 6.
- Chips under note input: Tasks 4 and 5.
- Chip tap replaces note: Task 5.
- No auto-fill: Tasks 4 and 5.
- Quick Note opt-out: Tasks 5 and 6.
- Minimal `displayName` fields, 100 meter radius, and 5 results: Task 2.
- API key env var and typed config: Task 2.
- Fail-closed error behavior: Tasks 2 and 3.
- No submit blocking: Task 5 and Task 7.
- Google attribution: Task 4.
- Testing and manual verification: Tasks 1 through 7.

Placeholder scan:

- No incomplete marker, incomplete path, or underspecified implementation instruction remains.

Type consistency:

- `getCurrentCoordinates`, `getNearbyPlaceNames`, and `useNearbyPlaceSuggestions` names are consistent across tests, implementation, and integration steps.
- `nearbyPlaceSuggestions`, `isNearbyPlacesLoading`, and `onNearbyPlaceSelect` props are consistent across `StepAmount`, tests, and `TransactionFlow`.
