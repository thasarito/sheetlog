import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { SheetLogDB } from "./db";
import {
  clearImportedBootstrapReceipt,
  importBootstrapPayload,
  readImportedBootstrapReceipt,
} from "./bootstrapImport";
import { readLocalWorkspace } from "./localWorkspace";
import { getOnboardingStateKey } from "./settings";
import type { BootstrapPayload } from "./bootstrapPayload";

const payload: BootstrapPayload = {
  version: 1,
  bootstrapId: "bootstrap-import-1",
  issuedAt: "2026-08-26T10:00:00.000Z",
  expiresAt: "2026-08-26T10:30:00.000Z",
  setup: {
    countryCode: "TH",
    currency: "THB",
    account: {
      institutionId: "kbank",
      name: "KBank",
      mark: "K",
      color: "#138a56",
    },
  },
  transaction: {
    id: "transaction-import-1",
    type: "expense",
    amount: 120,
    currency: "THB",
    account: "KBank",
    for: "Me",
    category: "Coffee & Snacks",
    date: "2026-08-26T10:00:00.000Z",
  },
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("bootstrap import", () => {
  let database: SheetLogDB;
  let storage: Storage;

  beforeEach(async () => {
    database = new SheetLogDB(`bootstrap-import-${crypto.randomUUID()}`);
    storage = memoryStorage();
    await database.open();
  });

  it("creates confirmed local settings and a scoped pending transaction", async () => {
    const result = await importBootstrapPayload(payload, { database, storage });
    const onboardingRecord = await database.settings.get(
      getOnboardingStateKey(null),
    );
    expect(JSON.parse(onboardingRecord?.value ?? "null")).toMatchObject({
      accounts: [{ name: "KBank", color: "#138a56" }],
      accountsConfirmed: true,
      categoriesConfirmed: true,
      analyticsBaseCurrency: "THB",
    });
    expect(
      await database.transactions.get(payload.transaction.id),
    ).toMatchObject({
      status: "pending",
      targetSheetId: result.metadata.sheetId,
      targetUserId: result.metadata.userId,
    });
    expect(readLocalWorkspace(storage)).toEqual(result.metadata);
  });

  it("is idempotent and exposes the imported receipt once", async () => {
    await importBootstrapPayload(payload, { database, storage });
    await importBootstrapPayload(payload, { database, storage });
    expect(await database.transactions.count()).toBe(1);
    expect(await readImportedBootstrapReceipt(database)).toMatchObject({
      bootstrapId: payload.bootstrapId,
      transaction: { id: payload.transaction.id, amount: 120 },
    });
    await clearImportedBootstrapReceipt(database);
    expect(await readImportedBootstrapReceipt(database)).toBeNull();
  });
});
