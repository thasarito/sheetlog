import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, SheetLogDB } from "./db";
import {
  createSheetMutationLock,
  withSheetMutationLock,
} from "./sheetMutationLock";

const SCOPE = { sheetId: "sheet/a", userId: "user:a" };
const LEASE_KEY = "sheetlog.sheet-mutation:sheet%2Fa";
const LEGACY_LEASE_KEY = `${LEASE_KEY}:user%3Aa`;

function serializingLockManager() {
  const tails = new Map<string, Promise<void>>();
  const request = vi.fn(
    async <Result,>(
      name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => Promise<Result>,
    ): Promise<Result> => {
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => current);
      tails.set(name, tail);
      await previous;
      try {
        return await callback(null);
      } finally {
        release();
        if (tails.get(name) === tail) {
          tails.delete(name);
        }
      }
    },
  );
  return {
    manager: { request } as unknown as Pick<LockManager, "request">,
    request,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe("sheet mutation lock", () => {
  beforeEach(async () => {
    vi.stubGlobal("navigator", {});
    await db.settings.clear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.settings.clear();
  });

  it("uses a Sheet-scoped Web Lock when the browser provides it", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<string>,
      ) => callback(null),
    );
    vi.stubGlobal("navigator", { locks: { request } });

    await expect(
      withSheetMutationLock(SCOPE, async (guard) => {
        await guard.assertOwnership();
        return "completed";
      }),
    ).resolves.toBe("completed");

    expect(request).toHaveBeenCalledWith(
      LEASE_KEY,
      { mode: "exclusive" },
      expect.any(Function),
    );
    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("serializes Web Lock callers for the same Sheet even when their users differ", async () => {
    const { manager, request } = serializingLockManager();
    const firstContext = createSheetMutationLock({ lockManager: manager });
    const secondContext = createSheetMutationLock({ lockManager: manager });
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    let secondEntered = false;

    const first = firstContext(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;
    const second = secondContext(
      { ...SCOPE, userId: "other-user" },
      async () => {
        secondEntered = true;
      },
    );

    await expect(
      secondContext(
        { sheetId: "other-sheet", userId: "other-user" },
        async () => "other sheet",
      ),
    ).resolves.toBe("other sheet");
    await delay(20);
    const secondEnteredBeforeRelease = secondEntered;
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(secondEnteredBeforeRelease).toBe(false);
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      "sheetlog.sheet-mutation:sheet%2Fa",
      "sheetlog.sheet-mutation:sheet%2Fa",
      "sheetlog.sheet-mutation:other-sheet",
    ]);
  });

  it("serializes fallback callers for one scope and releases after success", async () => {
    const databaseName = `SheetMutationLock-${Date.now()}-${Math.random()}`;
    const firstDatabase = new SheetLogDB(databaseName);
    const secondDatabase = new SheetLogDB(databaseName);
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const order: string[] = [];
    const firstContext = createSheetMutationLock({
      database: firstDatabase,
      lockManager: null,
    });
    const secondContext = createSheetMutationLock({
      database: secondDatabase,
      lockManager: null,
    });
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
    expect(await firstDatabase.settings.get(LEASE_KEY)).toBeUndefined();
    firstDatabase.close();
    secondDatabase.close();
    await Dexie.delete(databaseName);
  });

  it("serializes fallback callers from independent connections for the same Sheet across users", async () => {
    const databaseName = `SheetMutationLock-${Date.now()}-${Math.random()}`;
    const firstDatabase = new SheetLogDB(databaseName);
    const secondDatabase = new SheetLogDB(databaseName);
    const firstContext = createSheetMutationLock({
      database: firstDatabase,
      lockManager: null,
      retryDelayMs: 2,
    });
    const secondContext = createSheetMutationLock({
      database: secondDatabase,
      lockManager: null,
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
    const second = secondContext(
      { ...SCOPE, userId: "other-user" },
      async () => {
        secondEntered = true;
      },
    );

    await delay(20);
    const secondEnteredBeforeRelease = secondEntered;
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(secondEnteredBeforeRelease).toBe(false);
    firstDatabase.close();
    secondDatabase.close();
    await Dexie.delete(databaseName);
  });

  it("lets fallback callers from independent connections mutate different Sheets concurrently", async () => {
    const databaseName = `SheetMutationLock-${Date.now()}-${Math.random()}`;
    const firstDatabase = new SheetLogDB(databaseName);
    const secondDatabase = new SheetLogDB(databaseName);
    const firstContext = createSheetMutationLock({
      database: firstDatabase,
      lockManager: null,
      retryDelayMs: 2,
    });
    const secondContext = createSheetMutationLock({
      database: secondDatabase,
      lockManager: null,
      retryDelayMs: 2,
    });
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();

    const first = firstContext(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;

    await expect(
      secondContext(
        { sheetId: "other-sheet", userId: "other-user" },
        async () => "other sheet",
      ),
    ).resolves.toBe("other sheet");

    releaseFirst.resolve();
    await first;
    firstDatabase.close();
    secondDatabase.close();
    await Dexie.delete(databaseName);
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

  it("preserves the operation error when fallback cleanup also fails", async () => {
    const operationError = new Error("remote mutation failed");
    const cleanupError = new Error("lease cleanup failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(db.settings, "delete").mockRejectedValueOnce(cleanupError);

    await expect(
      withSheetMutationLock(SCOPE, async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(warn).toHaveBeenCalledWith(
      "Failed to release the Sheet mutation lock:",
      cleanupError,
    );
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

  it("waits for an already-active legacy fallback lease during a rolling update", async () => {
    const legacyRecord = {
      key: LEGACY_LEASE_KEY,
      value: JSON.stringify({
        ownerId: "old-build-tab",
        expiresAt: Date.now() + 60_000,
      }),
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(legacyRecord);
    const withFastRetry = createSheetMutationLock({
      lockManager: null,
      retryDelayMs: 2,
    });
    let entered = false;

    const operation = withFastRetry(SCOPE, async () => {
      entered = true;
      return "new shared lock";
    });
    await delay(20);
    const enteredBeforeLegacyRelease = entered;
    await db.settings.delete(LEGACY_LEASE_KEY);

    await expect(operation).resolves.toBe("new shared lock");
    expect(enteredBeforeLegacyRelease).toBe(false);
    expect(await db.settings.get(LEASE_KEY)).toBeUndefined();
  });

  it("fails closed when a legacy fallback lease appears during guarded work", async () => {
    let guardedWorkRan = false;

    await expect(
      withSheetMutationLock(SCOPE, async (guard) => {
        await db.settings.put({
          key: LEGACY_LEASE_KEY,
          value: JSON.stringify({
            ownerId: "old-build-tab",
            expiresAt: Date.now() + 60_000,
          }),
          updatedAt: new Date().toISOString(),
        });
        await guard.assertOwnership();
        guardedWorkRan = true;
      }),
    ).rejects.toThrow(
      "Sheet mutation lock was lost before the operation completed",
    );

    expect(guardedWorkRan).toBe(false);
    expect(await db.settings.get(LEGACY_LEASE_KEY)).toBeDefined();
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

  it("fails closed before guarded work after another context takes ownership", async () => {
    let guardedWorkRan = false;

    await expect(
      withSheetMutationLock(SCOPE, async (guard) => {
        await db.settings.put({
          key: LEASE_KEY,
          value: JSON.stringify({
            ownerId: "new-owner",
            expiresAt: Date.now() + 60_000,
          }),
          updatedAt: new Date().toISOString(),
        });
        await guard.assertOwnership();
        guardedWorkRan = true;
      }),
    ).rejects.toThrow(
      "Sheet mutation lock was lost before the operation completed",
    );

    expect(guardedWorkRan).toBe(false);
    expect(JSON.parse((await db.settings.get(LEASE_KEY))?.value ?? "{}"))
      .toMatchObject({ ownerId: "new-owner" });
  });

  it("fails closed with an actionable error when lease renewal fails", async () => {
    const originalPut = db.settings.put.bind(db.settings);
    vi.spyOn(db.settings, "put")
      .mockImplementationOnce((record, key) => originalPut(record, key))
      .mockRejectedValueOnce(new Error("IndexedDB renewal failed"));
    const withShortLease = createSheetMutationLock({
      leaseDurationMs: 30,
      lockManager: null,
      retryDelayMs: 2,
    });
    let guardedWorkRan = false;

    await expect(
      withShortLease(SCOPE, async (guard) => {
        await delay(20);
        await guard.assertOwnership();
        guardedWorkRan = true;
      }),
    ).rejects.toThrow(
      "Sheet mutation lock was lost before the operation completed",
    );

    expect(guardedWorkRan).toBe(false);
  });

  it("backs off fallback acquisition retries instead of polling at one fixed delay", async () => {
    const withFastRetry = createSheetMutationLock({
      leaseDurationMs: 1_000,
      lockManager: null,
      retryDelayMs: 2,
    });
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const first = withFastRetry(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const second = withFastRetry(SCOPE, async () => undefined);

    await delay(35);
    const retryDelays = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((value): value is number =>
        typeof value === "number" && value <= 20
      );
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(retryDelays.length).toBeGreaterThan(1);
    expect(retryDelays.some((value) => value > retryDelays[0])).toBe(true);
  });

  it("lets an unrelated Sheet scope proceed concurrently", async () => {
    const releaseFirst = deferred<void>();
    const firstEntered = deferred<void>();
    const first = withSheetMutationLock(SCOPE, async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;

    await expect(
      withSheetMutationLock(
        { sheetId: "other-sheet", userId: SCOPE.userId },
        async () => "other sheet",
      ),
    ).resolves.toBe("other sheet");

    releaseFirst.resolve();
    await first;
  });
});
