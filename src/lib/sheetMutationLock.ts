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
const RETRY_DELAY_MS = 10;

export interface SheetMutationLockOptions {
  database?: LeaseStore;
  leaseDurationMs?: number;
  lockManager?: Pick<LockManager, "request"> | null;
  retryDelayMs?: number;
}

function scopeKey({ sheetId, userId }: SheetMutationScope): string {
  return `sheetlog.sheet-mutation:${encodeURIComponent(sheetId)}:${encodeURIComponent(userId)}`;
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

async function tryAcquireLease(
  store: LeaseStore,
  key: string,
  leaseOwnerId: string,
  leaseDurationMs: number,
): Promise<boolean> {
  return store.transaction("rw", store.settings, async () => {
    const now = Date.now();
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
    const current = readLease(await store.settings.get(key));
    if (current?.ownerId !== leaseOwnerId) {
      return false;
    }
    const now = Date.now();
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
  while (
    !(await tryAcquireLease(store, key, leaseOwnerId, leaseDurationMs))
  ) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, retryDelayMs);
    });
  }
}

async function withDexieLease<Result>(
  store: LeaseStore,
  scope: SheetMutationScope,
  operation: () => Promise<Result>,
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
  try {
    const result = await operation();
    await renewal;
    if (leaseFailure) {
      throw leaseFailure;
    }
    return result;
  } finally {
    clearInterval(renewalTimer);
    await renewal;
    await releaseLease(store, key, leaseOwnerId);
  }
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
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const lockManager =
      options.lockManager === undefined
        ? browserLockManager()
        : options.lockManager;
    if (lockManager) {
      return lockManager.request(
        scopeKey(scope),
        { mode: "exclusive" },
        async () => operation(),
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
