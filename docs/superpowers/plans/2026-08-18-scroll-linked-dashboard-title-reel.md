# Scroll-Linked Dashboard Title Reel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Sheetlog/profile area with a passive, theme-aware Analytics/Transactions title reel that follows a looping Embla content gesture in real time and hides with the active slide's vertical scroll.

**Architecture:** Keep the content viewport as the sole keyboard and pointer gesture surface. Use Embla for bidirectional looping, infer the signed motion direction from the initiating pointer or keyboard action, and publish horizontal/vertical motion through an imperative header handle so animation frames do not rerender `TransactionFlow`. The header renders five temporary alternating labels, measures each current word width, and positions them with one shared responsive gap.

**Tech Stack:** React 18, TypeScript, Embla Carousel React 8.6, Tailwind CSS, Vitest/Testing Library, Playwright.

---

## Task 1: Lock the reel math and header contract with failing tests

**Files:**
- Create: `src/components/Header.test.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `e2e/home-carousel.spec.ts`

- [x] Add unit coverage for Analytics-first labels, passive semantics, selected/faded styling, signed forward/reverse progress, and equal adjacent word gaps while font weights change.
- [x] Replace the native-scroll test harness with an Embla-compatible mock and require looping ArrowLeft/ArrowRight navigation plus signed live header updates.
- [x] Add focused browser expectations for the top-bar placement, removed logo/profile, passive reel, real-time partial motion, equal gaps, forward/reverse wraps, fixed settings x-position, and scroll-linked header hiding.
- [x] Run the focused unit tests and retain the expected RED output before production edits.

## Task 2: Build the passive measured title reel and movable header

**Files:**
- Create: `src/components/DashboardTitleReel.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`

- [x] Implement the five-label measured reel with responsive 10–18px gap, foreground active text, 34% faded text, no controls, no underline, no green surface, and no shadow.
- [x] Expose a header motion handle for signed horizontal progress and normalized vertical hide progress.
- [x] Replace the logo and profile with the reel, keep Settings fixed at the right edge, and overlay the header only on the dashboard step.
- [x] Wire one shared header ref between `Header` and `HomeDashboardCarousel`.
- [x] Run the focused reel/header tests to GREEN.

## Task 3: Replace native snapping with looping Embla content motion

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsView.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryView.tsx`

- [x] Add exact `embla-carousel-react@8.6.0`, matching the approved prototype.
- [x] Configure a two-slide `loop: true` Embla viewport, preserve nested period-gesture ownership, click suppression, keyboard focus, inert slides, and the live announcement.
- [x] Infer forward/backward direction from pointer delta (updating if the drag reverses), retain it through momentum/settle, and measure progress from the settled origin slide geometry.
- [x] Mark the two vertical content scrollers, normalize their scroll progress by `scrollHeight - clientHeight`, and apply only the settled slide's value to the header.
- [x] Remove the duplicate visible content headings while retaining semantic descriptions and reserve overlay space inside each slide.
- [x] Run focused unit/view tests to GREEN.

## Task 4: Browser verification and delivery

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [x] Run the focused carousel browser spec in Chromium and Mobile Chrome and save a production screenshot.
- [x] Run `npm run lint`, `npx tsc --noEmit`, focused tests, full `npm test`, and `git diff --check`.
- [x] Review the final diff for accidental regressions, forbidden shadows, stale logo/profile/title headers, and ignored throwaway artifacts.
- [x] Commit the production implementation with verification evidence.
