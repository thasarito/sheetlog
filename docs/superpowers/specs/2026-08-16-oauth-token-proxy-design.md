# OAuth Token Proxy Design

**Date:** 2026-08-16

## Problem

SheetLog's production Google OAuth client is a Web application client. Google
accepts the authorization request for `https://sheetlog.com/`, but rejects both
authorization-code and refresh-token exchanges that omit client authentication:

```text
invalid_request: client_secret is missing
```

The previous implementation worked by embedding `VITE_GOOGLE_CLIENT_SECRET` in
the browser bundle. That preserved the desired login and silent-refresh flow,
but made the secret public. The merged security fix removed the public secret
without adding the server-side exchange required by the existing Google client,
so fresh PWA logins and future refreshes now fail.

## Goal

Restore the same user-visible behavior without returning the client secret to
browser code:

- the same Google authorization screen;
- the same callback at the SheetLog origin root;
- the same long-lived session and silent refresh behavior;
- no additional login prompts caused by this migration.

## Non-goals

- Changing the Google OAuth client type or scopes.
- Adding a database, KV namespace, Durable Object, or separate Worker project.
- Moving refresh-token storage out of the browser in this hotfix.
- Changing onboarding or transaction UI.
- Authenticating Cloudflare or rotating credentials during the code-only phase.

## Architecture

### Browser flow

Authorization remains unchanged. SheetLog generates PKCE state, verifier, and
challenge, stores the state and verifier locally, and redirects to Google with
`https://sheetlog.com/` as the callback.

After the callback validates state and retrieves the verifier, the browser posts
the existing form-encoded token request to the same-origin endpoint:

```text
POST /api/oauth/token
```

Authorization-code requests contain `code`, `client_id`, `redirect_uri`,
`grant_type=authorization_code`, and `code_verifier`. Refresh requests contain
`client_id`, `grant_type=refresh_token`, and `refresh_token`. The browser never
sends or reads the client secret.

The existing access-token, refresh-token, session-generation, cancellation, and
compare-and-swap behavior remains unchanged.

### Cloudflare Pages Function

`functions/api/oauth/token.ts` is deployed inside the existing Cloudflare Pages
project. It does not require another Cloudflare service.

The Function:

1. accepts only same-origin `POST` requests with form-encoded bodies no larger
   than 8 KiB;
2. accepts only `authorization_code` and `refresh_token` grants;
3. validates required fields, rejects duplicate/oversized fields, requires the
   browser's public client ID to match the server-configured public client ID,
   and requires the authorization-code redirect to match the request origin plus
   the server-configured callback path;
4. copies only the allowlisted OAuth fields into a new request body, using the
   server-configured public client ID and callback path instead of trusting
   caller-selected values;
5. injects `client_secret` from `context.env.GOOGLE_CLIENT_SECRET`;
6. sends the request to `https://oauth2.googleapis.com/token`;
7. returns Google's status and parsed JSON body with `Cache-Control: no-store`;
8. turns network failures and malformed upstream bodies into deterministic,
   non-reflective `502` JSON errors;
9. never logs request bodies, authorization codes, verifiers, refresh tokens, or
   the client secret.

If the runtime secret is absent, it returns an actionable `503` JSON error and
does not call Google. Unsupported methods, origins, media types, grants, and
missing fields receive deterministic `4xx` JSON errors.

No CORS support is added. The endpoint exists solely for the SheetLog document
on the same origin. The `Origin` check prevents browser CSRF; it is not client
authentication because non-browser callers can forge it. Binding the client ID
and redirect prevents using SheetLog's secret for another OAuth client. A capped
streaming reader cancels the incoming body as soon as it exceeds 8 KiB, and field
limits provide a second bound after parsing. The endpoint remains publicly
reachable for SheetLog's own OAuth client, so production request volume is
monitored and a Cloudflare route rate-limit rule can be added if abuse appears.

`wrangler.toml` pins the public Google client ID and enables Cloudflare's
incoming request signal and subrequest passthrough compatibility flags. This
lets a canceled browser request cancel the Google subrequest in the deployed
Pages runtime; session-generation and refresh-token compare-and-swap checks
remain the correctness boundary if cancellation arrives too late.

### Client error handling

The browser parses the proxy's OAuth JSON error shape and shows a safe,
actionable message. It accepts only a bounded OAuth `error` identifier and uses
locally defined descriptions for proxy errors; arbitrary provider
`error_description` text is never rendered or logged. Provider response details
remain available in the browser network inspector for diagnosis. Network
failures remain distinguishable from provider rejection, and the callback never
logs caught error objects.

## Configuration and rollout

The code can be implemented and tested without Cloudflare or Google access. It
must not be merged to production until the runtime secret is available.

After implementation:

1. add a replacement secret for the existing Google OAuth Web client while the
   previously browser-exposed secret remains enabled;
2. confirm the public `GOOGLE_CLIENT_ID` and `OAUTH_REDIRECT_PATH` values in
   `wrangler.toml` match the Vite build and OAuth callback configuration, then
   add the replacement secret as an encrypted Cloudflare Pages runtime secret
   named `GOOGLE_CLIENT_SECRET` for production only;
3. deploy the hotfix;
4. verify a harmless invalid-code request reaches Google without returning
   `client_secret is missing`;
5. verify real login and a refresh from the installed `sheetlog.com` PWA;
6. confirm the browser bundle contains no client secret value or
   `VITE_GOOGLE_CLIENT_SECRET` path;
7. remove the old Vite-prefixed Cloudflare binding, then disable and eventually
   delete the old Google secret after a healthy monitoring window.

Git-connected preview deployments remain without the production secret. A
missing preview secret intentionally makes the token route return a safe 503
without failing the preview build. If preview OAuth is deliberately enabled,
it uses a separate preview OAuth client and secret, an exact registered preview
redirect URI, and only trusted reviewed preview code.

The feature branch and pull request remain unmerged until the production part of
step 2 is complete, so the deployed app does not gain an unconfigured production
Function.

## Testing

Test-driven coverage will include:

- successful authorization-code forwarding with the server-only secret;
- successful refresh forwarding with the server-only secret and abort signal;
- rejection for a missing runtime secret without an upstream request;
- rejection for cross-origin, non-POST, unsupported media type, unsupported
  grant, missing required fields, duplicates, oversized bodies/fields, client ID
  mismatch, and a redirect URI that differs from the server-configured
  same-origin callback;
- cancellation of an incoming body stream immediately after the 8 KiB cap;
- deterministic safe handling for an upstream network failure and malformed
  upstream JSON;
- preservation of Google's status and JSON error body with no-store headers;
- client exchanges targeting `/api/oauth/token`, never Google's token endpoint;
- client request bodies never containing `client_secret`;
- Cloudflare compatibility configuration for incoming request cancellation and
  subrequest signal passthrough;
- callback integration tests updated to use the proxy while preserving late
  resolve/reject and refresh-token-retirement behavior;
- existing refresh-token rotation/removal and account-handoff race tests;
- full unit, TypeScript, lint, production build, and local Pages Function smoke
  verification.

## Acceptance criteria

- Fresh login from the installed `https://sheetlog.com` PWA succeeds.
- Silent refresh succeeds with no new user prompt.
- The OAuth client secret exists only as an encrypted Cloudflare runtime secret.
- No separate Cloudflare project or persistent service is introduced.
- Existing transaction and offline behavior remains unchanged.
