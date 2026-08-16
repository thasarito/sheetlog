import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOAuthTokenHandler,
  onRequest,
} from "../../functions/api/oauth/token";
import tsconfigSource from "../../tsconfig.json?raw";
import wranglerSource from "../../wrangler.toml?raw";

const APP_URL = "https://sheetlog.com/api/oauth/token";
const APP_ORIGIN = "https://sheetlog.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_BODY_BYTES = 8 * 1024;
const PRODUCTION_CLIENT_ID =
  "258969467044-ptakke7dl5fe9m2lqf80o62nik2572jd.apps.googleusercontent.com";

const ENV = {
  GOOGLE_CLIENT_ID: "browser-client-id",
  GOOGLE_CLIENT_SECRET: "server-secret",
  OAUTH_REDIRECT_PATH: "/",
};

interface NodeRequestInit extends RequestInit {
  duplex?: "half";
}

function authorizationParams(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    code: "authorization-code",
    client_id: ENV.GOOGLE_CLIENT_ID,
    redirect_uri: `${APP_ORIGIN}/`,
    grant_type: "authorization_code",
    code_verifier: "pkce-verifier",
    ...overrides,
  });
}

function refreshParams(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: ENV.GOOGLE_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: "refresh-token",
    ...overrides,
  });
}

function request(body: BodyInit, init: NodeRequestInit = {}) {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: APP_ORIGIN,
  });
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });

  const method = init.method ?? "POST";
  return new Request(APP_URL, {
    ...init,
    method,
    headers,
    ...(!["GET", "HEAD"].includes(method.toUpperCase()) ? { body } : {}),
  } as NodeRequestInit);
}

function upstreamResponse(payload: unknown = { access_token: "access-token" }) {
  return Response.json(payload, { status: 200 });
}

function upstreamFetch(response = upstreamResponse()) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

function expectPrivateResponse(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
}

async function expectJsonError(
  response: Response,
  status: number,
  error: string,
) {
  expect(response.status).toBe(status);
  expectPrivateResponse(response);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  const payload = await response.json();
  expect(payload).toMatchObject({
    error,
    error_description: expect.any(String),
  });
  return payload as { error: string; error_description: string };
}

function forwardedForm(mock: ReturnType<typeof upstreamFetch>) {
  expect(mock).toHaveBeenCalledTimes(1);
  const [url, init] = mock.mock.calls[0];
  expect(url).toBe(GOOGLE_TOKEN_URL);
  expect(init).toMatchObject({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  expect(init?.body).toBeInstanceOf(URLSearchParams);
  return {
    body: init?.body as URLSearchParams,
    init: init as RequestInit,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth token Pages Function", () => {
  it("exports the production handler and an injectable handler factory", () => {
    expect(onRequest).toBeTypeOf("function");
    expect(createOAuthTokenHandler).toBeTypeOf("function");
  });

  it("forwards only the authorization-code allowlist and injects the server secret", async () => {
    const fetchMock = upstreamFetch(
      upstreamResponse({ access_token: "access-token", expires_in: 3600 }),
    );
    const incomingRequest = request(authorizationParams());

    const response = await createOAuthTokenHandler(fetchMock)({
      request: incomingRequest,
      env: ENV,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access_token: "access-token",
      expires_in: 3600,
    });
    expectPrivateResponse(response);
    const { body, init } = forwardedForm(fetchMock);
    expect(Array.from(body.entries())).toEqual([
      ["code", "authorization-code"],
      ["client_id", "browser-client-id"],
      ["redirect_uri", "https://sheetlog.com/"],
      ["grant_type", "authorization_code"],
      ["code_verifier", "pkce-verifier"],
      ["client_secret", "server-secret"],
    ]);
    expect(init.signal).toBe(incomingRequest.signal);
  });

  it("forwards only the refresh-token allowlist and the incoming abort signal", async () => {
    const fetchMock = upstreamFetch();
    const controller = new AbortController();
    const incomingRequest = request(refreshParams(), {
      signal: controller.signal,
    });

    const response = await createOAuthTokenHandler(fetchMock)({
      request: incomingRequest,
      env: ENV,
    });

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    const { body, init } = forwardedForm(fetchMock);
    expect(Array.from(body.entries())).toEqual([
      ["client_id", "browser-client-id"],
      ["grant_type", "refresh_token"],
      ["refresh_token", "refresh-token"],
      ["client_secret", "server-secret"],
    ]);
    expect(init.signal).toBe(incomingRequest.signal);
  });

  it("ignores spoofed secrets and unknown fields when reconstructing the request", async () => {
    const params = authorizationParams();
    params.append("client_secret", "caller-secret-one");
    params.append("client_secret", "caller-secret-two");
    params.append("audience", "attacker-selected-audience");
    params.append("unknown", "attacker-selected-value");
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(params),
      env: ENV,
    });

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    const { body } = forwardedForm(fetchMock);
    expect(Array.from(body.keys())).toEqual([
      "code",
      "client_id",
      "redirect_uri",
      "grant_type",
      "code_verifier",
      "client_secret",
    ]);
    expect(body.getAll("client_secret")).toEqual(["server-secret"]);
    expect(body.get("client_id")).toBe(ENV.GOOGLE_CLIENT_ID);
    expect(body.get("redirect_uri")).toBe(`${APP_ORIGIN}/`);
    expect(body.has("audience")).toBe(false);
    expect(body.has("unknown")).toBe(false);
  });

  it.each(["/oauth/callback", "/nested/oauth/callback/"])(
    "derives and preserves the configured non-root redirect path %s",
    async (redirectPath) => {
      const fetchMock = upstreamFetch();
      const redirectUri = `${APP_ORIGIN}${redirectPath}`;

      const response = await createOAuthTokenHandler(fetchMock)({
        request: request(authorizationParams({ redirect_uri: redirectUri })),
        env: { ...ENV, OAUTH_REDIRECT_PATH: redirectPath },
      });

      expect(response.status).toBe(200);
      expectPrivateResponse(response);
      expect(forwardedForm(fetchMock).body.get("redirect_uri")).toBe(
        redirectUri,
      );
    },
  );

  it.each([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "OAUTH_REDIRECT_PATH",
  ] as const)("returns 503 when %s is missing without calling upstream", async (key) => {
    const fetchMock = upstreamFetch();
    const env: Record<string, string | undefined> = { ...ENV };
    delete env[key];

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams()),
      env,
    });

    await expectJsonError(response, 503, "server_configuration_error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["blank client ID", { ...ENV, GOOGLE_CLIENT_ID: "   " }],
    ["blank client secret", { ...ENV, GOOGLE_CLIENT_SECRET: "\t" }],
    ["relative redirect", { ...ENV, OAUTH_REDIRECT_PATH: "callback" }],
    ["absolute redirect", { ...ENV, OAUTH_REDIRECT_PATH: "https://evil.example/" }],
    ["protocol-relative redirect", { ...ENV, OAUTH_REDIRECT_PATH: "//evil.example/" }],
    ["redirect query", { ...ENV, OAUTH_REDIRECT_PATH: "/?next=evil" }],
    ["redirect fragment", { ...ENV, OAUTH_REDIRECT_PATH: "/#fragment" }],
    ["non-canonical redirect", { ...ENV, OAUTH_REDIRECT_PATH: "/nested/../callback" }],
  ])("returns 503 for invalid server configuration: %s", async (_name, env) => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams()),
      env,
    });

    await expectJsonError(response, 503, "server_configuration_error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams(), { method: "GET" }),
      env: ENV,
    });

    await expectJsonError(response, 405, "method_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "https://sheetlog.com.evil.example"])(
    "rejects the non-matching Origin %s",
    async (origin) => {
      const fetchMock = upstreamFetch();

      const response = await createOAuthTokenHandler(fetchMock)({
        request: request(authorizationParams(), { headers: { Origin: origin } }),
        env: ENV,
      });

      await expectJsonError(response, 403, "invalid_origin");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a request without an Origin header", async () => {
    const fetchMock = upstreamFetch();
    const incomingRequest = request(authorizationParams());
    incomingRequest.headers.delete("Origin");

    const response = await createOAuthTokenHandler(fetchMock)({
      request: incomingRequest,
      env: ENV,
    });

    await expectJsonError(response, 403, "invalid_origin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "application/json",
    "text/plain",
    "application/x-www-form-urlencoded-malicious",
  ])("rejects the unsupported content type %s", async (contentType) => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams(), {
        headers: { "Content-Type": contentType },
      }),
      env: ENV,
    });

    await expectJsonError(response, 415, "unsupported_media_type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a case-insensitive form content type with parameters", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(refreshParams(), {
        headers: {
          "Content-Type": "Application/X-Www-Form-Urlencoded; Charset=UTF-8",
        },
      }),
      env: ENV,
    });

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported grant", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(
        refreshParams({ grant_type: "client_credentials" }),
      ),
      env: ENV,
    });

    await expectJsonError(response, 400, "unsupported_grant_type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "code",
    "client_id",
    "redirect_uri",
    "grant_type",
    "code_verifier",
  ])("rejects a missing authorization-code field: %s", async (field) => {
    const params = authorizationParams();
    params.delete(field);
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(params),
      env: ENV,
    });

    expect(response.status).toBe(400);
    expectPrivateResponse(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["client_id", "grant_type", "refresh_token"])(
    "rejects a missing refresh-token field: %s",
    async (field) => {
      const params = refreshParams();
      params.delete(field);
      const fetchMock = upstreamFetch();

      const response = await createOAuthTokenHandler(fetchMock)({
        request: request(params),
        env: ENV,
      });

      expect(response.status).toBe(400);
      expectPrivateResponse(response);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["authorization_code", "code"],
    ["authorization_code", "client_id"],
    ["authorization_code", "redirect_uri"],
    ["authorization_code", "grant_type"],
    ["authorization_code", "code_verifier"],
    ["refresh_token", "client_id"],
    ["refresh_token", "grant_type"],
    ["refresh_token", "refresh_token"],
  ])("rejects a blank %s grant field: %s", async (grantType, field) => {
    const params =
      grantType === "authorization_code" ? authorizationParams() : refreshParams();
    params.set(field, "   ");
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(params),
      env: ENV,
    });

    expect(response.status).toBe(400);
    expectPrivateResponse(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["authorization_code", "code"],
    ["authorization_code", "client_id"],
    ["authorization_code", "redirect_uri"],
    ["authorization_code", "grant_type"],
    ["authorization_code", "code_verifier"],
    ["refresh_token", "client_id"],
    ["refresh_token", "grant_type"],
    ["refresh_token", "refresh_token"],
  ])("rejects a duplicate %s grant field: %s", async (grantType, field) => {
    const params =
      grantType === "authorization_code" ? authorizationParams() : refreshParams();
    params.append(field, params.get(field) as string);
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(params),
      env: ENV,
    });

    expect(response.status).toBe(400);
    expectPrivateResponse(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["code", 4097],
    ["client_id", 257],
    ["redirect_uri", 2049],
    ["code_verifier", 129],
  ])("rejects an oversized authorization-code field: %s", async (field, size) => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams({ [field]: "x".repeat(size) })),
      env: ENV,
    });

    await expectJsonError(response, 400, "invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized refresh token", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(refreshParams({ refresh_token: "x".repeat(4097) })),
      env: ENV,
    });

    await expectJsonError(response, 400, "invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized grant type", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(refreshParams({ grant_type: "x".repeat(65) })),
      env: ENV,
    });

    await expectJsonError(response, 400, "unsupported_grant_type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a mismatched public client ID", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams({ client_id: "other-client-id" })),
      env: ENV,
    });

    await expectJsonError(response, 400, "invalid_client");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a redirect other than the configured same-origin callback", async () => {
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(
        authorizationParams({ redirect_uri: "https://sheetlog.com/other" }),
      ),
      env: ENV,
    });

    await expectJsonError(response, 400, "invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Content-Length only as an early oversized-body rejection", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(refreshParams().toString()));
      },
      cancel,
    });
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(stream, {
        duplex: "half",
        headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
      }),
      env: ENV,
    });

    await expectJsonError(response, 413, "request_too_large");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a streamed body immediately when its actual size crosses 8 KiB", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(
            pulls === 1
              ? new Uint8Array(MAX_BODY_BYTES)
              : new Uint8Array([120]),
          );
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(stream, {
        duplex: "half",
        headers: { "Content-Length": "1" },
      }),
      env: ENV,
    });

    await expectJsonError(response, 413, "request_too_large");
    expect(pulls).toBe(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a body that is exactly 8 KiB", async () => {
    const params = refreshParams();
    params.set("padding", "");
    const paddingLength = MAX_BODY_BYTES - params.toString().length;
    params.set("padding", "x".repeat(paddingLength));
    expect(new TextEncoder().encode(params.toString())).toHaveLength(
      MAX_BODY_BYTES,
    );
    const fetchMock = upstreamFetch();

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(params),
      env: ENV,
    });

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a valid upstream JSON status and parsed body", async () => {
    const providerPayload = {
      error: "invalid_grant",
      error_description: "Authorization code expired.",
      nested: { retryable: false },
    };
    const fetchMock = upstreamFetch(
      Response.json(providerPayload, {
        status: 400,
        headers: { "X-Upstream-Only": "must-not-be-forwarded" },
      }),
    );

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams()),
      env: ENV,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(providerPayload);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("X-Upstream-Only")).toBeNull();
    expectPrivateResponse(response);
  });

  it("returns safe distinct JSON when the upstream body is malformed", async () => {
    const providerMarker = "provider-body-must-not-be-reflected";
    const fetchMock = upstreamFetch(
      new Response(`<html>${providerMarker}`, {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(authorizationParams()),
      env: ENV,
    });

    const payload = await expectJsonError(
      response,
      502,
      "invalid_upstream_response",
    );
    expect(JSON.stringify(payload)).not.toContain(providerMarker);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns a distinct safe JSON error when the upstream request rejects", async () => {
    const rejectionMarker = "network-failure-must-not-be-reflected";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(rejectionMarker));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await createOAuthTokenHandler(fetchMock)({
      request: request(refreshParams()),
      env: ENV,
    });

    const payload = await expectJsonError(
      response,
      502,
      "upstream_unavailable",
    );
    expect(JSON.stringify(payload)).not.toContain(rejectionMarker);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("Cloudflare Pages Function configuration", () => {
  it("pins the production binding and request-signal compatibility flags", () => {
    expect(wranglerSource).toContain('compatibility_date = "2026-08-16"');
    expect(wranglerSource).toMatch(
      /compatibility_flags\s*=\s*\[[^\]]*"enable_request_signal"[^\]]*"request_signal_passthrough"[^\]]*\]/s,
    );
    expect(wranglerSource).toContain("[vars]");
    expect(wranglerSource).toContain(
      `GOOGLE_CLIENT_ID = "${PRODUCTION_CLIENT_ID}"`,
    );
    expect(wranglerSource).toContain('OAUTH_REDIRECT_PATH = "/"');
  });

  it("typechecks the deployed Function and external Function tests", () => {
    const tsconfig = JSON.parse(tsconfigSource) as {
      include?: string[];
    };

    expect(tsconfig.include).toEqual(
      expect.arrayContaining(["functions", "tests"]),
    );
  });
});
