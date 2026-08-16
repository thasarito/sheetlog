# SheetLog

An install-first PWA for lightning-fast logging to Google Sheets (Money tracker today; more trackers coming).

## Setup

1. Create a Google Web OAuth client for the app and configure its exact
   JavaScript origins and redirect URIs. Authorization remains a browser PKCE
   flow. Authorization-code and refresh-token grants go through the
   same-origin Cloudflare Pages Function at `/api/oauth/token`.
2. In a Google Maps Platform project with billing enabled, enable the
   **Maps JavaScript API** and **Places API (New)** for the Places picker.
3. Create a browser API key. Set its application restriction to **Websites** and
   allow only the exact HTTP referrers the app uses, for example
   `http://localhost:5173/*` and `https://sheetlog.example.com/*`. Replace these
   examples with the actual development port and deployed origin. Use a separate
   key for preview environments instead of a broad wildcard.
4. Restrict that key's APIs to exactly **Maps JavaScript API** and
   **Places API (New)**. Configure API quotas and Cloud Billing budgets and
   alerts appropriate for the deployment.
5. Set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_MAPS_API_KEY` in your
   environment.

```bash
cp .env.example .env.local
```

`VITE_GOOGLE_MAPS_API_KEY` is shipped to the browser in the built JavaScript.
It is not a secret; referrer and API restrictions are required to limit its use.
All `VITE_*` values are embedded in the browser bundle. Never put an OAuth
client secret in a Vite environment file or another browser build variable.

### OAuth token proxy configuration

`VITE_GOOGLE_CLIENT_ID` remains a public build variable. It must match the
public `GOOGLE_CLIENT_ID` under `[vars]` in `wrangler.toml`. The public
`OAUTH_REDIRECT_PATH` Function binding must match the normalized
`VITE_BASE_PATH` after trailing-slash normalization; both are `/` in production.
The existing public client ID, JavaScript origin, and redirect URI must also
match the Google Web OAuth client configuration.

`GOOGLE_CLIENT_SECRET` is an encrypted Cloudflare Pages runtime secret. It is
never a `VITE_*` variable, build variable, dotenv value, or repository value.
No KV, D1, Durable Object, database, separate Worker, or separate Pages service
is required.

### Local account isolation

The selected Sheet is stored locally under the verified Google account subject,
so switching accounts never reuses another account's workspace or offline
transaction queue. Older unscoped `sheetlog.sheetId` and
`sheetlog.sheetTabId` values are deliberately discarded instead of guessed to
belong to the next signed-in account. After upgrading, an existing user may
therefore need to select their Sheet once; subsequent selections are restored
only for that verified account.

## Development

```bash
npm install
npm run dev
```

Landing page: `/`  
App: `/app`

`npm run dev` chooses a stable port based on the git worktree path (so multiple
worktrees can run side-by-side). Override with `SHEETLOG_DEV_PORT`, or adjust
`SHEETLOG_DEV_PORT_BASE` / `SHEETLOG_DEV_PORT_RANGE`.

### Local OAuth proxy smoke test

The Vite development server does not run Pages Functions. To exercise the
browser and `/api/oauth/token` together, build first and run the generated
`dist` directory in the pinned Pages runtime. The dummy bindings below prove
that the proxy route is present and reaches Google's validation path. They
cannot complete real Google OAuth and are never production values.

```bash
npm run build
npx --yes wrangler@4.123.0 pages dev dist \
  --binding GOOGLE_CLIENT_ID=local-browser-client-id \
  --binding GOOGLE_CLIENT_SECRET=dummy-local-secret \
  --binding OAUTH_REDIRECT_PATH=/
```

For real local OAuth, build with the exact registered client ID and provide its
matching client secret through an ignored `.dev.vars` file. Set
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OAUTH_REDIRECT_PATH` there,
using a local editor and a password manager rather than a command argument or
shell history. Keep `VITE_GOOGLE_CLIENT_ID` in the ignored `.env.local` file in
sync, and register the exact local Pages origin plus redirect path in Google.

### Worktrees

```bash
# from the repo root
npm run worktree -- my-branch
cd ../worktrees/my-branch
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is emitted to `dist/`.

## Deployment (Cloudflare Pages)

- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **SPA routing**: handled via `public/_redirects`
- **Build environment variables** (Cloudflare Pages project settings):
  `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_MAPS_API_KEY`, and optionally
  `VITE_BASE_PATH`

### Wrangler configuration preflight

Before the first deployment that makes `wrangler.toml` the Function
configuration source of truth, compare the existing Pages project configuration
with this repository. Either inspect the Cloudflare dashboard or download the
current supported configuration into a throwaway directory created by
`mktemp -d`:

```bash
migration_dir="$(mktemp -d)"
npx --yes wrangler@4.123.0 pages download config sheetlog --cwd "$migration_dir"
```

Do not run the download command in the repository directory: it can create or
overwrite a Wrangler configuration file. Reconcile the compatibility date and
flags, public and secret bindings, and build output before deployment. Pages
Git build settings remain dashboard-managed, including the build command, root
directory, production branch, and environment variables; supported Function
configuration uses the checked-in `wrangler.toml`.

`wrangler.toml` is the source of truth for supported Pages Function
configuration. Keep its public client and redirect bindings in sync with the
browser build and Google OAuth configuration. Its `enable_request_signal` and
`request_signal_passthrough` compatibility flags allow browser request
cancellation to reach Google's token subrequest; the existing refresh
compare-and-swap and session-generation checks still protect against a late
completion.

### Production OAuth rollout

Use an overlapping rotation so the deployed application always has a working
credential:

1. Create a replacement Google OAuth client secret while the previously exposed
   old secret remains enabled.
2. Configure the replacement in both Pages production and preview. Enter the
   value only at Wrangler's interactive prompt for each command:

```bash
npx --yes wrangler@4.123.0 pages secret put GOOGLE_CLIENT_SECRET --project-name sheetlog --env production
npx --yes wrangler@4.123.0 pages secret put GOOGLE_CLIENT_SECRET --project-name sheetlog --env preview
```

Wrangler defaults to production when `--env` is omitted; the explicit
environment flags make both targets auditable. The preview secret must be
configured before opening a PR or allowing a Git-connected preview deployment,
even if Google preview login is intentionally disabled. The Function must not
be deployed or merged while either required environment is unconfigured.

3. Deploy the Function, then verify the fake-code probe, a real login from the
   installed PWA, and silent refresh while the old secret is still enabled.
4. Disable the old secret only after all production checks pass.
5. Monitor OAuth failures and refresh behavior for a rollback window.
6. Delete the old secret after the monitoring window remains healthy.

Never expose a secret value in a command argument, chat, log, build variable,
dotenv example, or repository file. Confirm again before release that the
existing public client ID and root redirect URI match the Google Web OAuth
client configuration.

### OAuth security and operations

`Origin` validation is browser CSRF protection, not authentication. The server
binds every accepted request to SheetLog's configured client ID and redirect
path, allowlists the supported grants and fields, and applies bounded input
parsing. Monitor `/api/oauth/token` request volume and failures in production;
add a Cloudflare rate-limit rule for the route if abuse appears.

### Post-deployment OAuth checklist

- Send a harmless fake authorization code through the production route. The
  provider may reject the code, but the response must not report that
  `client_secret` is missing.
- Complete a real login from the installed `https://sheetlog.com` PWA.
- Confirm silent refresh succeeds without another authorization prompt.
- Scan the production JavaScript bundle for the rotated secret value,
  any Vite-prefixed OAuth client-secret variable, `client_secret`, and Google's
  direct token endpoint; none may be present.
- Confirm Cloudflare logs contain no authorization codes, PKCE verifiers,
  refresh tokens, access tokens, or secret values.

Use a production Maps browser key restricted to the exact deployed HTTPS
referrer (for example, `https://sheetlog.example.com/*`) and to only the Maps
JavaScript API and Places API (New). Add a preview referrer only when previews
need Places, preferably with a separate preview key. Confirm billing, API
quotas, budget thresholds, and billing alerts before deployment.

### Google place-name storage release gate

Standard [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)
do not authorize durable storage of Google business names. Do not release
selected place-name persistence to production until the product owner has
obtained a written license, exemption, or other right that permits it. Without
that right, disable Google-derived name persistence or store only the Google
Place ID.
