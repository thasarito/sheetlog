import { describe, expect, it } from "vitest";
import {
  validateBootstrapPayload,
  validateBootstrapStageInput,
} from "./bootstrapPayload";

const stageInput = {
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
    type: "expense",
    amount: 120,
    currency: "THB",
    account: "KBank",
    for: "Me",
    category: "Coffee & Snacks",
    date: "2026-08-26T10:00:00.000Z",
    note: "Coffee",
  },
};

describe("bootstrap payload validation", () => {
  it("accepts a bounded first transaction", () => {
    expect(validateBootstrapStageInput(stageInput)).toEqual(stageInput);
  });

  it("rejects non-positive and non-finite amounts", () => {
    expect(
      validateBootstrapStageInput({
        ...stageInput,
        transaction: { ...stageInput.transaction, amount: 0 },
      }),
    ).toBeNull();
    expect(
      validateBootstrapStageInput({
        ...stageInput,
        transaction: {
          ...stageInput.transaction,
          amount: Number.POSITIVE_INFINITY,
        },
      }),
    ).toBeNull();
  });

  it("rejects unsupported currencies and malformed branding", () => {
    expect(
      validateBootstrapStageInput({
        ...stageInput,
        setup: {
          ...stageInput.setup,
          currency: "ZZZ",
          account: { ...stageInput.setup.account, color: "red" },
        },
      }),
    ).toBeNull();
  });

  it("rejects an expired sealed payload", () => {
    expect(
      validateBootstrapPayload(
        {
          version: 1,
          bootstrapId: "bootstrap-1",
          issuedAt: "2026-08-26T09:00:00.000Z",
          expiresAt: "2026-08-26T09:30:00.000Z",
          ...stageInput,
          transaction: { id: "transaction-1", ...stageInput.transaction },
        },
        Date.parse("2026-08-26T10:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
