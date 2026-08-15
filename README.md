# SheetLog

An install-first PWA for lightning-fast logging to Google Sheets (Money tracker today; more trackers coming).

## Setup

1. Create a Google OAuth client for the app and configure its exact JavaScript
   origins and redirect URIs. The browser build may use only a public OAuth
   client with PKCE; never give it an OAuth client secret. If the selected OAuth
   client requires a secret, perform the code and refresh-token exchanges in a
   server-side service instead.
2. In a Google Maps Platform project with billing enabled, enable only the
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

Do not configure an OAuth client secret as a Cloudflare Pages build variable.
Cloudflare passes the value to Vite, which would expose it in the generated
browser JavaScript. Use public-client OAuth with PKCE, or keep any required
secret and token exchange in a server-side service.

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
