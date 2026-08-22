# Quick Note Brand Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a curated official-color brand icon library for Quick Notes, visually resolve legacy placeholder icons from their labels without causing sync writes, and populate the owner's Google Sheet with useful category-specific Quick Notes.

**Architecture:** Keep the existing Lucide icon registry unchanged for accounts and categories. Add a separate Quick Note brand registry and renderer, extend `DynamicIcon` to understand persisted `brand:*` names, and add a `QuickNoteIcon` wrapper that may resolve only missing/legacy-invalid Quick Note icons from labels. The picker exposes brands only when invoked by the Quick Note editor. Existing Sheet rows remain untouched; newly seeded rows may persist explicit `brand:*` icon names.

**Tech Stack:** React 18, TypeScript, Vitest/Testing Library, Lucide, Headless UI, Google Sheets Quick Note table.

**Spec:** Conversation-approved choices: curated catalog, official brand colors, label-based visual auto-match without rewriting existing rows, and data-driven Quick Note population for every category.

## Global Constraints

- Do not run or rely on GitHub Actions/workflow tests; verify through targeted code review and final diff inspection.
- Do not alter the existing `QuickNote` schema or Google Sheet column layout.
- Do not auto-match over a valid explicitly selected Lucide or `brand:*` icon.
- Auto-match only absent, unsupported, or known legacy placeholder icons such as `StickyNote`.
- Brand colors belong to the logo; the existing Quick Note color remains the radial/menu accent color.
- Brand picker choices use stable persisted names in the form `brand:<slug>`.
- Preserve the existing maximum of five Quick Notes per category.
- Follow `AGENTS.md`: no new shadow utility and no unrelated refactors.

---

### Task 1: Specify brand resolution behavior

**Files:**
- Create: `src/lib/quickNoteBrands.test.ts`
- Create: `src/components/QuickNoteIcon.test.tsx`
- Modify: `src/components/AppearancePicker.test.tsx`
- Modify: `src/components/SettingsQuickNoteEditorDrawer.test.tsx`

**Interfaces:**
- Produces expected API for `resolveQuickNoteIconName(icon, label, fallback?)`.
- Produces expected picker flag `includeBrandIcons?: boolean`.
- Produces expected rendering marker `data-quick-note-brand` for accessible verification.

- [ ] Add resolver cases for Grab, ChatGPT, PEA, Spotify, 7-Eleven, punctuation/case variants, specific Apple-service ordering, valid generic-icon preservation, and safe fallback.
- [ ] Add component coverage showing a legacy `StickyNote` renders a matched brand while an explicit Lucide icon remains unchanged.
- [ ] Add picker coverage showing brands only when `includeBrandIcons` is enabled and that selecting one saves its stable `brand:*` name without changing the accent color.
- [ ] Add editor coverage showing legacy placeholders enter the editor as their resolved brand and that the Quick Note editor enables the brand library.
- [ ] Review the test diff and confirm the current implementation cannot satisfy the new assertions before production code is added.

### Task 2: Add the curated brand registry and renderer

**Files:**
- Create: `src/lib/quickNoteBrands.ts`
- Create: `src/components/QuickNoteBrandIcon.tsx`
- Modify: `src/components/DynamicIcon.tsx`

**Interfaces:**
- `QUICK_NOTE_BRANDS`: ordered readonly catalog used by the picker.
- `isQuickNoteBrandName(value: string | undefined): boolean`.
- `resolveQuickNoteBrandName(label: string): QuickNoteBrandName | undefined`.
- `resolveQuickNoteIconName(icon: string | undefined, label: string, fallback?: string): string`.
- `QuickNoteBrandIcon({ name, className, style })` renders official-color brand marks.
- `DynamicIcon` renders both existing Lucide names and explicit `brand:*` names.

- [ ] Define a Thai-focused 25-brand catalog: Grab, ChatGPT, PEA, Spotify, 7-Eleven, BTS, M-Flow, AIS, PTT, Tops, Lotus's, Big C, Shopee, PromptPay, UOB/PRIVI Miles, Apple, iCloud, Apple Pay, AWS, Figma, Steam, Starbucks, Café Amazon, Jetts, and RBSC.
- [ ] Normalize aliases conservatively and order specific services before parent brands.
- [ ] Treat only missing, unsupported, and `StickyNote` icons as auto-match candidates.
- [ ] Render logo colors independently from caller-provided text color while preserving size, opacity, and other style properties.
- [ ] Extend `DynamicIcon` without changing Lucide behavior or fallback semantics.

### Task 3: Use brand-aware Quick Note rendering everywhere

**Files:**
- Create: `src/components/QuickNoteIcon.tsx`
- Modify: `src/components/QuickNotes/QuickNoteFlow.tsx`
- Modify: `src/components/QuickNotes/QuickNotesSettings.tsx`
- Modify: `src/components/CategoryQuickNoteMenu/index.tsx`

**Interfaces:**
- `QuickNoteIcon({ icon, label, fallback, className, style })` resolves legacy labels and delegates to `DynamicIcon`.

- [ ] Replace Quick Note-only `DynamicIcon` calls with `QuickNoteIcon` in settings lists and both custom/default quick-action renderers.
- [ ] Resolve a legacy icon once when opening the editor so saving that edited note writes the stable matched `brand:*` name.
- [ ] Keep new Quick Notes on the existing `Tag` default until the user explicitly chooses a brand.
- [ ] Enable brands only in the Quick Note appearance picker.
- [ ] Preserve Quick Note accent colors, radial presentation, ordering, and sync payload structure.

### Task 4: Add brand selection to the existing dialog

**Files:**
- Modify: `src/components/AppearancePicker.tsx`

**Interfaces:**
- New optional prop: `includeBrandIcons?: boolean`, default `false`.

- [ ] Render a labelled `Brands` grid before `General icons` only when the flag is enabled and the icon section is visible.
- [ ] Use `DynamicIcon` for brand previews so official colors are identical in picker, editor, list, and quick-action menu.
- [ ] Preserve current icon-only, color-only, advanced-color, cancel, and save behavior.
- [ ] Keep accessible button names in the form `Use <Brand> brand icon`.

### Task 5: Populate the owner's SheetLog_DB

**External target:**
- Spreadsheet: `SheetLog_DB`
- Sheet: `Quick Note`
- Existing columns: `Scope, Type, Category, Entry, Position, Id, Icon, Label, Note, Amount, Currency, Account, For, Color`

- [ ] Preserve every existing row and icon value so visual auto-match creates no write churn.
- [ ] Add one or more useful recurring presets only to categories that currently have none, staying below five notes per category.
- [ ] Use transaction-derived stable defaults where available: Tops, housing/site work, Shopee, Steam, gift allowance, Hetzner, travel, tax, FPL, reimbursement, BTC investment, FX, Paa Yiam, and loan repayment.
- [ ] Use neutral category presets with no invented amount when history is absent or too sparse, including Interest and Savings.
- [ ] Persist explicit `brand:*` values only on newly created rows whose label is a high-confidence brand match.
- [ ] Re-read the full Quick Note range and verify each of the 29 configured categories has at least one category-specific row, positions are contiguous within a category, IDs are unique, and no category exceeds five notes.

### Task 6: Review, publish, and mark ready

**Files:**
- Inspect all files changed from `main`.

- [ ] Fetch the compare diff from `main...feat/quick-note-brand-library`.
- [ ] Review imports, types, alias precedence, fallback behavior, accessibility labels, and every Quick Note render path.
- [ ] Confirm there are no schema, backend, lockfile, or unrelated changes.
- [ ] Confirm no GitHub workflow was invoked or used as evidence.
- [ ] Create a draft PR with the implementation and Sheet population summary.
- [ ] Mark the PR ready for review after the final diff review.