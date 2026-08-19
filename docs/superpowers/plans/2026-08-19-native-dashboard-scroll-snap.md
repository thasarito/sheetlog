# Native Dashboard Scroll-Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bounded Embla dashboard with native CSS scroll snap while driving the title reel directly from fractional viewport scroll position.

**Architecture:** `HomeDashboardCarousel` becomes a native horizontal scroll viewport whose three full-width snap children remain mounted. Every scroll publishes `scrollLeft / clientWidth` to the header and transaction dock; only `scrollend` or the debounce fallback commits the nearest semantic slide. `DashboardTitleReel` accepts absolute position rather than reconstructing it from direction plus progress.

**Tech Stack:** React 18, TypeScript, native CSS scroll snap, Vitest/Testing Library, Playwright, npm and pnpm lockfiles.

**Spec:** `docs/superpowers/specs/2026-08-19-native-dashboard-scroll-snap-design.md`

## Global Constraints

- Preserve bounded `Analytics → Transactions → Settings` order and mounted state.
- Keep touch and keyboard navigation; do not add custom mouse dragging or a new motion/carousel dependency.
- Keep origin-slide semantics until settle.
- Preserve nested `data-home-carousel-swipe-lock="true"` ownership and vertical content scrolling.
- Respect `prefers-reduced-motion: reduce` for keyboard/programmatic navigation.
- Do not use `shadow`.

---

### Task 1: Change the title contract to absolute position

**Files:**
- Modify: `src/components/DashboardTitleReel.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/Header.test.tsx`

**Interfaces:**
- Produces: `DashboardTitleReelHandle.setHorizontalPosition(position: number): void`
- Produces: `DashboardHeaderMotionHandle.setHorizontalPosition(position: number): void`
- Retains: `syncHorizontalSelection(title: DashboardTitle): void`

- [ ] **Step 1: Write failing header tests**

Add expectations that position `0.5` places Analytics left of its anchor and Transactions right of its anchor with equal emphasis, position `1.25` moves continuously from Transactions toward Settings, negative and greater-than-last positions extrapolate the reel without activating an unreachable title, and `syncHorizontalSelection` restores the exact integer left anchor.

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: FAIL because `setHorizontalPosition` does not exist.

- [ ] **Step 3: Implement the absolute-position renderer**

Replace `ReelMotion { direction, progress }` with one numeric visual position. Clamp only emphasis to `[0, LABELS.length - 1]`; interpolate/extrapolate the measured title anchor from the raw position. Keep `selectedIndexRef` authoritative for `data-selected-label`, and expose signed `data-progress` as `position - selectedIndexRef.current`.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardTitleReel.tsx src/components/Header.tsx src/components/Header.test.tsx
git commit -m "refactor: drive dashboard title from absolute position"
```

### Task 2: Replace Embla with native scroll snap

**Files:**
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`

**Interfaces:**
- Consumes: `headerMotionRef.current.setHorizontalPosition(position)`
- Produces: native viewport diagnostics `data-motion-position`, `data-motion-status`, `data-selected-snap`, and `data-target-snap`

- [ ] **Step 1: Replace the Embla mock with a native-scroll test harness**

Define writable `clientWidth` and `scrollLeft` on the viewport, mock `scrollTo` so tests can emit intermediate `scroll` events and a final `scrollend`, and assert the title handle receives exact fractional positions before the semantic active slide changes.

- [ ] **Step 2: Add failing settling and keyboard tests**

Cover: native partial scroll, `scrollend`, debounce fallback, nearest-anchor correction, one-slide ArrowLeft/ArrowRight bounds, reduced-motion immediate commit, resize realignment, transaction dock offset, mounted Analytics morph, inert slides, nested swipe-owned targets, and retained vertical header progress.

- [ ] **Step 3: Run the focused carousel test**

Run: `npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
Expected: FAIL while Embla remains.

- [ ] **Step 4: Implement native scrolling**

Remove Embla imports/types/options and pointer-delta motion state. Give the viewport horizontal overflow, mandatory snap, hidden scrollbar, and native touch action; give each slide `snap-start snap-always`. On every scroll, compute `position = scrollLeft / clientWidth`, publish it to the title and dock, mark motion moving, and restart the settle fallback. On settle, correct to the nearest anchor when outside tolerance, otherwise commit semantics and vertical ownership. Use `scrollend` plus the fallback timer and a `ResizeObserver`.

- [ ] **Step 5: Run the focused carousel and header tests**

Run: `npx vitest run src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/Header.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
git commit -m "refactor: use native dashboard scroll snap"
```

### Task 3: Remove Embla and update browser coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`
- Modify: `e2e/home-carousel.spec.ts`

**Interfaces:**
- Removes: `embla-carousel-react@8.6.0`
- Adds: no dependency

- [ ] **Step 1: Update browser expectations**

Require native overflow/snap styles, no Embla dependency contract, exact bounded keyboard navigation, partial `scrollLeft`-driven title movement, semantic selection only after settle, nested Analytics gesture isolation, and retained Settings/Transactions state.

- [ ] **Step 2: Remove the dependency and regenerate lockfiles**

Run:

```bash
npm uninstall embla-carousel-react --ignore-scripts
pnpm remove embla-carousel-react --lockfile-only --ignore-scripts
```

Confirm `package.json`, the npm root package, and the pnpm importer no longer reference Embla, and no reachable Embla package snapshots remain.

- [ ] **Step 3: Run browser-focused validation**

Run: `VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json pnpm-lock.yaml e2e/home-carousel.spec.ts
git commit -m "chore: remove Embla dashboard dependency"
```

### Task 4: Full verification and PR

**Files:**
- Review all changed files

- [ ] **Step 1: Run repository verification**

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Review the final diff**

Check for stale Embla imports/mocks/options, independent title direction state, per-frame layout reads, semantic commits during movement, forbidden shadows, unrelated changes, and incomplete lockfile removal.

- [ ] **Step 3: Request code review**

Review the branch against the spec, resolve any correctness or scope findings, then rerun affected verification.

- [ ] **Step 4: Open the pull request**

Use a PR title describing native scroll snap and real-time title synchronization. Include implementation summary, interaction guarantees, dependency removal, and exact verification evidence.