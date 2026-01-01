# SheetLog

A mobile-first PWA for rapid financial logging directly into Google Sheets.

## Setup

1. Create a Google OAuth Client ID for a web app.
2. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in your environment.

```bash
cp .env.example .env.local
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static export is emitted to `out/` for GitHub Pages deployment.
