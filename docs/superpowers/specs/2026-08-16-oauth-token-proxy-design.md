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

1. accepts only same-origin `POST` requests with form-encoded bodies;
2. accepts only `authorization_code` and `refresh_token` grants;
3. validates the required fields for the selected grant;
4. copies only the allowlisted OAuth fields into a new request body;
5. injects `client_secret` from `context.env.GOOGLE_CLIENT_SECRET`;
6. sends the request to `https://oauth2.googleapis.com/token`;
7. returns Google's status and JSON body with `Cache-Control: no-store`;
8. never logs request bodies, authorization codes, verifiers, refresh tokens, or
   the client secret.

If the runtime secret is absent, it returns an actionable `503` JSON error and
does not call Google. Unsupported methods, origins, media types, grants, and
missing fields receive deterministic `4xx` JSON errors.

No CORS support is added. The endpoint exists solely for the SheetLog document
on the same origin.

### Client error handling

The browser parses the proxy's OAuth JSON error shape and shows a safe,
actionable message. Provider `error` and `error_description` values may be used
for diagnosis, but token bodies and secret values are never included in errors
or logs. Network failures remain distinguishable from provider rejection.

## Configuration and rollout

The code can be implemented and tested without Cloudflare or Google access. It
must not be merged to production until the runtime secret is available.

After implementation:

1. rotate the previously browser-exposed secret for the existing Google OAuth
   Web client;
2. add the replacement as an encrypted Cloudflare Pages runtime secret named
   `GOOGLE_CLIENT_SECRET` for production (and preview when preview login is
   intentionally tested);
3. deploy the hotfix;
4. verify a harmless invalid-code request reaches Google without returning
   `client_secret is missing`;
5. verify real login and a refresh from the installed `sheetlog.com` PWA;
6. confirm the browser bundle contains no client secret value or
   `VITE_GOOGLE_CLIENT_SECRET` path.

The feature branch and pull request remain unmerged until step 2 is complete, so
the deployed app does not gain an unconfigured Function.

## Testing

Test-driven coverage will include:

- successful authorization-code forwarding with the server-only secret;
- successful refresh forwarding with the server-only secret and abort signal;
- rejection for a missing runtime secret without an upstream request;
- rejection for cross-origin, non-POST, unsupported media type, unsupported
  grant, and missing required fields;
- preservation of Google's status and JSON error body with no-store headers;
- client exchanges targeting `/api/oauth/token`, never Google's token endpoint;
- client request bodies never containing `client_secret`;
- existing refresh-token rotation/removal and account-handoff race tests;
- full unit, TypeScript, lint, production build, and local Pages Function smoke
  verification.

## Acceptance criteria

- Fresh login from the installed `https://sheetlog.com` PWA succeeds.
- Silent refresh succeeds with no new user prompt.
- The OAuth client secret exists only as an encrypted Cloudflare runtime secret.
- No separate Cloudflare project or persistent service is introduced.
- Existing transaction and offline behavior remains unchanged.
