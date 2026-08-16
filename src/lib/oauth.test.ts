import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import envTypesSource from "../../vite-env.d.ts?raw";

import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  OAUTH_STORAGE_KEYS,
  refreshAccessToken,
} from "./oauth";
import oauthSource from "./oauth.ts?raw";

const CLIENT_ID = "browser-client-id.apps.googleusercontent.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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

    expect(parseRequestBody(fetchMock)).toEqual({
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

  it("does not log provider details from a failed code exchange", async () => {
    localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "expected-state");
    localStorage.setItem(OAUTH_STORAGE_KEYS.CODE_VERIFIER, "pkce-verifier");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("sensitive-provider-response", {
        status: 400,
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeCodeForTokens("authorization-code", "expected-state")
    ).rejects.toThrow("Token exchange failed: 400");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sends the exact public-client refresh body and preserves the stored token", async () => {
    localStorage.setItem(
      OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
      "existing-refresh-token"
    );
    const fetchMock = vi.fn().mockResolvedValue(successfulTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    await refreshAccessToken();

    expect(parseRequestBody(fetchMock)).toEqual({
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("sensitive-provider-response", {
        status: 400,
      })
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshAccessToken()).rejects.toThrow(
      "Refresh token expired or revoked - user must re-authenticate"
    );

    expect(localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
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

  it("keeps secret-only OAuth fields out of browser source declarations", () => {
    const forbiddenEnvName = ["VITE_GOOGLE_CLIENT", "SECRET"].join("_");
    const forbiddenFormField = ["client", "secret"].join("_");
    const sources = [
      ["src/lib/oauth.ts", oauthSource],
      ["vite-env.d.ts", envTypesSource],
    ] as const;
    const violations = sources.flatMap(([file, source]) => {
      return [forbiddenEnvName, forbiddenFormField]
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
