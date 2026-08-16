import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlaceAutocompleteSession,
  endPlaceAutocompleteSession,
  resolvePlaceSuggestionName,
  searchPlaceSuggestions,
  type Coordinates,
  type PlaceAutocompleteSession,
  type PlaceSuggestion,
} from '../../lib/googlePlaces';
import {
  placeAutocompleteKeys,
  usePlaceAutocomplete,
} from './usePlaceAutocomplete';

vi.mock('../../lib/googlePlaces', () => ({
  createPlaceAutocompleteSession: vi.fn(),
  endPlaceAutocompleteSession: vi.fn(),
  resolvePlaceSuggestionName: vi.fn(),
  searchPlaceSuggestions: vi.fn(),
}));

const firstSession = {
  token: { id: 'A' } as unknown as GoogleAutocompleteSessionToken,
} satisfies PlaceAutocompleteSession;
const secondSession = {
  token: { id: 'B' } as unknown as GoogleAutocompleteSessionToken,
} satisfies PlaceAutocompleteSession;
const firstSuggestion = {
  placeId: 'place-1',
  name: 'Coffee House',
  secondaryText: '123 Main Street',
} satisfies PlaceSuggestion;
const secondSuggestion = {
  placeId: 'place-2',
  name: 'Coffee Roasters',
  secondaryText: '456 High Street',
} satisfies PlaceSuggestion;

type HookProps = {
  value: string;
  active: boolean;
  enabled: boolean;
  sessionId: string;
  locationBias?: Coordinates;
};

const queryClients: QueryClient[] = [];

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  queryClients.push(queryClient);

  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, wrapper };
}

function renderAutocomplete(
  initialProps: HookProps,
  options: { reactStrictMode?: boolean } = {},
) {
  const harness = createHarness();
  const rendered = renderHook(
    (props: HookProps) => usePlaceAutocomplete(props),
    {
      initialProps,
      wrapper: harness.wrapper,
      reactStrictMode: options.reactStrictMode,
    },
  );
  return { ...harness, ...rendered };
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function flushQueries() {
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('usePlaceAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.mocked(createPlaceAutocompleteSession).mockResolvedValue(firstSession);
    vi.mocked(searchPlaceSuggestions).mockResolvedValue([firstSuggestion]);
    vi.mocked(resolvePlaceSuggestionName).mockResolvedValue('Coffee House');
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    for (const queryClient of queryClients.splice(0)) {
      queryClient.clear();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes only the controlled autocomplete result contract', () => {
    const { result } = renderAutocomplete({
      value: '',
      active: false,
      enabled: true,
      sessionId: 'public-contract',
    });

    expect(Object.keys(result.current).sort()).toEqual(
      [
        'error',
        'hasSearched',
        'isDebouncing',
        'isError',
        'isLoading',
        'isSelecting',
        'selectSuggestion',
        'selectionError',
        'sessionError',
        'suggestions',
      ].sort(),
    );
    expect(result.current).not.toHaveProperty('input');
    expect(result.current).not.toHaveProperty('setInput');
    expect(result.current).not.toHaveProperty('reset');
    expect(result.current).not.toHaveProperty('retry');
  });

  it.each([
    { label: 'inactive', value: 'coffee', active: false, enabled: true },
    { label: 'disabled', value: 'coffee', active: true, enabled: false },
    { label: 'below threshold', value: ' c ', active: true, enabled: true },
  ])('does not create a provider session while $label', async (props) => {
    const { result } = renderAutocomplete({
      ...props,
      sessionId: `no-session-${props.label}`,
    });

    await advance(250);

    expect(createPlaceAutocompleteSession).not.toHaveBeenCalled();
    expect(searchPlaceSuggestions).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.sessionError).toBeNull();
    expect(result.current.hasSearched).toBe(false);
  });

  it('debounces the exact normalized controlled value for 250ms', async () => {
    const locationBias = { lat: 13.75, lng: 100.5 };
    const { result, rerender } = renderAutocomplete({
      value: '',
      active: true,
      enabled: true,
      sessionId: 'debounce',
      locationBias,
    });

    rerender({
      value: 'c',
      active: true,
      enabled: true,
      sessionId: 'debounce',
      locationBias,
    });
    await advance(250);
    expect(createPlaceAutocompleteSession).not.toHaveBeenCalled();

    rerender({
      value: '  Coffee   Shop  ',
      active: true,
      enabled: true,
      sessionId: 'debounce',
      locationBias,
    });
    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    expect(result.current.isDebouncing).toBe(true);
    expect(result.current.isLoading).toBe(true);

    await advance(249);
    expect(searchPlaceSuggestions).not.toHaveBeenCalled();
    await advance(1);
    await flushQueries();

    expect(searchPlaceSuggestions).toHaveBeenCalledTimes(1);
    expect(searchPlaceSuggestions).toHaveBeenCalledWith(
      'Coffee Shop',
      firstSession,
      locationBias,
    );
    expect(result.current.isDebouncing).toBe(false);
    expect(result.current.suggestions).toEqual([firstSuggestion]);
    expect(result.current.hasSearched).toBe(true);
  });

  it('hides stale results immediately and keeps only the newest query result', async () => {
    const firstSearch = deferred<PlaceSuggestion[]>();
    const secondSearch = deferred<PlaceSuggestion[]>();
    vi.mocked(searchPlaceSuggestions).mockImplementation((input) => {
      if (input === 'first') return firstSearch.promise;
      if (input === 'second') return secondSearch.promise;
      return Promise.resolve([]);
    });
    const { result, rerender } = renderAutocomplete({
      value: 'first',
      active: true,
      enabled: true,
      sessionId: 'out-of-order',
    });

    await flushQueries();
    await advance(250);
    expect(searchPlaceSuggestions).toHaveBeenCalledWith(
      'first',
      firstSession,
      undefined,
    );

    rerender({
      value: 'second',
      active: true,
      enabled: true,
      sessionId: 'out-of-order',
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.hasSearched).toBe(false);
    expect(result.current.isDebouncing).toBe(true);

    await advance(250);
    expect(searchPlaceSuggestions).toHaveBeenCalledWith(
      'second',
      firstSession,
      undefined,
    );
    secondSearch.resolve([secondSuggestion]);
    await flushQueries();
    expect(result.current.suggestions).toEqual([secondSuggestion]);

    firstSearch.resolve([firstSuggestion]);
    await flushQueries();
    expect(result.current.suggestions).toEqual([secondSuggestion]);
  });

  it('gates pending and failed session state when eligibility ends', async () => {
    const sessionRequest = deferred<PlaceAutocompleteSession>();
    vi.mocked(createPlaceAutocompleteSession).mockReturnValue(sessionRequest.promise);
    const { result, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'gated-session',
    });

    await flushQueries();
    expect(result.current.isLoading).toBe(true);

    rerender({
      value: 'coffee',
      active: false,
      enabled: true,
      sessionId: 'gated-session',
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.sessionError).toBeNull();

    sessionRequest.reject(new Error('stale session failure'));
    await flushQueries();
    expect(result.current.isError).toBe(false);
    expect(result.current.sessionError).toBeNull();
  });

  it('uses a fresh owner-provided session after session creation fails', async () => {
    vi.mocked(createPlaceAutocompleteSession)
      .mockRejectedValueOnce(new Error('session unavailable'))
      .mockResolvedValueOnce(secondSession);
    const { result, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'failed-session',
    });

    await flushQueries();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toMatchObject({ message: 'session unavailable' });
    expect(result.current.sessionError).toMatchObject({
      message: 'session unavailable',
    });

    rerender({
      value: 'coffee shop',
      active: true,
      enabled: true,
      sessionId: 'fresh-session',
    });
    await flushQueries();

    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(2);
    expect(result.current.sessionError).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(result.current).not.toHaveProperty('retry');
  });

  it('gates an old suggestion error after the controlled value changes', async () => {
    vi.mocked(searchPlaceSuggestions).mockRejectedValue(
      new Error('suggestions unavailable'),
    );
    const { result, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'suggestion-error',
    });

    await flushQueries();
    await advance(250);
    await flushQueries();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toMatchObject({
      message: 'suggestions unavailable',
    });
    expect(result.current.sessionError).toBeNull();

    rerender({
      value: 'c',
      active: true,
      enabled: true,
      sessionId: 'suggestion-error',
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.suggestions).toEqual([]);
  });

  it('returns structured selection data and deduplicates one pending selection', async () => {
    const displayName = deferred<string>();
    vi.mocked(resolvePlaceSuggestionName).mockReturnValue(displayName.promise);
    const { result } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'selection',
    });
    await flushQueries();

    let firstSelection!: Promise<{ displayName: string; placeId: string }>;
    let secondSelection!: Promise<{ displayName: string; placeId: string }>;
    act(() => {
      firstSelection = result.current.selectSuggestion(firstSuggestion);
      secondSelection = result.current.selectSuggestion(firstSuggestion);
    });
    await flushQueries();
    expect(firstSelection).toBe(secondSelection);
    expect(result.current.isSelecting).toBe(true);
    expect(resolvePlaceSuggestionName).toHaveBeenCalledTimes(1);

    displayName.resolve('Resolved Coffee');
    await expect(firstSelection).resolves.toEqual({
      displayName: 'Resolved Coffee',
      placeId: 'place-1',
    });
    await flushQueries();
    expect(result.current.isSelecting).toBe(false);
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
  });

  it('clears a selection error when the controlled value changes', async () => {
    vi.mocked(resolvePlaceSuggestionName).mockRejectedValueOnce(
      new Error('selection unavailable'),
    );
    const { result, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'selection-error',
    });
    await flushQueries();

    await expect(
      result.current.selectSuggestion(firstSuggestion),
    ).rejects.toThrow('selection unavailable');
    await flushQueries();
    expect(result.current.isError).toBe(false);
    expect(result.current.selectionError).toMatchObject({
      message: 'selection unavailable',
    });

    rerender({
      value: 'coffee shop',
      active: true,
      enabled: true,
      sessionId: 'selection-error',
    });
    expect(result.current.selectionError).toBeNull();
  });

  it.each([
    {
      label: 'value replacement',
      update: (props: HookProps): HookProps => ({ ...props, value: 'tea' }),
    },
    {
      label: 'eligibility loss',
      update: (props: HookProps): HookProps => ({ ...props, enabled: false }),
    },
    {
      label: 'session replacement',
      update: (props: HookProps): HookProps => ({
        ...props,
        sessionId: 'selection-session-b',
      }),
    },
  ])('rejects a deferred selection after $label', async ({ update }) => {
    const displayName = deferred<string>();
    vi.mocked(resolvePlaceSuggestionName).mockReturnValue(displayName.promise);
    vi.mocked(createPlaceAutocompleteSession)
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const initialProps: HookProps = {
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'selection-session-a',
    };
    const { result, rerender } = renderAutocomplete(initialProps);
    await flushQueries();

    const selectionPromise = result.current.selectSuggestion(firstSuggestion);
    rerender(update(initialProps));
    displayName.resolve('Stale Coffee');

    await expect(selectionPromise).rejects.toThrow(
      'Place autocomplete selection is no longer active',
    );
  });

  it('rejects a deferred selection after unmount', async () => {
    const displayName = deferred<string>();
    vi.mocked(resolvePlaceSuggestionName).mockReturnValue(displayName.promise);
    const { result, unmount } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'selection-unmount',
    });
    await flushQueries();

    const selectionPromise = result.current.selectSuggestion(firstSuggestion);
    unmount();
    displayName.resolve('Stale Coffee');

    await expect(selectionPromise).rejects.toThrow(
      'Place autocomplete selection is no longer active',
    );
  });

  it('ends the old session and removes its exact caches when eligibility ends', async () => {
    const { queryClient, result, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'eligibility-cleanup',
    });
    await flushQueries();
    await advance(250);
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);

    rerender({
      value: 'coffee',
      active: false,
      enabled: true,
      sessionId: 'eligibility-cleanup',
    });
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
    expect(
      queryClient.getQueryData(
        placeAutocompleteKeys.session('eligibility-cleanup'),
      ),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        placeAutocompleteKeys.suggestions('eligibility-cleanup', 'coffee'),
      ),
    ).toBeUndefined();
  });

  it('ends session A and clears only its caches when session B replaces it', async () => {
    vi.mocked(createPlaceAutocompleteSession)
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const { queryClient, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'session-a',
    });
    await flushQueries();

    rerender({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'session-b',
    });
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
    expect(
      queryClient.getQueryData(placeAutocompleteKeys.session('session-a')),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(placeAutocompleteKeys.session('session-b')),
    ).toBe(secondSession);
  });

  it('ends a deferred session that resolves after eligibility is lost', async () => {
    const sessionRequest = deferred<PlaceAutocompleteSession>();
    vi.mocked(createPlaceAutocompleteSession).mockReturnValue(sessionRequest.promise);
    const { queryClient, rerender } = renderAutocomplete({
      value: 'coffee',
      active: true,
      enabled: true,
      sessionId: 'deferred-session',
    });
    await flushQueries();

    rerender({
      value: 'coffee',
      active: false,
      enabled: true,
      sessionId: 'deferred-session',
    });
    sessionRequest.resolve(firstSession);
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
    expect(
      queryClient.getQueryData(placeAutocompleteKeys.session('deferred-session')),
    ).toBeUndefined();
  });

  it('keeps one usable session through Strict Mode and retires it on real unmount', async () => {
    const { queryClient, result, unmount } = renderAutocomplete(
      {
        value: 'coffee',
        active: true,
        enabled: true,
        sessionId: 'strict-mode',
      },
      { reactStrictMode: true },
    );

    await flushQueries();
    expect(createPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    await advance(250);
    await flushQueries();
    expect(result.current.suggestions).toEqual([firstSuggestion]);
    expect(endPlaceAutocompleteSession).not.toHaveBeenCalled();

    unmount();
    await flushQueries();

    expect(endPlaceAutocompleteSession).toHaveBeenCalledTimes(1);
    expect(endPlaceAutocompleteSession).toHaveBeenCalledWith(firstSession);
    expect(
      queryClient.getQueryData(placeAutocompleteKeys.session('strict-mode')),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        placeAutocompleteKeys.suggestions('strict-mode', 'coffee'),
      ),
    ).toBeUndefined();
  });
});
