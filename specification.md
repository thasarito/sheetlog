# SheetLog PWA - Technical Specification

## 1. Executive Summary

A mobile-first Progressive Web App (PWA) designed for rapid financial logging directly into Google Sheets. The app prioritizes speed, offline capability, and low friction, acting as a smart frontend for the user's own spreadsheet backend.

## 2. User Requirements & Configuration

Based on the Expert Panel decisions:

- **Speed Strategy**: "Now" default, with easy "Yesterday" toggle.
- **Categorization**: Smart/Recent sorting.
- **Tagging**: Toggle Chips for widespread tags (e.g., #Trip, #Business).
- **Feedback**: Toast with Undo capability.
- **Stack**: Vite + React (SPA build) on GitHub Pages.
- **Offline**: Queue & Sync strategy.
- **Auth**: Long-term persistence for convenience.
- **Data Model**: App-managed Sheet structure.
- **Ecosystem**: Client-side Google Sheets API integration.

## 3. Architecture

### 3.1 Tech Stack

- **Framework**: Vite + React 18.
- **Routing**: TanStack Router.
- **Build Mode**: Vite static SPA build (`dist/`).
- **Language**: TypeScript.
- **Styling**: TailwindCSS + Shadcn/UI (Radix Primitives).
- **Icons**: Lucide React.
- **State Management**: React Context + Hooks.
- **Data Fetching**: TanStack Query.
- **Forms & Validation**: TanStack Form + Zod.
- **Local Database**: Dexie.js (IndexedDB wrapper) for offline queue and caching settings.
- **Date Handling**: `date-fns`.
- **Animations**: `framer-motion` (for smooth transitions).

### 3.2 Deployment Architecture

- **Host**: GitHub Pages.
- **CI/CD**: GitHub Actions (Vite Build -> Deploy to gh-pages branch).
- **Serverless**: None. Pure Client-Side SPA behavior.

### 3.3 Data Flow

1.  **Input**: User enters data in PWA.
2.  **Local Persist**: Data immediately saved to `TransactionsQueue` in IndexedDB (Status: `pending`).
3.  **Sync Attempt**:
    - If Online: App attempts to push to Google Sheet via API.
    - If Offline: Sync relies on `navigator.onLine` events or manual retry.
4.  **Success**: Transaction moved from `pending` to `synced` in local DB (or cleared, depending on history retention policy) and user notified via Toast.
5.  **Failure**: Retained in `pending` with error state.

## 4. Feature Specifications

### 4.1 Onboarding & Auth

- **Provider**: Google Identity Services (GIS).
- **Scopes**:
  - `https://www.googleapis.com/auth/spreadsheets` (Read/Write sheets).
  - `https://www.googleapis.com/auth/drive.file` (Create new sheet if needed).
- **Flow**:
  1.  User clicks "Connect Google Account".
  2.  Google Pop-up.
  3.  App receives Access Token.
  4.  Token stored in LocalStorage (Note: Expiry handling required - likely simple re-auth prompt when expired as refresh tokens are harder in pure client-side implicit flows, though GIS aids this).
  5.  App checks for file named "SheetLog_DB" in Drive.
      - _Found_: Load Metadata.
      - _Not Found_: Create new Sheet with headers.

### 4.2 Core Transaction Flow

1.  **Step 1: Type Selection (Splash Screen)**
    - Big Buttons: Expense | Income | Transfer.
    - Transition: Slide Left.
2.  **Step 2: Category & Tags**
    - Top: Frequent Categories (Grid).
    - Bottom: "Other" list.
    - Middle: Toggle Chips for Tags.
    - Selection auto-advances or User clicks "Next"? -> _Decision: Auto-advance on Category select if not multi-select._
3.  **Step 3: Amount & Details**
    - Large Numeric Keypad (Phone style).
    - Date Toggle: [Today] vs [Yesterday] vs [Calendar].
    - Note Input (Optional).
    - Big "Check" button to Submit.

### 4.3 Offline & Sync

- **Detection**: React hook listening to `window.addEventListener('online')`.
- **Indicator**: Small status dot (Green/Orange).
- **Conflict Resolution**: Append-only log. No editing of past rows to minimize complexity. "Undo" implementation deletes the _last added row_ if session is still active, otherwise compensatory entry (negation) is safer, but API allows specific row deletion so we will try that for immediate Undo.

## 5. Security Model

- **Credentials**: Use User's own Google Credentials. The App ID (ClientId) is public but restricted by Origin (GitHub Pages URL).
- **Token Storage**: LocalStorage. Risk is acceptable per user choice "Maximum Convenience" for a personal finance tool.
- **Privacy**: Zero data usage tracking. Direct communication User <-> Google.

## 6. Sheet Structure (App Managed)

- **Sheet Name**: `SheetLog_DB`
- **Tab Name**: `Transactions`
- **Columns**:
  - `A`: Date (ISO or User Locale)
  - `B`: Type (Expense/Income)
  - `C`: Amount
  - `D`: Category
  - `E`: Tags (Comma separated)
  - `F`: Note
  - `G`: Timestamp (Metadata)
  - `H`: Device/Source (Metadata)
