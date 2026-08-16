import { describe, expect, it } from "vitest";
import { transactionSchema } from "./transactionSchema";

const validValues = {
  type: "expense" as const,
  category: "Food",
  amount: "12.5",
  currency: "THB",
  account: "Wallet",
  forValue: "Me",
  dateObject: new Date("2026-08-15T08:00:00.000Z"),
  note: "Lunch",
};

describe("transactionSchema amount parsing", () => {
  it.each(["", "   ", "12abc", "Infinity", "-Infinity", "NaN", "0", "-1"])(
    "rejects %j as a transaction amount",
    (amount) => {
      const result = transactionSchema.safeParse({ ...validValues, amount });

      expect(result.success).toBe(false);
    },
  );

  it("accepts a finite positive amount", () => {
    expect(transactionSchema.safeParse(validValues).success).toBe(true);
  });
});

describe("transactionSchema place metadata", () => {
  it("accepts a Google place with a nonblank ID", () => {
    const result = transactionSchema.safeParse({
      ...validValues,
      place: { provider: "google", placeId: " central-cafe " },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.place).toEqual({
        provider: "google",
        placeId: "central-cafe",
      });
    }
  });

  it.each([
    { provider: "google", placeId: "   " },
    { provider: "osm", placeId: "central-cafe" },
  ])("rejects invalid place metadata %#", (place) => {
    expect(
      transactionSchema.safeParse({ ...validValues, place }).success,
    ).toBe(false);
  });
});
