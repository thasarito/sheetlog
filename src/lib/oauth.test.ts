import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import envTypesSource from "../../vite-env.d.ts?raw";

import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  OAUTH_STORAGE_KEYS,
  refreshAccessToken,
} from "./oauth";

const CLIENT_ID = "browser-client-id.apps.googleusercontent.com";
const TOKEN_URL = "/api/oauth/token";
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
    response.resolve(new Response("revoked", { status: 400 }));

    await expect(request).rejects.toThrow(
      "Refresh token expired or revoked - user must re-authenticate",
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
    };
    const violations = Object.entries(sources).flatMap(([file, source]) => {
      return [directTokenEndpoint, forbiddenEnvName, forbiddenFormField]
        .filter((term) => source.includes(term))
        .map((term) => `${file}:${term}`);
    });

    expect(violations).toEqual([]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
