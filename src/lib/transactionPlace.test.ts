import { describe, expect, it } from "vitest";
import type {
  TransactionInput,
  TransactionRecord,
  TransactionUpdateInput,
} from "./types";
import {
  InvalidTransactionPlaceError,
  applyTransactionUpdate,
  composePlaceUpdateIntent,
  normalizeTransactionInput,
  parseSheetTransactionPlace,
  sameTransactionPlace,
  withoutTransactionPlace,
} from "./transactionPlace";

const current: TransactionRecord = {
  id: "expense-1",
  type: "expense",
  amount: 10,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Coffee",
  date: "2026-08-16T09:00:00.000Z",
  note: "Central Cafe",
  place: { provider: "google", placeId: "central-cafe" },
  status: "synced",
  createdAt: "2026-08-16T09:00:00.000Z",
  updatedAt: "2026-08-16T09:00:00.000Z",
};

const createInput: TransactionInput = {
  type: "expense",
  amount: 10,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Coffee",
  date: "2026-08-16T09:00:00.000Z",
  note: "",
  place: { provider: "google", placeId: "central-cafe" },
};

const createWithoutPlace: TransactionInput = {
  ...createInput,
  note: "Lunch",
  place: undefined,
};

describe("transaction place metadata", () => {
  it("distinguishes omitted preserve, valid set, and explicit clear", () => {
    expect(applyTransactionUpdate(current, { amount: 11 }).place).toEqual(
      current.place,
    );
    expect(
      applyTransactionUpdate(current, {
        place: { provider: "google", placeId: "  replacement  " },
      }).place,
    ).toEqual({ provider: "google", placeId: "replacement" });
    expect(applyTransactionUpdate(current, { place: null })).not.toHaveProperty(
      "place",
    );
  });

  it("clears place when the updated note is blank", () => {
    expect(applyTransactionUpdate(current, { note: "   " })).not.toHaveProperty(
      "place",
    );
  });

  it("rejects setting a place alongside a blank note", () => {
    expect(() =>
      applyTransactionUpdate(current, {
        note: "",
        place: { provider: "google", placeId: "replacement" },
      }),
    ).toThrow("Place metadata requires a nonblank note");
  });

  it.each([
    { place: undefined },
    { place: { provider: "other", placeId: "x" } },
    { place: { provider: "google", placeId: "   " } },
  ] as unknown as TransactionUpdateInput[])(
    "rejects malformed own place patches",
    (input) => {
      expect(() => applyTransactionUpdate(current, input)).toThrow(
        InvalidTransactionPlaceError,
      );
    },
  );

  it("requires a nonblank note when creating place metadata", () => {
    expect(() => normalizeTransactionInput(createInput)).toThrow(
      "Place metadata requires a nonblank note",
    );
  });

  it("treats an undefined optional create place as absent", () => {
    expect(normalizeTransactionInput(createWithoutPlace)).not.toHaveProperty(
      "place",
    );
  });

  it("parses only complete recognized Sheet pairs", () => {
    expect(parseSheetTransactionPlace("Cafe", " google ", " id-1 ")).toEqual({
      provider: "google",
      placeId: "id-1",
    });
    expect(parseSheetTransactionPlace("", "google", "id-1")).toBeUndefined();
    expect(parseSheetTransactionPlace("Cafe", "google", "")).toBeUndefined();
    expect(parseSheetTransactionPlace("Cafe", "other", "id-1")).toBeUndefined();
  });

  it("retains an older explicit intent across unrelated edits", () => {
    expect(composePlaceUpdateIntent("clear", { amount: 12 })).toBe("clear");
    expect(composePlaceUpdateIntent("set", { note: "Edited Cafe" })).toBe(
      "set",
    );
    expect(
      composePlaceUpdateIntent("clear", {
        place: { provider: "google", placeId: "new-id" },
      }),
    ).toBe("set");
    expect(composePlaceUpdateIntent("set", { place: null })).toBe("clear");
  });

  it("compares provider and ID values", () => {
    expect(
      sameTransactionPlace(current.place, {
        provider: "google",
        placeId: "central-cafe",
      }),
    ).toBe(true);
    expect(sameTransactionPlace(current.place, undefined)).toBe(false);
  });

  it("removes the place property without mutating the source record", () => {
    const next = withoutTransactionPlace(current);

    expect(next).not.toHaveProperty("place");
    expect(current.place).toEqual({
      provider: "google",
      placeId: "central-cafe",
    });
  });
});
