import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  setOnboardingState: vi.fn(),
  setOnline: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    onlineManager: { setOnline: mocks.setOnline },
  };
});

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: () => ({ render: mocks.render }),
  },
}));
vi.mock('./lib/mock', () => ({
  IS_DEV_MODE: true,
  MOCK_ONBOARDING_STATE: { accounts: [] },
}));
vi.mock('./lib/settings', () => ({
  setOnboardingState: mocks.setOnboardingState,
}));
vi.mock('./router', () => ({ router: {} }));
vi.mock('./styles', () => ({}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('application bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.render.mockReset();
    mocks.setOnboardingState.mockReset();
    mocks.setOnline.mockReset();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('waits for the scoped development seed before rendering', async () => {
    const seed = deferred();
    mocks.setOnboardingState.mockReturnValue(seed.promise);

    await import('./main');
    const renderCallsBeforeSeed = mocks.render.mock.calls.length;
    seed.resolve();
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));

    expect(mocks.setOnboardingState).toHaveBeenCalledWith(
      { accounts: [] },
      'mock-sheet-id-dev',
    );
    expect(renderCallsBeforeSeed).toBe(0);
  });

  it('initializes TanStack connectivity before rendering an offline reload', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    mocks.setOnboardingState.mockResolvedValue(undefined);

    await import('./main');
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));

    expect(mocks.setOnline).toHaveBeenCalledWith(false);
    expect(mocks.setOnline.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.render.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
