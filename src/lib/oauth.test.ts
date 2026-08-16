import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import envExampleSource from "../../.env.example?raw";
import readmeSource from "../../README.md?raw";
import envTypesSource from "../../vite-env.d.ts?raw";
import oauthCallbackTestSource from "../hooks/useOAuthCallback.test.tsx?raw";

import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  OAUTH_STORAGE_KEYS,
  refreshAccessToken,
} from "./oauth";

const CLIENT_ID = "browser-client-id.apps.googleusercontent.com";
const TOKEN_URL = "/api/oauth/token";
const INVALID_TOKEN_RESPONSE_MESSAGE = "OAuth token response was invalid.";
const nativeObjectHasOwn = Object.hasOwn;
const OAUTH_OWN_PROPERTY_KEYS = new Set<PropertyKey>([
  "access_token",
  "error",
  "expires_in",
  "refresh_token",
  "server_configuration_error",
]);
const browserProductionSources = import.meta.glob(
  ["../**/*", "!../**/*.test.*", "!../test/**"],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as Record<string, string>;

function successfulTokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      access_token: "access-token",
      expires_in: 3600,
      scope: "openid",
      token_type: "Bearer",
      ...overrides,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function oauthErrorResponse(
  status: number,
  error: string,
  errorDescription?: string,
) {
  return Response.json(
    {
      error,
      ...(errorDescription
        ? { error_description: errorDescription }
        : undefined),
    },
    { status },
  );
}

function tokenResponseWithJson(payload: unknown): Response {
  return {
    json: vi.fn().mockResolvedValue(payload),
    ok: true,
    status: 200,
  } as unknown as Response;
}

function oauthErrorResponseWithJson(status: number, payload: unknown): Response {
  return {
    clone: () => tokenResponseWithJson(payload),
    ok: false,
    status,
  } as unknown as Response;
}

function makeObjectHasOwnUnavailable() {
  return vi.spyOn(Object, "hasOwn").mockImplementation((value, key) => {
    if (OAUTH_OWN_PROPERTY_KEYS.has(key)) {
      throw new Error("Object.hasOwn is unavailable");
    }
    return nativeObjectHasOwn(value, key);
  });
}

function expectOAuthObjectHasOwnUnused(
  hasOwnSpy: ReturnType<typeof makeObjectHasOwnUnavailable>,
) {
  expect(
    hasOwnSpy.mock.calls.some(([, key]) => OAUTH_OWN_PROPERTY_KEYS.has(key)),
  ).toBe(false);
}

function parseRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(TOKEN_URL);
  expect(init).toMatchObject({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return Object.fromEntries(
    new URLSearchParams(init.body as URLSearchParams).entries()
  );
}

describe("browser OAuth public-client flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv(
      ["VITE_GOOGLE_CLIENT", "SECRET"].join("_"),
      "must-never-enter-a-browser-request"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("stores PKCE state and builds an S256 authorization request", async () => {
    const authorizationUrl = new URL(await buildAuthorizationUrl());
    const storedState = localStorage.getItem(OAUTH_STORAGE_KEYS.STATE);
    const storedVerifier = localStorage.getItem(
      OAUTH_STORAGE_KEYS.CODE_VERIFIER
    );

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("state")).toBe(storedState);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256"
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    );
    expect(storedVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("sends the exact public-client authorization-code exchange body", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        successfulTokenResponse({ refresh_token: "new-refresh-token" })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    const result = await exchangeCodeForTokens(
      "authorization-code",
      "expected-state"
    );

    const requestBody = parseRequestBody(fetchMock);
    expect(requestBody).not.toHaveProperty(["client", "secret"].join("_"));
    expect(requestBody).toEqual({
      code: "authorization-code",
      client_id: CLIENT_ID,
      redirect_uri: "http://localhost:3000/",
      grant_type: "authorization_code",
      code_verifier: "pkce-verifier",
    });
    expect(result).toEqual({
      access_token: "access-token",
      expires_in: 3600,
      expires_at: 3_601_000,
      refresh_token: "new-refresh-token",
    });
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "new-refresh-token"
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.STATE)).toBeNull();
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER)).toBeNull();
  });

  it("retires an older refresh credential when a successful exchange omits one", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const fetchMock = vi.fn().mockResolvedValue(successfulTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).resolves.toMatchObject({
      access_token: "access-token",
      refresh_token: undefined,
    });

    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    await expect(refreshAccessToken()).rejects.toThrow(
      "No refresh token available - user must re-authenticate",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exchanges a valid token response without Object.hasOwn", async () => {
    const hasOwnSpy = makeObjectHasOwnUnavailable();
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          tokenResponseWithJson({
            access_token: "access-token",
            expires_in: 3600,
            refresh_token: "new-refresh-token",
          }),
        ),
    );

    const result = await exchangeCodeForTokens(
      "authorization-code",
      "expected-state",
    );
    expectOAuthObjectHasOwnUnused(hasOwnSpy);
    hasOwnSpy.mockRestore();
    expect(result).toMatchObject({
      access_token: "access-token",
      refresh_token: "new-refresh-token",
    });
  });

  it("parses a safe proxy error without Object.hasOwn", async () => {
    const hasOwnSpy = makeObjectHasOwnUnavailable();
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          oauthErrorResponse(503, "server_configuration_error"),
        ),
    );

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow("OAuth token service is not configured.");
    expectOAuthObjectHasOwnUnused(hasOwnSpy);
  });

  it("refreshes a valid token response without Object.hasOwn", async () => {
    const hasOwnSpy = makeObjectHasOwnUnavailable();
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        tokenResponseWithJson({
          access_token: "access-token",
          expires_in: 3600,
        }),
      ),
    );

    const result = await refreshAccessToken();
    expectOAuthObjectHasOwnUnused(hasOwnSpy);
    hasOwnSpy.mockRestore();
    expect(result).toMatchObject({
      access_token: "access-token",
      expires_in: 3600,
    });
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
  });

  it("rejects inherited token fields without Object.hasOwn", async () => {
    const hasOwnSpy = makeObjectHasOwnUnavailable();
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        tokenResponseWithJson(
          Object.create({
            access_token: "inherited-access-token",
            expires_in: 3600,
          }),
        ),
      ),
    );

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow(INVALID_TOKEN_RESPONSE_MESSAGE);
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
    expectOAuthObjectHasOwnUnused(hasOwnSpy);
  });

  it("ignores inherited error codes without Object.hasOwn", async () => {
    const hasOwnSpy = makeObjectHasOwnUnavailable();
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        oauthErrorResponseWithJson(
          400,
          Object.create({ error: "invalid_grant" }),
        ),
      ),
    );

    await expect(refreshAccessToken()).rejects.toThrow(
      "OAuth token request failed: 400",
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
    expectOAuthObjectHasOwnUnused(hasOwnSpy);
  });

  it.each([
    {
      label: "malformed JSON",
      response: () =>
        new Response("{sensitive-provider-parser-marker", { status: 200 }),
    },
    {
      label: "null JSON",
      response: () => Response.json(null),
    },
    {
      label: "array JSON",
      response: () => Response.json([]),
    },
    {
      label: "missing token fields",
      response: () => Response.json({}),
    },
    {
      label: "inherited token fields",
      response: () =>
        tokenResponseWithJson(
          Object.create({
            access_token: "inherited-access-token",
            expires_in: 3600,
          }),
        ),
    },
    {
      label: "blank access token",
      response: () =>
        successfulTokenResponse({
          access_token: " ",
          refresh_token: "replacement-refresh-token",
        }),
    },
    {
      label: "non-string access token",
      response: () => successfulTokenResponse({ access_token: 7 }),
    },
    {
      label: "zero expiry",
      response: () => successfulTokenResponse({ expires_in: 0 }),
    },
    {
      label: "negative expiry",
      response: () => successfulTokenResponse({ expires_in: -1 }),
    },
    {
      label: "string NaN expiry",
      response: () => successfulTokenResponse({ expires_in: "NaN" }),
    },
    {
      label: "numeric NaN expiry",
      response: () =>
        tokenResponseWithJson({
          access_token: "access-token",
          expires_in: Number.NaN,
        }),
    },
    {
      label: "Number.MAX_VALUE expiry",
      response: () =>
        successfulTokenResponse({ expires_in: Number.MAX_VALUE }),
    },
    {
      label: "Number.MAX_SAFE_INTEGER expiry",
      response: () =>
        successfulTokenResponse({ expires_in: Number.MAX_SAFE_INTEGER }),
    },
    {
      label: "fractional expiry",
      response: () => successfulTokenResponse({ expires_in: 1.5 }),
    },
    {
      label: "unsafe integer expiry",
      response: () =>
        successfulTokenResponse({
          expires_in: Number.MAX_SAFE_INTEGER + 1,
        }),
    },
    {
      label: "empty refresh token",
      response: () => successfulTokenResponse({ refresh_token: "" }),
    },
    {
      label: "non-string refresh token",
      response: () => successfulTokenResponse({ refresh_token: 42 }),
    },
  ])(
    "rejects a 2xx $label without changing the prior refresh credential",
    async ({ response }) => {
      localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
      localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
      localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

      const error = await exchangeCodeForTokens(
        "authorization-code",
        "expected-state",
      ).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(INVALID_TOKEN_RESPONSE_MESSAGE);
      expect((error as Error).message).not.toContain(
        "sensitive-provider-parser-marker",
      );
      expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
        "refresh-a",
      );
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it("rejects a Date.now-derived unsafe expiry before changing the prior refresh credential", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.spyOn(Date, "now").mockReturnValue(Number.MAX_SAFE_INTEGER - 500);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        successfulTokenResponse({
          expires_in: 1,
          refresh_token: "replacement-refresh-token",
        }),
      ),
    );

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow(INVALID_TOKEN_RESPONSE_MESSAGE);
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
  });

  it("rejects a state mismatch without logging either state value", async () => {
    const storedState = "stored-private-state";
    const receivedState = "received-private-state";
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, storedState);
    const fetchMock = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const error = await exchangeCodeForTokens(
      "authorization-code",
      receivedState
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("OAuth state mismatch");
    expect((error as Error).message).not.toContain(storedState);
    expect((error as Error).message).not.toContain(receivedState);
    expect(logSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a safe provider code without reflecting sensitive details", async () => {
    const authorizationCode = "authorization-code-private-marker";
    const codeVerifier = "pkce-verifier-private-marker";
    const providerDescription = `Expired ${authorizationCode} for ${codeVerifier}`;
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
    const fetchMock = vi.fn().mockResolvedValue(
      oauthErrorResponse(400, "invalid_grant", providerDescription),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const error = await exchangeCodeForTokens(
      authorizationCode,
      "expected-state",
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "OAuth token request failed (invalid_grant).",
    );
    expect((error as Error).message).not.toContain(providerDescription);
    expect((error as Error).message).not.toContain(authorizationCode);
    expect((error as Error).message).not.toContain(codeVerifier);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("treats valid prototype property names as ordinary OAuth error codes", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          oauthErrorResponse(400, "constructor", "untrusted detail"),
        ),
    );

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow("OAuth token request failed (constructor).");
  });

  it.each([
    {
      error: "server_configuration_error",
      expected: "OAuth token service is not configured.",
      label: "missing server configuration",
      status: 503,
    },
    {
      error: "upstream_unavailable",
      expected: "OAuth provider is unavailable.",
      label: "upstream network failure",
      status: 502,
    },
    {
      error: "invalid_upstream_response",
      expected: "OAuth provider returned an invalid response.",
      label: "malformed upstream response",
      status: 502,
    },
  ])("surfaces an actionable message for $label", async ({
    error,
    expected,
    status,
  }) => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(oauthErrorResponse(status, error, "untrusted detail")),
    );

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow(expected);
  });

  it.each([
    {
      label: "non-JSON body",
      response: () =>
        new Response("<html>sensitive upstream body</html>", { status: 502 }),
      status: 502,
    },
    {
      label: "invalid error code",
      response: () =>
        oauthErrorResponse(418, "INVALID-GRANT", "sensitive description"),
      status: 418,
    },
    {
      label: "overlong error code",
      response: () =>
        oauthErrorResponse(500, `a${"b".repeat(64)}`, "sensitive description"),
      status: 500,
    },
  ])("uses only HTTP status for a $label", async ({ response, status }) => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state"),
    ).rejects.toThrow(`OAuth token request failed: ${status}`);
  });

  it("sends the exact public-client refresh body and preserves the stored token", async () => {
    localStorage.setItem(
      OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
      "existing-refresh-token"
    );
    const fetchMock = vi.fn().mockResolvedValue(successfulTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    await refreshAccessToken();

    const requestBody = parseRequestBody(fetchMock);
    expect(requestBody).not.toHaveProperty(["client", "secret"].join("_"));
    expect(requestBody).toEqual({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: "existing-refresh-token",
    });
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "existing-refresh-token"
    );
  });

  it("clears a revoked refresh token without logging response details", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "revoked-token");
    const providerDescription =
      "invalid authorization-code-private-marker pkce-verifier-private-marker";
    const fetchMock = vi.fn().mockResolvedValue(
      oauthErrorResponse(400, "invalid_grant", providerDescription),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshAccessToken()).rejects.toThrow(
      "Refresh token expired or revoked - user must re-authenticate"
    );

    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(providerDescription),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: "OAuth token request failed (invalid_client).",
      label: "400 invalid_client",
      response: () => oauthErrorResponse(400, "invalid_client"),
    },
    {
      expected: "OAuth token request failed (invalid_request).",
      label: "400 invalid_request",
      response: () => oauthErrorResponse(400, "invalid_request"),
    },
    {
      expected: "OAuth token request failed: 400",
      label: "400 malformed body",
      response: () => new Response("sensitive malformed body", { status: 400 }),
    },
    {
      expected: "OAuth token request failed: 400",
      label: "400 invalid error code",
      response: () => oauthErrorResponse(400, "INVALID_GRANT"),
    },
    {
      expected: "OAuth token request failed: 400",
      label: "400 inherited invalid_grant",
      response: () =>
        oauthErrorResponseWithJson(
          400,
          Object.create({ error: "invalid_grant" }),
        ),
    },
    {
      expected: "OAuth token request failed (invalid_grant).",
      label: "401 invalid_grant",
      response: () => oauthErrorResponse(401, "invalid_grant"),
    },
    {
      expected: "OAuth token service is not configured.",
      label: "503 server configuration error",
      response: () =>
        oauthErrorResponse(503, "server_configuration_error"),
    },
    {
      expected: "OAuth token request failed (invalid_grant).",
      label: "500 invalid_grant",
      response: () => oauthErrorResponse(500, "invalid_grant"),
    },
  ])(
    "preserves the initiating refresh token for $label",
    async ({ expected, response }) => {
      localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

      const error = await refreshAccessToken().catch(
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(expected);
      expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
        "refresh-a",
      );
    },
  );

  it("uses safe proxy errors for non-reauthentication refresh failures", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        oauthErrorResponse(
          502,
          "upstream_unavailable",
          "sensitive provider description",
        ),
      ),
    );

    await expect(refreshAccessToken()).rejects.toThrow(
      "OAuth provider is unavailable.",
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
  });

  it("uses only HTTP status for a malformed non-reauthentication refresh error", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("sensitive body", { status: 500 })),
    );

    await expect(refreshAccessToken()).rejects.toThrow(
      "OAuth token request failed: 500",
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
  });

  it("preserves the initiating refresh token for an invalid 2xx token response", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        successfulTokenResponse({
          access_token: "",
          refresh_token: "rotated-refresh-a",
        }),
      ),
    );

    await expect(refreshAccessToken()).rejects.toThrow(
      INVALID_TOKEN_RESPONSE_MESSAGE,
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-a",
    );
  });

  it("preserves a replacement refresh token when an older 2xx response is invalid", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));

    const request = refreshAccessToken();
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-b");
    response.resolve(
      successfulTokenResponse({
        expires_in: "NaN",
        refresh_token: "rotated-refresh-a",
      }),
    );

    await expect(request).rejects.toThrow(INVALID_TOKEN_RESPONSE_MESSAGE);
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-b",
    );
  });

  it("does not delete a replacement refresh token when an older request is revoked", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const response = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const request = refreshAccessToken();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-b");
    response.resolve(oauthErrorResponse(400, "invalid_grant"));

    await expect(request).rejects.toThrow(
      "Refresh token expired or revoked - user must re-authenticate",
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-b",
    );
  });

  it("preserves a replacement refresh token when an older request is not revoked", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));

    const request = refreshAccessToken();
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-b");
    response.resolve(oauthErrorResponse(400, "invalid_client"));

    await expect(request).rejects.toThrow(
      "OAuth token request failed (invalid_client).",
    );
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-b",
    );
  });

  it("does not overwrite a replacement refresh token with an older rotation", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const response = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const request = refreshAccessToken();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-b");
    response.resolve(
      successfulTokenResponse({ refresh_token: "rotated-refresh-a" }),
    );

    await expect(request).resolves.toMatchObject({
      access_token: "access-token",
      refresh_token: "rotated-refresh-a",
    });
    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe(
      "refresh-b",
    );
  });

  it("passes an abort signal to the refresh request", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN, "refresh-a");
    const fetchMock = vi.fn().mockResolvedValue(successfulTokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await refreshAccessToken(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      TOKEN_URL,
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("keeps direct token exchange and secret-only fields out of browser production sources", () => {
    const directTokenEndpoint = ["https://oauth2.googleapis.com", "token"].join(
      "/",
    );
    const forbiddenEnvName = ["VITE_GOOGLE_CLIENT", "SECRET"].join("_");
    const forbiddenFormField = ["client", "secret"].join("_");
    const sources = {
      ...browserProductionSources,
      "../../vite-env.d.ts": envTypesSource,
      "../hooks/useOAuthCallback.test.tsx": oauthCallbackTestSource,
    };
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(["./oauth.ts", "../hooks/useOAuthCallback.ts"]),
    );
    const violations = Object.entries(sources).flatMap(([file, source]) => {
      return [directTokenEndpoint, forbiddenEnvName, forbiddenFormField]
        .filter((term) => source.includes(term))
        .map((term) => `${file}:${term}`);
    });

    expect(violations).toEqual([]);
  });

  it("documents the Pages OAuth token proxy operations contract", () => {
    const serverSecretName = ["GOOGLE_CLIENT", "SECRET"].join("_");
    const secretFormField = ["client", "secret"].join("_");
    const normalizedReadmeSource = readmeSource.replace(/\s+/g, " ");
    const requiredReadmeText = [
      "browser PKCE",
      "same-origin Cloudflare Pages Function",
      "`VITE_GOOGLE_CLIENT_ID` remains a public build variable",
      "`[vars]`",
      "`GOOGLE_CLIENT_ID`",
      "must match the normalized `VITE_BASE_PATH`",
      "`/` in production",
      `\`${serverSecretName}\` is an encrypted Cloudflare Pages runtime secret`,
      "No KV, D1, Durable Object, database, separate Worker, or separate Pages service is required.",
      "npx --yes wrangler@4.123.0 pages dev dist \\",
      `--binding ${serverSecretName}=local-development-secret \\`,
      "--binding OAUTH_REDIRECT_PATH=/",
      `npx --yes wrangler@4.123.0 pages secret put ${serverSecretName} --project-name sheetlog`,
      "Rotate the previously browser-exposed Google OAuth client secret",
      "must not be deployed or merged until the encrypted runtime secret is configured",
      "the source of truth for Pages configuration",
      "`enable_request_signal`",
      "`request_signal_passthrough`",
      "browser CSRF protection, not authentication",
      "bounded input",
      "Cloudflare rate-limit rule",
      `must not report that \`${secretFormField}\` is missing`,
      "installed `https://sheetlog.com` PWA",
      "silent refresh",
      "Vite-prefixed OAuth client-secret variable",
      "Cloudflare logs contain no authorization codes, PKCE verifiers, refresh tokens, access tokens, or secret values",
    ];

    for (const text of requiredReadmeText) {
      expect(normalizedReadmeSource, `README.md is missing: ${text}`).toContain(
        text,
      );
    }
  });

  it("keeps the OAuth client secret out of the Vite environment example", () => {
    const serverSecretName = ["GOOGLE_CLIENT", "SECRET"].join("_");
    const forbiddenViteSecretName = ["VITE_GOOGLE_CLIENT", "SECRET"].join(
      "_",
    );
    const safeComment = `# ${serverSecretName} is a server-only Pages runtime secret; do not add it here.`;

    expect(envExampleSource).toContain(safeComment);
    expect(envExampleSource).toContain(serverSecretName);
    expect(envExampleSource).not.toContain(forbiddenViteSecretName);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
