# Settings Control Center Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Settings' internal page stack with an independently expandable Control Center and nested live-save item editors.

**Architecture:** `SettingsView` becomes the single persistent scroll owner and composes accessible expandable collection sections. Pure helpers provide validation, Quick Notes grouping, and rename transforms; focused Account/Category and Quick Note editors use controlled Vaul nested drawers so dismissal can be blocked by invalid drafts. Existing TanStack Query mutation hooks remain the persistence boundary and gain only the rename/full-Quick-Notes operations required by the approved UX.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vaul `DrawerNestedRoot`, Framer Motion reorder, Testing Library, Vitest, Playwright, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-20-settings-control-center-navigation-design.md`

## Global Constraints

- Preserve the exact Home carousel order and bounded native scroll-snap behavior.
- Keep one Settings vertical scroll element marked `data-dashboard-scroll="true"`.
- Multiple Control Center sections may remain expanded simultaneously.
- Opening a section positions its header below the dashboard header; reduced motion must not animate.
- Concrete editors stack above Step Category through `DrawerNestedRoot`; Step Category retains its detent.
- Discrete controls save immediately; text saves on blur.
- Invalid text blocks Close, backdrop, and swipe dismissal and returns focus to the field.
- Destructive changes require explicit confirmation.
- Do not add dependencies or use `shadow` classes.
- Preserve local-first/offline/settings-sync semantics and use TanStack Query for mutations.

---

### Task 1: Add Control Center domain helpers

**Files:**
- Create: `src/lib/settingsControlCenter.ts`
- Create: `src/lib/settingsControlCenter.test.ts`

**Interfaces:**
- Produces: `validateSettingsName(value, existingNames, currentName?, noun?)`, `renameQuickNotesAccountReferences(config, previousName, nextName)`, `renameQuickNotesCategoryGroup(config, type, previousName, nextName)`, `buildQuickNotesGroups(config, categories)`.
- Consumes: `QuickNotesConfig`, `QuickNote`, `TransactionType`, and category metadata from `src/lib/types.ts`.

- [ ] **Step 1: Write failing tests for case-insensitive empty/duplicate validation**

```ts
expect(validateSettingsName(' ', ['Cash'], undefined, 'account')).toBe('Enter an account name.');
expect(validateSettingsName('cash', ['Cash'], undefined, 'account')).toBe(
  'An account named Cash already exists.',
);
expect(validateSettingsName('cash', ['Cash'], 'Cash', 'account')).toBeNull();
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm test -- src/lib/settingsControlCenter.test.ts`

Expected: FAIL because `settingsControlCenter.ts` does not exist.

- [ ] **Step 3: Add tests for Account rename reference preservation**

```ts
const renamed = renameQuickNotesAccountReferences(config, 'Cash', 'Wallet');
expect(renamed['expense:Food'][0]).toMatchObject({ account: 'Wallet' });
expect(renamed['transfer:Move'][0]).toMatchObject({ forValue: 'Wallet' });
```

- [ ] **Step 4: Add tests for Category key moves and custom/default group distinction**

```ts
expect(renameQuickNotesCategoryGroup(config, 'expense', 'Food', 'Dining')).toEqual({
  'expense:Dining': config['expense:Food'],
  'default:expense': config['default:expense'],
});
expect(buildQuickNotesGroups(config, categories).find((group) => group.label === 'Food')).toMatchObject({
  configuredCount: 0,
  inheritsDefaults: true,
});
```

- [ ] **Step 5: Implement the pure helpers minimally**

Use immutable transforms. Do not mutate arrays or notes. Category groups must read the exact configuration key rather than `getQuickNotesForCategory`, so inherited defaults are never counted as custom notes.

- [ ] **Step 6: Run the helper tests and verify GREEN**

Run: `npm test -- src/lib/settingsControlCenter.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settingsControlCenter.ts src/lib/settingsControlCenter.test.ts
git commit -m "feat: add Settings Control Center helpers"
```

### Task 2: Extend local-first mutation boundaries for rename integrity

**Files:**
- Modify: `src/hooks/useAccountMutations.ts`
- Modify: `src/hooks/useCategoryMutations.ts`
- Modify: `src/hooks/useQuickNotes.ts`
- Create: `src/hooks/useSettingsCollectionMutations.test.tsx`

**Interfaces:**
- `updateAccountMeta.mutateAsync({ previousName, name?, icon?, color? })`.
- `updateCategoryMeta.mutateAsync({ previousName, name?, categoryType, icon?, color? })`.
- `useReplaceQuickNotesConfig().mutateAsync({ config })` writes a complete `QuickNotesConfig` through the existing local repository and query snapshot pipeline.

- [ ] **Step 1: Write failing hook tests for Account and Category rename parameters**

Render the hooks with the existing QueryClient/session/workspace test providers. Assert that renaming `Cash` to `Wallet` updates only the matching account, and renaming Expense `Food` to `Dining` leaves Income `Food` untouched.

- [ ] **Step 2: Run focused hook tests and verify RED**

Run: `npm test -- src/hooks/useSettingsCollectionMutations.test.tsx`

Expected: FAIL because the mutation variables do not accept `previousName`/`name`.

- [ ] **Step 3: Update Account and Category mutation parameter contracts**

Map by `previousName`; apply a new `name` only when provided. Retain existing icon/color behavior and error toasts.

- [ ] **Step 4: Write a failing test for complete Quick Notes replacement**

Assert that `useReplaceQuickNotesConfig` updates the scoped quick-notes query snapshot and publishes the existing settings-local mutation event.

- [ ] **Step 5: Implement `useReplaceQuickNotesConfig` using the same local/legacy paths as existing Quick Notes mutations**

Use `mutateLocalQuickNotes(..., () => config, { legacyFallbackReadOnly: true })` for scoped settings and `mutateLegacyQuickNotes(() => config)` for legacy fallback. Preserve generation checks and query cache updates.

- [ ] **Step 6: Run focused hook tests and verify GREEN**

Run: `npm test -- src/hooks/useSettingsCollectionMutations.test.tsx src/hooks/useQuickNotes.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAccountMutations.ts src/hooks/useCategoryMutations.ts src/hooks/useQuickNotes.ts src/hooks/useSettingsCollectionMutations.test.tsx
git commit -m "feat: support live Settings collection renames"
```

### Task 3: Build the accessible expandable section primitive

**Files:**
- Create: `src/components/SettingsControlSection.tsx`
- Create: `src/components/SettingsControlSection.test.tsx`

**Interfaces:**
- `SettingsControlSection` props: `id`, `title`, `eyebrow`, `summary`, `icon`, `expanded`, `onToggle`, `headerRef?`, `children`.
- Produces stable `settings-section-${id}` and `settings-section-${id}-content` IDs.

- [ ] **Step 1: Write failing tests for independent controlled expansion and accessibility attributes**

Assert `aria-expanded`, `aria-controls`, hidden content, and that toggling one instance does not affect another controlled instance.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/components/SettingsControlSection.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the primitive without internal expansion state**

Use a full-width button header and a labeled region. Keep styling border-based with no shadows.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- src/components/SettingsControlSection.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsControlSection.tsx src/components/SettingsControlSection.test.tsx
git commit -m "feat: add expandable Settings sections"
```

### Task 4: Build the nested Account and Category editor

**Files:**
- Create: `src/components/SettingsItemEditorDrawer.tsx`
- Create: `src/components/SettingsItemEditorDrawer.test.tsx`
- Modify: `src/components/AdvancedColorPicker.tsx`

**Interfaces:**
- Target union: Account/Category with `mode: 'create' | 'edit'`, saved name, icon, color, and Category transaction type.
- Callbacks: `onCommitName(nextName): Promise<void>`, `onCommitAppearance({ icon?, color? }): Promise<void>`, `onCreate(name): Promise<void>`, `onDelete(): Promise<void>`, `onDismiss()`.
- `AdvancedColorPicker` gains `nested?: boolean` and chooses `DrawerNestedRoot` when true.

- [ ] **Step 1: Write a failing test proving the editor uses `DrawerNestedRoot` and no Save/Done action**

Mock the drawer primitives and assert the nested root, Close button, drawer title, live-save description, and absence of Save/Done.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/components/SettingsItemEditorDrawer.test.tsx`

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Add failing dismissal-validation tests**

Cover empty and duplicate names on blur, blocked Close, focus restoration to the invalid input, `aria-invalid`, specific error copy, and Revert behavior. Cover creation-mode Revert discarding the draft.

- [ ] **Step 4: Add failing live-save tests**

Assert valid changed text commits on blur once; unchanged text does not commit; preset icon/color buttons call `onCommitAppearance` immediately; confirmed delete calls `onDelete`; cancelled confirmation does not.

- [ ] **Step 5: Implement the controlled nested drawer**

Use medium/larger snap points, controlled `open`, `onOpenChange` dismissal gating, local text draft, preset icon/color controls from existing icon/color constants, `Saving…` / `Saved` status, and a nested Advanced Color picker.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- src/components/SettingsItemEditorDrawer.test.tsx src/components/AdvancedColorPicker.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsItemEditorDrawer.tsx src/components/SettingsItemEditorDrawer.test.tsx src/components/AdvancedColorPicker.tsx
git commit -m "feat: add live-save Settings item editor"
```

### Task 5: Build the nested Quick Note editor

**Files:**
- Create: `src/components/SettingsQuickNoteEditorDrawer.tsx`
- Create: `src/components/SettingsQuickNoteEditorDrawer.test.tsx`

**Interfaces:**
- Props include a concrete target (`type`, optional `categoryName`), `note`, `accounts`, `open`, `isSaving`, `onCommit(nextNote)`, `onDelete`, `onDismiss`.
- New notes receive a stable ID before the editor opens.

- [ ] **Step 1: Write failing tests for the larger nested drawer and label validation**

Assert the nested drawer starts at the larger detent, empty/overlong label blocks dismissal, Revert restores an existing label, and Revert discards a new draft.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/components/SettingsQuickNoteEditorDrawer.test.tsx`

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Add failing live-commit tests**

Cover label/note/amount commits on blur, currency/account/for-value commits immediately, unchanged values do not write, and confirmed deletion.

- [ ] **Step 4: Implement the editor**

Use plain Settings-appropriate fields rather than the transaction-entry `StepAmount` screen. Keep the existing 12-character label constraint, optional note/amount/currency/account/for-value fields, and transaction-type-aware `For`/`To` copy.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm test -- src/components/SettingsQuickNoteEditorDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsQuickNoteEditorDrawer.tsx src/components/SettingsQuickNoteEditorDrawer.test.tsx
git commit -m "feat: add live-save Quick Note editor"
```

### Task 6: Rewrite SettingsView as the Control Center

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/components/SettingsView.test.tsx`
- Remove usage only: `src/components/QuickNotes/QuickNoteFlow.tsx` and `src/components/AppearancePicker.tsx` remain available but are no longer the Settings navigation surfaces.

**Interfaces:**
- Consumes all components/helpers from Tasks 1–5.
- Maintains `Set<SettingsSectionId>` and `Set<string>` for Quick Notes target expansion.
- Stores the current editor target and originating `HTMLElement` in a ref for focus restoration.

- [ ] **Step 1: Replace old navigation tests with failing Control Center tests**

Tests must assert no Back/Edit/Done/page-stack chrome, the workspace health summary, and one `settings-control-center-scroll` element with `data-dashboard-scroll="true"`.

- [ ] **Step 2: Add a failing test for multiple simultaneous expanded sections**

Click Accounts and Categories and assert both labeled regions remain visible. Assert always-visible named reorder handles and no global Edit button.

- [ ] **Step 3: Add a failing auto-position test**

Mock `scrollIntoView`; opening Accounts must call `{ behavior: 'smooth', block: 'start' }`, while a reduced-motion media query must use `behavior: 'auto'`.

- [ ] **Step 4: Add failing tests for editor opening, focus return, and rename transforms**

Open Wallet, commit a valid name change, assert Account mutation variables and complete Quick Notes replacement. Dismiss and assert focus returns to the Wallet row. Repeat Category rename key movement.

- [ ] **Step 5: Add failing Quick Notes target tests**

Assert defaults and every category target are present; custom count does not include inherited defaults; expanding a target shows its configured notes and Add action; note taps open the nested Quick Note editor.

- [ ] **Step 6: Add failing Data & sync preservation tests**

Keep current sync/error/offline/import/resync assertions, but require Data & sync expansion before technical details appear.

- [ ] **Step 7: Implement the Control Center**

Delete `SettingsScreen`, stack/direction state, push/pop, nested navigation bar, screen animation variants, global edit modes, and per-screen scroll maps. Build the health card and ordered domains. Use direct reorder completion, editor-target state, validated rename sequencing, Quick Notes groups, and confirmed editor deletion.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
npm test -- \
  src/lib/settingsControlCenter.test.ts \
  src/components/SettingsControlSection.test.tsx \
  src/components/SettingsItemEditorDrawer.test.tsx \
  src/components/SettingsQuickNoteEditorDrawer.test.tsx \
  src/components/SettingsView.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/SettingsView.tsx src/components/SettingsView.test.tsx
git commit -m "feat: redesign Settings as a Control Center"
```

### Task 7: Update the mobile carousel regression

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

**Interfaces:**
- Uses existing mock-mode `/app`, bounded carousel keyboard navigation, and Step Category helper.

- [ ] **Step 1: Rewrite the existing Settings scenario to fail against the old stack**

Navigate to Settings, expand Accounts and Categories, verify both remain visible, open Add Account as a nested dialog, create a valid account by blurring the field, close, swipe away and back, and verify expansion/scroll state remains.

- [ ] **Step 2: Add a nested-sheet coexistence assertion**

While the item editor is open, assert both `Transaction entry` and the item editor dialogs exist, the parent retains its `data-category-sheet-state`, and horizontal touch movement on the input does not change the active Home slide.

- [ ] **Step 3: Add invalid-dismissal coverage**

Enter a duplicate account name, blur, attempt Close, assert the editor remains visible and the inline error is focused/described. Revert and close.

- [ ] **Step 4: Run Mobile Chrome Playwright and verify GREEN**

Run:

```bash
VITE_DEV_MODE=true VITE_GOOGLE_MAPS_API_KEY=e2e-key \
  npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover Settings Control Center navigation"
```

### Task 8: Final verification and presentation evidence

**Files:**
- Create: `docs/screenshots/settings/settings-control-center-mobile.png`
- No production changes unless a failing verification first gains a regression test.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

Expected: all tests pass with no unhandled warnings.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: pass; no `shadow` utilities in changed files.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`

Expected: pass.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: pass, including the browser OAuth boundary check.

- [ ] **Step 5: Run the focused mobile Playwright scenario**

Run the Task 7 command again after all cleanup.

Expected: pass.

- [ ] **Step 6: Capture the Settings Control Center screenshot**

Capture a 390×844 mobile screenshot with Accounts and Categories expanded and Step Category visible at its normal detent. Store it at the exact path above.

- [ ] **Step 7: Review the final diff**

Confirm the diff contains no Settings page-stack code, unrelated carousel changes, dependencies, temporary workflows, generated logs, or shadow utilities.

- [ ] **Step 8: Commit screenshot and final cleanup**

```bash
git add docs/screenshots/settings/settings-control-center-mobile.png
git commit -m "docs: add Settings Control Center screenshot"
```
