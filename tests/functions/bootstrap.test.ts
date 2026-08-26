import { describe, expect, it } from "vitest";
import { createBootstrapHandler } from "../../functions/api/bootstrap";

const ORIGIN = "https://sheetlog.com";
const URL = `${ORIGIN}/api/bootstrap`;
const ENV = { BOOTSTRAP_ENCRYPTION_KEY: "a".repeat(64) };
const STAGE = {
  action: "stage",
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
  },
};

function request(body: unknown, cookie?: string) {
  const headers = new Headers({
    Origin: ORIGIN,
    "Content-Type": "application/json",
  });
  if (cookie) headers.set("Cookie", cookie);
  return new Request(URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function cookiePair(response: Response) {
  return response.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
}

describe("bootstrap Pages Function", () => {
  it("stages a sealed HttpOnly host cookie", async () => {
    const response = await createBootstrapHandler({
      now: () => Date.parse("2026-08-26T10:00:00.000Z"),
    })({
      request: request(STAGE),
      env: ENV,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Set-Cookie")).toContain(
      "__Host-sheetlog_bootstrap=",
    );
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=Strict");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("consumes the staged payload and clears the cookie", async () => {
    const handler = createBootstrapHandler({
      now: () => Date.parse("2026-08-26T10:00:00.000Z"),
    });
    const staged = await handler({ request: request(STAGE), env: ENV });
    const consumed = await handler({
      request: request({ action: "consume" }, cookiePair(staged)),
      env: ENV,
    });
    expect(consumed.status).toBe(200);
    expect(await consumed.json()).toMatchObject({
      payload: {
        version: 1,
        setup: { countryCode: "TH", currency: "THB" },
        transaction: { amount: 120, account: "KBank" },
      },
    });
    expect(consumed.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects cross-origin requests", async () => {
    const incoming = request(STAGE);
    incoming.headers.set("Origin", "https://evil.example");
    const response = await createBootstrapHandler()({
      request: incoming,
      env: ENV,
    });
    expect(response.status).toBe(403);
  });

  it("rejects a tampered cookie", async () => {
    const response = await createBootstrapHandler()({
      request: request(
        { action: "consume" },
        "__Host-sheetlog_bootstrap=broken.payload",
      ),
      env: ENV,
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("clears a pending bootstrap without consuming it", async () => {
    const response = await createBootstrapHandler()({
      request: request({ action: "cancel" }),
      env: ENV,
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
