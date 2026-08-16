import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  setOnboardingState: vi.fn(),
}));

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
});
