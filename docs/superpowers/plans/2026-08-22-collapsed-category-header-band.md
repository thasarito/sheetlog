# Collapsed Category Header Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the persistent Expense, Income, and Transfer control into a 60px collapsed launcher band while preserving the expanded transaction-entry layout exactly.

**Architecture:** Keep the existing single portal host and tab DOM instance. Add state-aware launcher composition in `CategoryStepSheet`, use a dedicated 60px collapsed snap height when tabs are present, and cache the expanded launcher measurement so state changes cannot alter expanded geometry.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vaul, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-collapsed-category-header-band-design.md`

## Global Constraints

- The collapsed launcher with transaction-type tabs is exactly 60px before the bottom safe area.
- The current expanded launcher structure, spacing, and visual classes remain unchanged.
- Keep exactly one mounted `StepCategoryTypeTabs` instance.
- Preserve launcher, tabs, keyboard, haptic, drag, click, inert, and safe-area behavior.
- Do not modify the generic drawer component or add shadows.

---

### Task 1: Lock the collapsed and expanded launcher contract

**Files:**
- Create: `src/components/TransactionFlow/CategoryStepSheet.collapsed-header.test.tsx`

**Interfaces:**
- Consumes: `CategoryStepSheet` props `entry`, `layoutHeight`, and `typeTabsHostRef`.
- Produces: Regression coverage for the 60px integrated launcher and stable expanded snap point.

- [ ] **Step 1: Write the failing component tests**

Create a focused drawer mock and portal a transaction-type button into the persistent host. Assert that the initial expanded state uses the existing stacked fieldset spacing, then collapse and assert that the launcher is a 60px one-cell grid with the launcher button and fieldset in the same cell. Mock different launcher measurements for expanded and collapsed states and assert snap points remain `["60px", "508px"]` through both transitions.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.collapsed-header.test.tsx
```

Expected: FAIL because the current collapsed launcher remains a stacked 108px launcher and has no integrated 60px layout contract.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add src/components/TransactionFlow/CategoryStepSheet.collapsed-header.test.tsx
git commit -m "test: cover integrated collapsed category header"
```

### Task 2: Implement state-aware launcher geometry

**Files:**
- Modify: `src/components/TransactionFlow/CategoryStepSheet.tsx`
- Modify: `src/components/TransactionFlow/CategoryStepSheet.test.tsx`

**Interfaces:**
- Consumes: the existing persistent `typeTabsHostRef`, launcher element measurement, entry measurement, and safe-area measurement.
- Produces: `COLLAPSED_TYPE_TABS_LAUNCHER_HEIGHT = 60`, an integrated collapsed grid band, and a cached expanded launcher measurement.

- [ ] **Step 1: Add the collapsed geometry constant and measurement cache**

Add a 60px collapsed launcher constant and a ref for the last launcher height measured outside the integrated collapsed state. When tabs are present, calculate the collapsed snap from 60px plus safe area. Calculate expanded height from the cached expanded launcher height plus entry height.

- [ ] **Step 2: Compose the collapsed launcher as one grid band**

When collapsed with a tabs host, apply a 60px one-cell grid to the launcher. Place the launcher button and type-tabs fieldset in that same grid cell, keep the grab indicator at the top edge, place the tabs 8px from the top with horizontal inset, and remove only the collapsed fieldset's 12px bottom spacing. Leave all expanded classes unchanged.

- [ ] **Step 3: Update existing snap-point expectations**

In `CategoryStepSheet.test.tsx`, change only tests rendered with `typeTabsHostRef` from a 44px collapsed snap expectation to 60px. Keep no-tabs and safe-area expectations unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/CategoryStepSheet.collapsed-header.test.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx src/components/TransactionFlow/CategoryStepSheet.safe-area.test.tsx src/components/TransactionFlow/CategoryStepSheet.keyboardClearance.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/components/TransactionFlow/CategoryStepSheet.tsx src/components/TransactionFlow/CategoryStepSheet.test.tsx
git commit -m "feat: integrate collapsed category header controls"
```

### Task 3: Verify the transaction-entry surface

**Files:**
- Verify only; no expected source changes.

**Interfaces:**
- Consumes: repository scripts and existing transaction-flow regression suites.
- Produces: evidence that the focused change does not regress the wider application.

- [ ] **Step 1: Run transaction-flow unit coverage**

```bash
npm test -- src/components/TransactionFlow
```

Expected: PASS.

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect the final branch diff**

Confirm that only the two design documents, one focused test file, `CategoryStepSheet.tsx`, and the necessary expectation updates in `CategoryStepSheet.test.tsx` changed. Confirm no generic drawer, tabs component, dependencies, lockfiles, or expanded-state styling changed.
