# Tiny Win Local-First Onboarding Design

**Date:** 2026-08-26

## Goal

Let a new user experience SheetLog's real transaction flow before creating a Google connection, while ensuring the first transaction is created only in the installed PWA's durable local workspace.

## Approved activation flow

1. Detect country and currency from browser locales plus timezone.
2. Show eight popular banks for the detected country, plus Cash and searchable Other bank.
3. Country and currency are independently editable.
4. Selecting a bank configures the first account and opens the existing full Transaction Flow.
5. The first completed transaction is captured but not written to browser IndexedDB.
6. SheetLog stages the setup and transaction in a short-lived, encrypted, authenticated, HttpOnly first-party cookie.
7. Show the Tiny Win installation gate. There is no Continue in browser action.
8. The installed PWA consumes the cookie, creates a synthetic local workspace, imports the transaction idempotently, marks onboarding complete, and reloads into the normal app.
9. The installed app shows a one-time success receipt and then the normal Transaction Flow. No bank picker, Google setup, Sheet setup, or tutorial is repeated.

## Runtime architecture

### Browser activation shell

`TinyWinActivation` owns three states: bank selection, capture, and install. The capture state wraps the existing `TransactionFlow` in a nested `TransactionsContext` provider. Its `addTransaction` implementation stages the bootstrap payload through `/api/bootstrap`; it never writes to Dexie. Existing transaction UI, validation, category selection, amount entry, and receipt rendering remain unchanged.

### Stateless bootstrap handoff

A Cloudflare Pages Function at `/api/bootstrap` accepts same-origin JSON actions:

- `stage`: validate a bounded setup and transaction payload, assign stable bootstrap/transaction IDs when needed, seal it with AES-GCM, and set `__Host-sheetlog_bootstrap` for 30 minutes.
- `consume`: decrypt and validate the cookie, clear it, and return the payload.
- `cancel`: clear the cookie.

The encryption key is a server-only `BOOTSTRAP_ENCRYPTION_KEY` binding. No user account, KV, D1, or permanent server record is introduced. Responses are `Cache-Control: no-store` and expose no CORS headers.

### Installed local workspace

The installed PWA consumes only while running in standalone mode. Import is idempotent by bootstrap ID and transaction ID. It atomically writes:

- confirmed pre-Sheet onboarding settings,
- selected account and currency,
- the first pending local transaction,
- selected tracker `money`, and
- a one-time imported receipt marker.

It then persists local workspace metadata with a stable synthetic user ID and workspace ID and reloads.

### Provider fallbacks

The existing Google providers remain authoritative whenever Google is authenticated. Two narrow fallback providers activate only when local workspace metadata exists:

- `LocalSessionFallbackProvider` exposes a `local` session with a stable synthetic user profile and no access token.
- `LocalWorkspaceFallbackProvider` exposes the synthetic workspace.

`TransactionsProvider` therefore reuses its existing scoped Dexie queue. Sync remains disabled because there is no Google access token. Existing Google account isolation and OAuth behavior are unchanged.

## Locale and bank catalog

The initial bundled catalog covers the countries represented in the approved Tiny Win prototype. Each country includes exactly eight featured institutions with display name, aliases, lettermark, and presentation color. No external bank logos or runtime directory requests are used. Search matches normalized names, aliases, IDs, country names, and country codes.

Country detection prefers a supported timezone country, then a supported locale region, then Thailand as the product fallback. The user-visible country and currency line always remains editable before bank selection.

## Failure handling

- If staging fails, the existing transaction receipt reports the save error and the user remains in capture mode.
- If installation is unavailable, the hard gate shows platform-specific instructions and a supported-browser message; it does not enable browser logging.
- If the bootstrap cookie is missing, invalid, or expired in the installed PWA, activation restarts at bank selection.
- If import is repeated, existing IDs prevent duplicate settings or transactions.
- If local metadata persistence fails after the Dexie import, the import marker remains recoverable and the app retries initialization on the next launch.

## Security and privacy

- Transaction content never appears in URL parameters, browser history, analytics, or the manifest `start_url`.
- The bootstrap cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, host-only, and short-lived.
- The function validates method, origin, media type, body size, field lengths, finite positive amounts, supported transaction types, and expiry.
- The server secret never appears in `VITE_*`, committed configuration, logs, or responses.

## Out of scope

- Migrating the local workspace to a newly connected Google Sheet.
- The post-activation Google backup prompt and PWA re-engagement messaging.
- Bank account aggregation or bank authentication.
- Remote bank-directory updates and official logo licensing.
