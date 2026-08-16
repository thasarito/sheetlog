# OAuth Token Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore fresh Google login and silent refresh by routing OAuth token grants through a same-origin Cloudflare Pages Function that keeps the Web client secret server-side.

**Architecture:** The existing browser PKCE authorization flow remains unchanged. Browser token requests move from Google's token endpoint to `/api/oauth/token`; a narrowly validated Pages Function reconstructs an allowlisted form body, injects `GOOGLE_CLIENT_SECRET`, forwards it to Google, and returns the provider's JSON response without caching. Refresh tokens remain in browser storage for this hotfix so existing session-generation and compare-and-swap protections remain intact.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Fetch API, Vitest, Vite, Google OAuth 2.0

---

## Task 1: Add the server-only Pages token proxy

**Files:**

- Create: `functions/api/oauth/token.ts`
- Create: `tests/functions/oauthToken.test.ts`
- Modify: `tsconfig.json`
- Modify: `wrangler.toml`

- [ ] **Step 1: Write failing Function contract tests**

Create `tests/functions/oauthToken.test.ts` outside the file-routed `functions/`
tree so test code cannot become a deployed Pages route. Use a small `Request`
factory and an injected `fetch` spy. Cover all of these contracts before adding
production code:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createOAuthTokenHandler } from '../../functions/api/oauth/token';

const APP_URL = 'https://sheetlog.com/api/oauth/token';

function request(body: URLSearchParams, init: RequestInit = {}) {
  return new Request(APP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://sheetlog.com',
    },
    body,
    ...init,
  });
}

// Required test cases:
// 1. authorization_code forwards only code/client_id/redirect_uri/grant_type/
//    code_verifier and injects client_secret from env.
// 2. refresh_token forwards only client_id/grant_type/refresh_token, injects
//    the secret, and forwards request.signal.
// 3. an incoming client_secret and arbitrary extra fields are never forwarded;
//    the configured client ID and derived root redirect are used upstream.
// 4. missing GOOGLE_CLIENT_SECRET or GOOGLE_CLIENT_ID returns 503 and makes
//    zero upstream calls.
// 5. GET returns 405; cross-origin returns 403; wrong content type returns 415.
// 6. unsupported grant and each missing grant-specific field return 400.
// 7. Google's status and JSON body are preserved with Cache-Control: no-store.
// 8. malformed/non-JSON upstream bodies produce a safe 502 JSON response and
//    never echo the provider body.
// 9. rejected upstream fetch produces a distinct safe 502 JSON response.
// 10. duplicate fields, an >8 KiB body, oversized fields, a mismatched client
//     ID, and a redirect other than the configured same-origin callback are
//     rejected before the upstream call.
// 11. an oversized streamed body is canceled as soon as it crosses 8 KiB; use
//     a custom ReadableStream cancel spy and a RequestInit cast for Node's
//     required `duplex: 'half'` test-only option.
// 12. wrangler.toml pins a compatibility date plus enable_request_signal and
//     request_signal_passthrough.
```

The handler under test must accept dependency injection so tests never call the network:

```ts
const upstreamFetch = vi.fn<typeof fetch>().mockResolvedValue(
  Response.json({ access_token: 'access-token', expires_in: 3600 }, { status: 200 }),
);
const handler = createOAuthTokenHandler(upstreamFetch);
const response = await handler({
  request: request(
    new URLSearchParams({
      code: 'authorization-code',
      client_id: 'browser-client-id',
      redirect_uri: 'https://sheetlog.com/',
      grant_type: 'authorization_code',
      code_verifier: 'pkce-verifier',
    }),
  ),
  env: {
    GOOGLE_CLIENT_ID: 'browser-client-id',
    GOOGLE_CLIENT_SECRET: 'server-secret',
    OAUTH_REDIRECT_PATH: '/',
  },
});
```

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```bash
npx vitest run tests/functions/oauthToken.test.ts
```

Expected: FAIL because `functions/api/oauth/token.ts` does not exist.

- [ ] **Step 3: Implement the minimal validated proxy**

Create `functions/api/oauth/token.ts` with local structural Pages types so no new runtime package is required:

```ts
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface OAuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_PATH?: string;
}

interface OAuthTokenContext {
  request: Request;
  env: OAuthEnv;
}

type OAuthTokenHandler = (context: OAuthTokenContext) => Promise<Response>;

const AUTHORIZATION_CODE_FIELDS = [
  'code',
  'client_id',
  'redirect_uri',
  'grant_type',
  'code_verifier',
] as const;
const REFRESH_TOKEN_FIELDS = [
  'client_id',
  'grant_type',
  'refresh_token',
] as const;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_FIELD_LENGTHS: Record<string, number> = {
  client_id: 256,
  code: 4096,
  code_verifier: 128,
  grant_type: 64,
  redirect_uri: 2048,
  refresh_token: 4096,
};

function jsonError(status: number, error: string, description: string) {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  );
}

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | null> {
  if (!body) {
    return '';
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let result = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return result + decoder.decode();
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > limit) {
        await reader.cancel('OAuth token request exceeded the body limit.');
        return null;
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export function createOAuthTokenHandler(
  upstreamFetch: typeof fetch = fetch,
): OAuthTokenHandler {
  return async ({ request, env }) => {
    if (request.method !== 'POST') {
      return jsonError(405, 'method_not_allowed', 'Use POST for OAuth token requests.');
    }

    const requestOrigin = new URL(request.url).origin;
    if (request.headers.get('Origin') !== requestOrigin) {
      return jsonError(403, 'invalid_origin', 'OAuth token requests must be same-origin.');
    }

    const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/x-www-form-urlencoded')) {
      return jsonError(
        415,
        'unsupported_media_type',
        'Use application/x-www-form-urlencoded.',
      );
    }

    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.OAUTH_REDIRECT_PATH
    ) {
      return jsonError(
        503,
        'server_configuration_error',
        'OAuth token service is not configured.',
      );
    }

    const declaredLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      await request.body?.cancel();
      return jsonError(413, 'request_too_large', 'OAuth token request is too large.');
    }
    const inputText = await readBodyWithLimit(request.body, MAX_BODY_BYTES);
    if (inputText === null) {
      return jsonError(413, 'request_too_large', 'OAuth token request is too large.');
    }
    const input = new URLSearchParams(inputText);
    const grantType = input.get('grant_type');
    const fields =
      grantType === 'authorization_code'
        ? AUTHORIZATION_CODE_FIELDS
        : grantType === 'refresh_token'
          ? REFRESH_TOKEN_FIELDS
          : null;
    if (!fields) {
      return jsonError(400, 'unsupported_grant_type', 'Unsupported OAuth grant type.');
    }

    for (const field of fields) {
      const values = input.getAll(field);
      const value = values[0];
      if (values.length !== 1) {
        return jsonError(400, 'invalid_request', `Duplicate field: ${field}.`);
      }
      if (!value?.trim()) {
        return jsonError(400, 'invalid_request', `Missing required field: ${field}.`);
      }
      if (value.length > (MAX_FIELD_LENGTHS[field] ?? 0)) {
        return jsonError(400, 'invalid_request', `Invalid field length: ${field}.`);
      }
    }

    if (input.get('client_id') !== env.GOOGLE_CLIENT_ID) {
      return jsonError(400, 'invalid_client', 'OAuth client does not match this deployment.');
    }

    const redirectPath = env.OAUTH_REDIRECT_PATH;
    if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) {
      return jsonError(
        503,
        'server_configuration_error',
        'OAuth token service is not configured.',
      );
    }
    const expectedRedirectUri = new URL(redirectPath, `${requestOrigin}/`).toString();
    if (
      grantType === 'authorization_code' &&
      input.get('redirect_uri') !== expectedRedirectUri
    ) {
      return jsonError(400, 'invalid_request', 'OAuth redirect does not match this deployment.');
    }

    const body = new URLSearchParams();
    for (const field of fields) {
      body.set(field, input.get(field) as string);
    }
    body.set('client_id', env.GOOGLE_CLIENT_ID);
    if (grantType === 'authorization_code') {
      body.set('redirect_uri', expectedRedirectUri);
    }
    body.set('client_secret', env.GOOGLE_CLIENT_SECRET);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await upstreamFetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: request.signal,
      });
    } catch {
      return jsonError(502, 'upstream_unavailable', 'OAuth provider is unavailable.');
    }

    let payload: unknown;
    try {
      payload = await upstreamResponse.json();
    } catch {
      return jsonError(502, 'invalid_upstream_response', 'OAuth provider returned invalid JSON.');
    }

    return Response.json(payload, {
      status: upstreamResponse.status,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    });
  };
}

export const onRequest = createOAuthTokenHandler();
```

Implementation rules:

- Require `request.method === 'POST'`.
- Require `Origin` to equal `new URL(request.url).origin`; do not add CORS headers.
- Accept content types beginning with `application/x-www-form-urlencoded`.
- Require public `GOOGLE_CLIENT_ID`, public `OAUTH_REDIRECT_PATH`, and secret
  `GOOGLE_CLIENT_SECRET` bindings before any Google request.
- Accept only `authorization_code` and `refresh_token`.
- Reject blank, missing, duplicate, and oversized required fields; reject bodies
  larger than 8 KiB.
- Require the incoming client ID to match `env.GOOGLE_CLIENT_ID` and forward the
  environment value.
- Require authorization-code `redirect_uri` to equal the request origin plus
  `env.OAUTH_REDIRECT_PATH` and forward that server-derived value.
- Enforce the 8 KiB body limit while streaming and cancel the reader as soon as
  the cap is crossed; use `Content-Length` only as an early fast rejection.
- Reconstruct the outbound form from the selected allowlist; never clone the raw body.
- Append exactly one `client_secret` from `env`.
- Forward `request.signal`.
- Parse upstream JSON and preserve only its parsed JSON value, status, and JSON content type.
- Always set `Cache-Control: no-store` and `Pragma: no-cache`.
- Return safe JSON for local validation and malformed-upstream errors.
- Do not log any input or upstream payload.

Add `functions` and `tests` to `tsconfig.json`'s `include` array so the handler
and its external tests are typechecked with the app. No `.test.ts` file may live
under `functions/`, because Cloudflare maps files in that directory to routes.

Update `wrangler.toml` so deployed request cancellation works as tested and the
Function is bound to the existing public client:

```toml
name = "sheetlog"
pages_build_output_dir = "dist"
compatibility_date = "2026-08-16"
compatibility_flags = ["enable_request_signal", "request_signal_passthrough"]

[vars]
GOOGLE_CLIENT_ID = "258969467044-ptakke7dl5fe9m2lqf80o62nik2572jd.apps.googleusercontent.com"
OAUTH_REDIRECT_PATH = "/"
```

- [ ] **Step 4: Run Function tests, typecheck, and lint**

Run:

```bash
npx vitest run tests/functions/oauthToken.test.ts
npx tsc --noEmit
npx biome check functions/api/oauth/token.ts tests/functions/oauthToken.test.ts tsconfig.json
```

Expected: all pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add functions/api/oauth/token.ts tests/functions/oauthToken.test.ts tsconfig.json wrangler.toml
git commit -m "feat: proxy OAuth token grants server-side"
```

## Task 2: Route the browser OAuth client through the proxy

**Files:**

- Modify: `src/lib/oauth.ts`
- Modify: `src/lib/oauth.test.ts`
- Modify: `src/hooks/useOAuthCallback.ts`
- Modify: `src/hooks/useOAuthCallback.test.tsx`

- [ ] **Step 1: Replace the public-client success assumptions with failing proxy tests**

Update `src/lib/oauth.test.ts` before production code:

```ts
const TOKEN_URL = '/api/oauth/token';

function oauthErrorResponse(
  status: number,
  error: string,
  errorDescription?: string,
) {
  return Response.json(
    {
      error,
      ...(errorDescription ? { error_description: errorDescription } : {}),
    },
    { status },
  );
}
```

Change both request-body assertions to expect `/api/oauth/token` and retain the assertion that no `client_secret` is present. Add tests for:

```ts
it('surfaces a safe provider error from a failed code exchange', async () => {
  // Arrange valid state/verifier and a proxy 400:
  // { error: 'invalid_grant', error_description: 'Authorization code expired.' }
  // Assert the rejection names invalid_grant but does not reflect the arbitrary
  // provider description, code, or verifier and never logs.
});

it('surfaces a missing server configuration error', async () => {
  // Proxy returns 503 { error: 'server_configuration_error',
  // error_description: 'OAuth token service is not configured.' }
  // Assert the actionable message is preserved.
});

it('falls back to the HTTP status for malformed proxy errors', async () => {
  // 502 text/html; assert "OAuth token request failed: 502" and no body echo.
});
```

Keep all existing refresh-token CAS, abort-signal, state, and refresh-token retirement tests unchanged except for the endpoint expectation.

Update every direct token-endpoint branch in
`src/hooks/useOAuthCallback.test.tsx` to match `/api/oauth/token`. Retain its real
OAuth integration coverage for refresh-token retirement, cancellation-ignoring
late resolve, cancellation-ignoring late reject, and account-B preservation.
Add one callback rejection assertion proving an upstream description containing
an authorization code/verifier-shaped marker is neither rendered nor passed to
`console.error`.

- [ ] **Step 2: Run the focused client tests and witness RED**

Run:

```bash
npx vitest run src/lib/oauth.test.ts
```

Expected: FAIL because the browser still calls Google directly and emits only status-based errors.

- [ ] **Step 3: Implement the proxy endpoint and safe OAuth error parser**

In `src/lib/oauth.ts`:

```ts
const OAUTH_TOKEN_PROXY_URL = '/api/oauth/token';

interface OAuthErrorResponse {
  error?: unknown;
}

const SAFE_PROXY_ERROR_MESSAGES: Record<string, string> = {
  invalid_upstream_response: 'OAuth provider returned an invalid response.',
  server_configuration_error: 'OAuth token service is not configured.',
  upstream_unavailable: 'OAuth provider is unavailable.',
};

async function createOAuthTokenError(response: Response): Promise<Error> {
  try {
    const payload = (await response.clone().json()) as OAuthErrorResponse;
    if (
      typeof payload.error === 'string' &&
      /^[a-z][a-z0-9_]{0,63}$/.test(payload.error)
    ) {
      const safeMessage = SAFE_PROXY_ERROR_MESSAGES[payload.error];
      return new Error(
        safeMessage ?? `OAuth token request failed (${payload.error}).`,
      );
    }
  } catch {
    // Fall through to the safe status-only message.
  }
  return new Error(`OAuth token request failed: ${response.status}`);
}
```

Use `OAUTH_TOKEN_PROXY_URL` in both `exchangeCodeForTokens` and `refreshAccessToken`. On non-OK exchange, throw `await createOAuthTokenError(response)`. On refresh 400/401, preserve the existing compare-and-swap removal and user-facing reauthentication message. On other refresh errors, throw the parsed safe OAuth error. Do not change authorization URLs, redirect URIs, PKCE/state cleanup, token persistence, abort forwarding, or refresh CAS behavior.

In `src/hooks/useOAuthCallback.ts`, keep the UI state based on the already-safe
`Error.message`, but remove callback error logging entirely:

```ts
} catch (error) {
  hasProcessedRef.current = false;
  setState({
    isProcessing: false,
    error:
      error instanceof Error
        ? error.message
        : 'Failed to complete authentication',
  });
}
```

- [ ] **Step 4: Run client and combined OAuth tests**

Run:

```bash
npx vitest run src/lib/oauth.test.ts src/hooks/useOAuthCallback.test.tsx tests/functions/oauthToken.test.ts
npx tsc --noEmit
npx biome check src/lib/oauth.ts src/lib/oauth.test.ts src/hooks/useOAuthCallback.ts src/hooks/useOAuthCallback.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Prove the browser source has no direct token exchange or secret path**

Run:

```bash
rg -n "oauth2.googleapis.com/token|VITE_GOOGLE_CLIENT_SECRET|client_secret" src vite-env.d.ts
```

Expected: no matches. The Pages Function is the only source file allowed to contain `client_secret` or Google's token endpoint.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/oauth.ts src/lib/oauth.test.ts src/hooks/useOAuthCallback.ts src/hooks/useOAuthCallback.test.tsx
git commit -m "fix: route OAuth tokens through Pages"
```

## Task 3: Document local and production configuration

**Files:**

- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Add an operations contract to the README**

Replace the public-client/server-side ambiguity in Setup and Deployment with the implemented architecture:

- `VITE_GOOGLE_CLIENT_ID` remains a public build variable.
- `wrangler.toml` pins the same public value as `GOOGLE_CLIENT_ID` for the
  Function and must stay in sync with the Vite build variable.
- `OAUTH_REDIRECT_PATH` is a public Function variable and must match
  `VITE_BASE_PATH` after trailing-slash normalization (`/` in production).
- `GOOGLE_CLIENT_SECRET` is a Cloudflare Pages Function runtime secret, never a `VITE_*` value.
- No KV, D1, Durable Object, or separate Worker/Pages project is required.
- `Origin` validation is browser-CSRF protection, not authentication. The
  Function binds the request to SheetLog's configured client ID and root
  redirect, applies bounded input parsing, and production request volume should
  be monitored; add a Cloudflare route rate-limit rule if abuse appears.
- `wrangler.toml` enables `enable_request_signal` and
  `request_signal_passthrough` so deployed cancellation reaches Google's
  subrequest. Refresh CAS/session generation still handles late completion.
- Local full-stack development uses a Pages runtime, for example:

```bash
npm run build
npx --yes wrangler@4.123.0 pages dev dist \
  --binding GOOGLE_CLIENT_ID=local-browser-client-id \
  --binding GOOGLE_CLIENT_SECRET=local-development-secret \
  --binding OAUTH_REDIRECT_PATH=/
```

- Production setup uses:

```bash
npx --yes wrangler@4.123.0 pages secret put GOOGLE_CLIENT_SECRET --project-name sheetlog
```

- State that the previously exposed Google secret must be rotated before rollout.
- State that code must not be deployed until the runtime secret is configured.
- Include the post-deploy fake-code diagnostic and real installed-PWA login/refresh checks without printing secrets.

Leave `.env.example` free of `GOOGLE_CLIENT_SECRET` and add a comment explaining that it belongs in the server runtime, not Vite:

```dotenv
# GOOGLE_CLIENT_SECRET is a server-only Pages runtime secret; do not add it here.
```

- [ ] **Step 2: Add a documentation/source guard**

Extend the existing OAuth source guard test so it also reads `.env.example` and
fails if `VITE_GOOGLE_CLIENT_SECRET` appears. It may allow the explanatory
non-Vite `GOOGLE_CLIENT_SECRET` comment. Include
`src/hooks/useOAuthCallback.test.tsx` in the direct-Google-endpoint source scan.

- [ ] **Step 3: Run docs/source verification**

Run:

```bash
npx vitest run src/lib/oauth.test.ts
npx biome check src/lib/oauth.test.ts
rg -n "VITE_GOOGLE_CLIENT_SECRET" . --glob '!node_modules/**' --glob '!docs/superpowers/**'
```

Expected: tests and TypeScript lint pass; ripgrep returns no matches outside
historical design/plan documentation. Markdown and dotenv correctness are
checked by review/source guards because Biome does not parse those paths.

- [ ] **Step 4: Commit Task 3**

```bash
git add README.md .env.example src/lib/oauth.test.ts
git commit -m "docs: configure the OAuth token proxy"
```

## Task 4: Verify the complete hotfix without credentials

**Files:**

- Verify only; fix only defects attributable to Tasks 1–3.

- [ ] **Step 1: Run the complete project gate**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: all commands exit 0. Existing informational Biome schema, Browserslist, or bundle-size warnings may remain.

- [ ] **Step 2: Scan the production browser bundle**

Run:

```bash
rg -n "VITE_GOOGLE_CLIENT_SECRET|client_secret|oauth2.googleapis.com/token" dist src vite-env.d.ts
```

Expected: no matches in `dist`, `src`, or `vite-env.d.ts`. The server Function is intentionally outside the Vite build and is not included in this scan.

- [ ] **Step 3: Smoke-test the Pages Function locally**

Build and launch the actual Pages runtime with a dummy secret, then issue a harmless invalid-code request from the same origin:

```bash
npm run build
npx --yes wrangler@4.123.0 pages dev dist \
  --binding GOOGLE_CLIENT_ID=fake-client \
  --binding GOOGLE_CLIENT_SECRET=dummy-local-secret \
  --binding OAUTH_REDIRECT_PATH=/ \
  --port 8788
```

In another shell:

```bash
curl -sS -D - \
  -H 'Origin: http://localhost:8788' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=authorization_code&client_id=fake-client&redirect_uri=http%3A%2F%2Flocalhost%3A8788%2F&code=fake-code&code_verifier=fake-verifier' \
  http://localhost:8788/api/oauth/token
```

Expected: the route is served by Pages Functions, returns JSON with `Cache-Control: no-store`, and the response is from Google's validation path rather than the Function's missing-secret error. Do not use a real secret in this code-only smoke test.

- [ ] **Step 4: Request independent final review**

Review the full branch against `docs/superpowers/specs/2026-08-16-oauth-token-proxy-design.md`, emphasizing:

- server-only secret boundary;
- same-origin and allowlist validation;
- no token/secret logging or reflection;
- preserved refresh-token CAS and auth handoff behavior;
- Cloudflare Pages routing/build compatibility;
- deployment remains blocked until the encrypted runtime secret is configured.

## Task 5: Authenticate, configure, deploy, and verify (deferred until code passes)

**Files:**

- No source changes expected.

- [ ] **Step 1: Rotate the exposed Google OAuth Web client secret**

Use Google Cloud Console (or authenticated Google tooling) to create a replacement secret for the existing Web client. Never paste the value into chat, a shell history transcript, a Vite variable, or the repository.

- [ ] **Step 2: Authenticate Wrangler and add the encrypted Pages secret**

Run interactively:

```bash
npx --yes wrangler@4.123.0 login
npx --yes wrangler@4.123.0 pages secret put GOOGLE_CLIENT_SECRET --project-name sheetlog
```

Verify the binding exists for the production Pages environment without printing its value.

- [ ] **Step 3: Publish via pull request and wait for Cloudflare success**

Push `fix/oauth-token-proxy`, open a focused PR, merge only after checks pass and the runtime secret is present, then wait for the production Pages deployment to succeed.

- [ ] **Step 4: Verify production behavior**

Verify all of the following:

- `https://sheetlog.com/api/oauth/token` rejects GET safely and carries no cacheable token response.
- A fake authorization code reaches Google but does not return `client_secret is missing`.
- Fresh login succeeds from the installed `https://sheetlog.com` PWA.
- Silent refresh succeeds without another prompt.
- The production JS bundle contains neither the secret value nor `VITE_GOOGLE_CLIENT_SECRET`, `client_secret`, or Google's token endpoint.
- Cloudflare logs contain no authorization codes, verifiers, refresh tokens, access tokens, or secret values.
