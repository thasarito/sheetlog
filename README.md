# SheetLog

An install-first PWA for lightning-fast logging to Google Sheets (Money tracker today; more trackers coming).

## Setup

1. Create a Google OAuth Client ID for a web app.
2. Set `VITE_GOOGLE_CLIENT_ID` in your environment.

```bash
cp .env.example .env.local
```

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

The production build is emitted to `dist/`. Set `VITE_BASE_PATH` for
GitHub Pages-style deployments.
