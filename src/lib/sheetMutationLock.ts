import type { Table } from "dexie";
import { db } from "./db";
import type { SettingRecord } from "./types";

export interface SheetMutationScope {
  sheetId: string;
  userId: string;
}

type Lease = {
  ownerId: string;
  expiresAt: number;
};

type LeaseStore = {
  settings: Table<SettingRecord, string>;
  transaction: typeof db.transaction;
};

const LEASE_DURATION_MS = 60_000;
const RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 250;

export interface SheetMutationGuard {
  assertOwnership(): Promise<void>;
}

export class SheetMutationLockLostError extends Error {
  constructor() {
    super(
      "Sheet mutation lock was lost before the operation completed. Retry the transaction to reconcile with the latest Sheet state.",
    );
    this.name = "SheetMutationLockLostError";
  }
}

export interface SheetMutationLockOptions {
  database?: LeaseStore;
  leaseDurationMs?: number;
  lockManager?: Pick<LockManager, "request"> | null;
  retryDelayMs?: number;
}

// Google Sheet row positions are shared by every account that can access the
// Sheet, so the remote mutation lock must not be partitioned by local queue
// ownership. Legacy builds used a trailing user segment; those records are a
// different namespace and cannot confer shared-lock ownership, but an active
// legacy fallback lease still blocks or fails closed during a rolling update.
function scopeKey({ sheetId }: SheetMutationScope): string {
  return `sheetlog.sheet-mutation:${encodeURIComponent(sheetId)}`;
}

function ownerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

function readLease(record: SettingRecord | undefined): Lease | null {
  if (!record) {
    return null;
  }
  try {
    const parsed = JSON.parse(record.value) as Partial<Lease>;
    return typeof parsed.ownerId === "string" &&
      typeof parsed.expiresAt === "number" &&
      Number.isFinite(parsed.expiresAt)
      ? { ownerId: parsed.ownerId, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
}

async function hasActiveLegacyLease(
  settings: Table<SettingRecord, string>,
  sharedKey: string,
  now: number,
): Promise<boolean> {
  const legacyPrefix = `${sharedKey}:`;
  const legacyRecords = await settings
    .filter((record) => record.key.startsWith(legacyPrefix))
    .toArray();
  return legacyRecords.some((record) => {
    const lease = readLease(record);
    return lease !== null && lease.expiresAt > now;
  });
}

async function tryAcquireLease(
  store: LeaseStore,
  key: string,
  leaseOwnerId: string,
  leaseDurationMs: number,
): Promise<boolean> {
  return store.transaction("rw", store.settings, async () => {
    const now = Date.now();
    if (await hasActiveLegacyLease(store.settings, key, now)) {
      return false;
    }
    const current = readLease(await store.settings.get(key));
    if (current && current.expiresAt > now) {
      return false;
    }
    await store.settings.put({
      key,
      value: JSON.stringify({
        ownerId: leaseOwnerId,
        expiresAt: now + leaseDurationMs,
      } satisfies Lease),
      updatedAt: new Date(now).toISOString(),
    });
    return true;
  });
}

async function releaseLease(
  store: LeaseStore,
  key: string,
  leaseOwnerId: string,
): Promise<void> {
  await store.transaction("rw", store.settings, async () => {
    const current = readLease(await store.settings.get(key));
    if (current?.ownerId === leaseOwnerId) {
      await store.settings.delete(key);
    }
  });
}

async function renewLease(
  store: LeaseStore,
  key: string,
  leaseOwnerId: string,
  leaseDurationMs: number,
): Promise<boolean> {
  return store.transaction("rw", store.settings, async () => {
    const now = Date.now();
    const current = readLease(await store.settings.get(key));
    if (
      current?.ownerId !== leaseOwnerId ||
      current.expiresAt <= now ||
      await hasActiveLegacyLease(store.settings, key, now)
    ) {
      return false;
    }
    await store.settings.put({
      key,
      value: JSON.stringify({
        ownerId: leaseOwnerId,
        expiresAt: now + leaseDurationMs,
      } satisfies Lease),
      updatedAt: new Date(now).toISOString(),
    });
    return true;
  });
}

async function waitForLease(
  store: LeaseStore,
  key: string,
  leaseOwnerId: string,
  leaseDurationMs: number,
  retryDelayMs: number,
): Promise<void> {
  let nextRetryDelayMs = retryDelayMs;
  while (
    !(await tryAcquireLease(store, key, leaseOwnerId, leaseDurationMs))
  ) {
    const jitterMs = Math.floor(
      Math.random() * Math.max(1, nextRetryDelayMs / 5),
    );
    await new Promise<void>((resolve) => {
      setTimeout(resolve, nextRetryDelayMs + jitterMs);
    });
    nextRetryDelayMs = Math.min(
      MAX_RETRY_DELAY_MS,
      nextRetryDelayMs * 2,
    );
  }
}

async function withDexieLease<Result>(
  store: LeaseStore,
  scope: SheetMutationScope,
  operation: (guard: SheetMutationGuard) => Promise<Result>,
  leaseDurationMs: number,
  retryDelayMs: number,
): Promise<Result> {
  const key = scopeKey(scope);
  const leaseOwnerId = ownerId();
  await waitForLease(
    store,
    key,
    leaseOwnerId,
    leaseDurationMs,
    retryDelayMs,
  );
  let leaseFailure: unknown = null;
  let renewal = Promise.resolve();
  const renewalTimer = setInterval(() => {
    renewal = renewal
      .then(async () => {
        if (leaseFailure) {
          return;
        }
        const didRenew = await renewLease(
          store,
          key,
          leaseOwnerId,
          leaseDurationMs,
        );
        if (!didRenew) {
          leaseFailure = new Error(
            "Sheet mutation lock was lost while an operation was running",
          );
        }
      })
      .catch((error: unknown) => {
        leaseFailure = error;
      });
  }, Math.max(1, Math.floor(leaseDurationMs / 3)));

  const guard: SheetMutationGuard = {
    async assertOwnership() {
      if (leaseFailure) {
        throw new SheetMutationLockLostError();
      }
      try {
        const stillOwnsLease = await renewLease(
          store,
          key,
          leaseOwnerId,
          leaseDurationMs,
        );
        if (!stillOwnsLease) {
          leaseFailure = new SheetMutationLockLostError();
          throw leaseFailure;
        }
      } catch (error: unknown) {
        leaseFailure = error;
        if (error instanceof SheetMutationLockLostError) {
          throw error;
        }
        throw new SheetMutationLockLostError();
      }
    },
  };

  let operationResult!: Result;
  let operationError: unknown;
  let operationFailed = false;
  try {
    operationResult = await operation(guard);
    await guard.assertOwnership();
  } catch (error: unknown) {
    operationFailed = true;
    operationError = error;
  }

  clearInterval(renewalTimer);
  await renewal;
  let cleanupError: unknown;
  try {
    await releaseLease(store, key, leaseOwnerId);
  } catch (error: unknown) {
    cleanupError = error;
  }

  if (operationFailed) {
    if (cleanupError) {
      console.warn(
        "Failed to release the Sheet mutation lock:",
        cleanupError,
      );
    }
    throw operationError;
  }
  if (leaseFailure) {
    throw new SheetMutationLockLostError();
  }
  if (cleanupError) {
    throw cleanupError;
  }
  return operationResult;
}

function browserLockManager(): Pick<LockManager, "request"> | null {
  if (
    typeof navigator === "undefined" ||
    !("locks" in navigator) ||
    !navigator.locks ||
    typeof navigator.locks.request !== "function"
  ) {
    return null;
  }
  return navigator.locks;
}

export function createSheetMutationLock(
  options: SheetMutationLockOptions = {},
) {
  const database = options.database ?? db;
  const leaseDurationMs =
    options.leaseDurationMs ?? LEASE_DURATION_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;

  return async function withLock<Result>(
    scope: SheetMutationScope,
    operation: (guard: SheetMutationGuard) => Promise<Result>,
  ): Promise<Result> {
    const lockManager =
      options.lockManager === undefined
        ? browserLockManager()
        : options.lockManager;
    if (lockManager) {
      return lockManager.request(
        scopeKey(scope),
        { mode: "exclusive" },
        async () => operation({ assertOwnership: async () => undefined }),
      );
    }
    return withDexieLease(
      database,
      scope,
      operation,
      leaseDurationMs,
      retryDelayMs,
    );
  };
}

export const withSheetMutationLock = createSheetMutationLock();
