import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelBootstrap,
  consumeBootstrap,
  stageBootstrap,
} from "./bootstrapClient";

const setup = {
  countryCode: "TH",
  currency: "THB" as const,
  account: {
    institutionId: "kbank",
    name: "KBank",
    mark: "K",
    color: "#138a56",
  },
};
const transaction = {
  type: "expense" as const,
  amount: 120,
  currency: "THB",
  account: "KBank",
  for: "Me",
  category: "Coffee & Snacks",
  date: "2026-08-26T10:00:00.000Z",
};

afterEach(() => vi.restoreAllMocks());

describe("bootstrap client", () => {
  it("stages with same-origin credentials and JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          bootstrapId: "bootstrap-1",
          transactionId: "transaction-1",
          expiresAt: "2026-08-26T10:30:00.000Z",
        },
        { status: 201 },
      ),
    );
    await stageBootstrap({ setup, transaction });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bootstrap",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("returns null when no staged bootstrap exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "bootstrap_not_found" }, { status: 404 }),
    );
    expect(await consumeBootstrap()).toBeNull();
  });

  it("surfaces bounded server errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error_description: "Bootstrap handoff is not configured." },
        { status: 503 },
      ),
    );
    await expect(cancelBootstrap()).rejects.toThrow(
      "Bootstrap handoff is not configured.",
    );
  });
});
