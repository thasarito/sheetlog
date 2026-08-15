import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  createSheetMutationLock,
  withSheetMutationLock,
} from "./sheetMutationLock";

const SCOPE = { sheetId: "sheet/a", userId: "user:a" };
const LEASE_KEY = "sheetlog.sheet-mutation:sheet%2Fa:user%3Aa";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("sheet mutation lock", () => {
  beforeEach(async () => {
    vi.stubGlobal("navigator", {});
    await db.settings.clear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await db.settings.clear();
  });

  it("uses a sheet-and-user-scoped Web Lock when the browser provides it", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<string>,
      ) => callback(null),
    );
    vi.stubGlobal("navigator", { locks: { request } });

    await expect(
      withSheetMutationLock(SCOPE, async () => "completed"),
    ).resolves.toBe("completed");

    expect(request).toHaveBeenCalledWith(
      LEASE_KEY,
      { mode: "exclusive" },
      expect.any(Function),
    );
    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("serializes fallback callers for one scope and releases after success", async () => {
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const order: string[] = [];
    const firstContext = createSheetMutationLock();
    const secondContext = createSheetMutationLock();
    const first = firstContext(SCOPE, async () => {
      order.push("first entered");
      firstEntered.resolve();
      await releaseFirst.promise;
      order.push("first left");
    });
    await firstEntered.promise;
    const second = secondContext(SCOPE, async () => {
      order.push("second entered");
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(order).toEqual(["first entered"]);
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual([
      "first entered",
      "first left",
      "second entered",
    ]);
    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("releases the fallback lease when the operation throws", async () => {
    const failure = new Error("remote mutation failed");

    await expect(
      withSheetMutationLock(SCOPE, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(
      withSheetMutationLock(SCOPE, async () => "recovered"),
    ).resolves.toBe("recovered");

    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("recovers an expired fallback lease left by a stopped context", async () => {
    await db.settings.put({
      key: LEASE_KEY,
      value: JSON.stringify({ ownerId: "stopped-tab", expiresAt: Date.now() - 1 }),
      updatedAt: new Date().toISOString(),
    });

    await expect(
      withSheetMutationLock(SCOPE, async () => "recovered"),
    ).resolves.toBe("recovered");

    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("renews a fallback lease while a slow remote operation is still active", async () => {
    const firstContext = createSheetMutationLock({
      leaseDurationMs: 40,
      retryDelayMs: 2,
    });
    const secondContext = createSheetMutationLock({
      leaseDurationMs: 40,
      retryDelayMs: 2,
    });
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    let secondEntered = false;
    const first = firstContext(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 70);
    });
    const second = secondContext(SCOPE, async () => {
      secondEntered = true;
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 15);
    });
    const enteredBeforeRelease = secondEntered;
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(enteredBeforeRelease).toBe(false);
  });

  it("lets unrelated sheet or user scopes proceed concurrently", async () => {
    const releaseFirst = deferred<void>();
    const firstEntered = deferred<void>();
    const first = withSheetMutationLock(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;

    await expect(
      Promise.all([
        withSheetMutationLock(
          { sheetId: "other-sheet", userId: SCOPE.userId },
          async () => "other sheet",
        ),
        withSheetMutationLock(
          { sheetId: SCOPE.sheetId, userId: "other-user" },
          async () => "other user",
        ),
      ]),
    ).resolves.toEqual(["other sheet", "other user"]);

    releaseFirst.resolve();
    await first;
  });
});
