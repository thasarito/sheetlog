# Tiny Win Local-First Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google-first onboarding with Tiny Win bank selection, one capture-only transaction, mandatory installation, and idempotent import into an installed local workspace.

**Architecture:** Keep the existing `TransactionFlow` and Google providers intact. Add pure catalog/bootstrap modules, a stateless encrypted Cloudflare handoff, narrow local-session/workspace fallback providers, and a Tiny Win activation shell that overrides only `TransactionsContext.addTransaction` during the browser trial.

**Tech Stack:** React 18, TypeScript, TanStack Query/Form, Dexie, Cloudflare Pages Functions Web Crypto, Vite PWA, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-tiny-win-local-first-onboarding-design.md`

## Global Constraints

- Do not persist the first transaction in browser IndexedDB before installation.
- Do not put bootstrap data or identifiers in URL parameters or PWA `start_url`.
- Do not add a Continue in browser path.
- Preserve existing OAuth callback, Google account isolation, and Sheet sync behavior.
- Use lettermarks rather than externally sourced bank logos.
- Do not use `shadow` utility classes.
- Do not trigger or rely on GitHub Actions; inspect code and diffs instead.

---

### Task 1: Bank catalog and locale resolution

**Files:**
- Create: `src/lib/bankCatalog.test.ts`
- Create: `src/lib/bankCatalog.ts`

**Interfaces:**
- Produces: `detectBankCountry(locales, timezone)`, `getCountryCatalog(code)`, `searchBankCatalog(query, countryCode)`, `SUPPORTED_CURRENCIES`.

- [ ] Write tests covering timezone preference, locale fallback, independent currency data, eight featured banks, Thai aliases, and global search.
- [ ] Verify the tests fail because the module is missing.
- [ ] Implement the immutable bundled catalog and pure normalization/search functions.
- [ ] Verify the targeted tests pass.

### Task 2: Bootstrap payload validation and encrypted Pages Function

**Files:**
- Create: `src/lib/bootstrapPayload.test.ts`
- Create: `src/lib/bootstrapPayload.ts`
- Create: `tests/functions/bootstrap.test.ts`
- Create: `functions/api/bootstrap.ts`

**Interfaces:**
- Produces: `BootstrapSetup`, `BootstrapTransaction`, `BootstrapPayload`, `validateBootstrapStageInput`, `validateBootstrapPayload`, `createBootstrapHandler`.

- [ ] Write pure validation tests and function-handler tests for stage, consume, cancel, same-origin enforcement, bounded bodies, expiry, cookie flags, and tamper rejection.
- [ ] Verify tests fail because the modules are missing.
- [ ] Implement strict validation plus AES-GCM sealing/unsealing using a SHA-256-derived key.
- [ ] Verify targeted tests pass.

### Task 3: Local workspace metadata and idempotent import

**Files:**
- Create: `src/lib/localWorkspace.test.ts`
- Create: `src/lib/localWorkspace.ts`
- Create: `src/lib/bootstrapImport.test.ts`
- Create: `src/lib/bootstrapImport.ts`
- Modify: `src/lib/constants.ts`

**Interfaces:**
- Produces: `readLocalWorkspace`, `writeLocalWorkspace`, `clearLocalWorkspace`, `importBootstrapPayload`, `readImportedBootstrapReceipt`, `clearImportedBootstrapReceipt`.

- [ ] Write tests for metadata corruption handling, stable IDs, duplicate import protection, confirmed settings, transaction scope, and one-time receipt state.
- [ ] Verify tests fail before implementation.
- [ ] Implement metadata storage and a Dexie transaction that writes settings, selected app, transaction, and import markers.
- [ ] Verify targeted tests pass.

### Task 4: Local provider fallbacks and app phase

**Files:**
- Create: `src/app/providers/local/LocalSessionFallbackProvider.test.tsx`
- Create: `src/app/providers/local/LocalSessionFallbackProvider.tsx`
- Create: `src/app/providers/local/LocalWorkspaceFallbackProvider.test.tsx`
- Create: `src/app/providers/local/LocalWorkspaceFallbackProvider.tsx`
- Modify: `src/app/providers/AppProviders.tsx`
- Modify: `src/app/providers/session/session.types.ts`
- Modify: `src/hooks/useAppPhase.test.tsx`
- Modify: `src/hooks/useAppPhase.ts`

**Interfaces:**
- Consumes: local workspace metadata from Task 3.
- Produces: session status `local` and a ready app phase without a Google access token.

- [ ] Write provider and phase tests proving local fallback activation and Google precedence.
- [ ] Verify tests fail.
- [ ] Implement nested fallback providers and local phase handling.
- [ ] Verify targeted tests pass.

### Task 5: Bootstrap client and capture-only transaction adapter

**Files:**
- Create: `src/lib/bootstrapClient.test.ts`
- Create: `src/lib/bootstrapClient.ts`
- Create: `src/components/TinyWinOnboarding/BootstrapTransactionsProvider.test.tsx`
- Create: `src/components/TinyWinOnboarding/BootstrapTransactionsProvider.tsx`

**Interfaces:**
- Produces: `stageBootstrap`, `consumeBootstrap`, `cancelBootstrap`, and a nested transactions provider that returns a synthetic pending `TransactionRecord` without touching Dexie.

- [ ] Write tests for request credentials/content type, response errors, stable staged records, capture callback, and cancel-based undo.
- [ ] Verify tests fail.
- [ ] Implement the client and adapter.
- [ ] Verify targeted tests pass.

### Task 6: Tiny Win bank picker and mandatory install gate

**Files:**
- Create: `src/components/TinyWinOnboarding/TinyWinActivation.test.tsx`
- Create: `src/components/TinyWinOnboarding/TinyWinActivation.tsx`
- Create: `src/components/TinyWinOnboarding/BankPickerScreen.tsx`
- Create: `src/components/TinyWinOnboarding/InstallGateScreen.tsx`
- Create: `src/components/TinyWinOnboarding/ImportedReceipt.tsx`
- Create: `src/components/TinyWinOnboarding/index.ts`
- Create: `src/lib/pwa.ts`

**Interfaces:**
- Consumes: catalog, bootstrap client, capture provider, onboarding mutation.
- Produces: bank -> existing Transaction Flow -> Tiny Win installation gate.

- [ ] Write component tests for detected defaults, independent country/currency edits, featured bank selection, alias search, capture transition, and absence of Continue in browser.
- [ ] Verify tests fail.
- [ ] Implement the playful Tiny Win layout with lettermarks, compact mascot treatment, and platform install instructions.
- [ ] Verify targeted tests pass.

### Task 7: Installed bootstrap consumption and app routing

**Files:**
- Modify: `src/routes/HomePage.tsx`
- Modify: `vite.config.ts`
- Create: `src/routes/HomePage.tinyWin.test.tsx`

**Interfaces:**
- Consumes: standalone detection, consume client, import function, local phase, imported receipt.
- Produces: browser activation, installed import/reload, one-time receipt, and normal local logging.

- [ ] Write tests for browser activation, standalone consume, missing-cookie fallback, local-ready rendering, and imported receipt dismissal.
- [ ] Verify tests fail.
- [ ] Implement the routing/state transitions and change manifest `start_url` to the root application entry.
- [ ] Verify targeted tests pass.

### Task 8: Documentation and final review

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `wrangler.toml` only if a public non-secret binding is necessary.

- [ ] Document `BOOTSTRAP_ENCRYPTION_KEY` as a production-only encrypted Pages secret and the mandatory installation flow.
- [ ] Review every changed-file patch against the spec, scan for secret leakage, URL bootstrap data, browser IndexedDB writes during capture, and accidental Google behavior changes.
- [ ] Confirm the branch is ahead of current `main`, create a draft PR, inspect the complete PR diff, resolve findings, and mark ready.
