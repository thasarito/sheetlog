import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaceSessionId } from './placeSessionId';

const savedCrypto = globalThis.crypto;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (globalThis.crypto !== savedCrypto) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: savedCrypto,
    });
  }
});

describe('createPlaceSessionId', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('0198b949-5f77-7d98-a53a-bce26d004a2a');

    expect(createPlaceSessionId()).toBe(
      '0198b949-5f77-7d98-a53a-bce26d004a2a',
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('uses a collision-resistant sequence when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(1_723_808_400_000);

    const first = createPlaceSessionId();
    const second = createPlaceSessionId();

    expect(first).toMatch(/^place-1723808400000-\d+$/);
    expect(second).toMatch(/^place-1723808400000-\d+$/);
    expect(second).not.toBe(first);
  });
});
