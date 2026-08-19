# Native Dashboard Scroll-Snap Design

**Date:** 2026-08-19

**Base:** `main` at `5561b67c2cd2ab1a57b6fbf8700d29b1b8634ae3`

## Goal

Replace Embla in the bounded `Analytics → Transactions → Settings` dashboard with native horizontal scroll snapping, and make the dashboard title reel consume the viewport's fractional scroll position directly so content and title stay synchronized during touch, native momentum, keyboard navigation, interruption, and settling.

## Approved Interaction

- Use native touch scrolling and CSS scroll snap.
- Keep mouse dragging and trackpad-specific paging disabled as explicit application gestures; browsers may still expose their ordinary scrolling behavior.
- Keep bounded slide order with no loop.
- Let native browser momentum and edge elasticity drive the content.
- Sample `scrollLeft / clientWidth` on every scroll event and project that exact position into the title reel.
- Keep the origin slide semantically active throughout movement. Commit `aria-hidden`, `inert`, the live announcement, vertical-header ownership, and transaction-dock interactivity only after the scroll settles at a snap point.
- ArrowLeft and ArrowRight move one adjacent slide. Reduced motion uses an immediate scroll.
- A new touch or key interaction may interrupt an in-flight native smooth scroll.

## Architecture

`HomeDashboardCarousel` owns the native scroll viewport. Each of the three existing mounted slides is a full-width `scroll-snap-align: start` child with `scroll-snap-stop: always`. The viewport publishes one absolute fractional position:

```text
position = viewport.scrollLeft / viewport.clientWidth
```

That position drives:

1. `DashboardTitleReel.setHorizontalPosition(position)` for title translation, weight, opacity, and diagnostic direction/progress.
2. `TransactionHistoryDock.setMotion(...)`, using the transaction slide's mathematical offset from the viewport.

No title direction is inferred from touch deltas, and no slide geometry is read on each frame.

## Settling

Use the native `scrollend` event when available and a debounced scroll fallback for browsers or test environments without it. A settle handler:

1. Resolves the nearest bounded slide index.
2. If the viewport is more than a small pixel tolerance from the snap anchor, issues one corrective native `scrollTo` and waits again.
3. Otherwise commits the active index and synchronizes title, vertical header progress, dock interactivity, live text, and diagnostic data attributes.

The fallback timer is restarted by every scroll event, so native momentum remains visually live while semantics stay on the origin.

## Title Reel Contract

Replace the direction-plus-progress imperative API with an absolute-position API:

```ts
setHorizontalPosition(position: number): void
syncHorizontalSelection(title: DashboardTitle): void
```

`setHorizontalPosition` changes only visual presentation. `syncHorizontalSelection` changes the semantic/settled selection and renders the exact integer anchor. During edge overscroll, title translation extrapolates from the first or last measured title interval while emphasis remains bounded to valid labels, matching the browser's content elasticity without inventing a fourth title.

## Gesture Ownership

Existing nested horizontal controls keep `data-home-carousel-swipe-lock="true"` and their non-passive touch handlers. Those controls remain responsible for preventing their horizontal touch movement, while vertical movement remains available to their enclosing content scroller. Inputs, selects, and textareas continue to receive normal interaction.

The dashboard viewport itself adds no custom touch physics and no pointer-delta state.

## Resize and Initialization

A `ResizeObserver` keeps the settled slide aligned when viewport width changes. Initial mount aligns to Analytics, publishes position zero, and initializes the title, header collapse, transaction dock, and inert state without animation.

## Dependency Removal

Remove `embla-carousel-react` from application dependencies and regenerate both npm and pnpm lockfiles. No replacement carousel or gesture dependency is added.

## Accessibility

- Preserve the carousel region, roledescription, labels, viewport keyboard target, and polite current-slide announcement.
- Keep all three slides mounted.
- Only the settled slide is non-inert and exposed with `aria-hidden="false"`.
- Do not move focus during scrolling or settling.
- Blocked navigation at Analytics/Settings leaves content, title, semantics, and focus unchanged.

## Testing

- Pure/title tests cover absolute fractional positions, forward/backward movement, midpoint emphasis, left anchors, edge extrapolation, and settled reconciliation.
- Carousel tests use a real scroll viewport harness rather than an Embla mock. They cover live scroll-to-title synchronization, delayed semantic commit, nearest-snap correction, native `scrollend`, debounce fallback, keyboard bounds, reduced motion, resize alignment, nested swipe ownership, vertical header state, transaction dock motion, mounted state, and click behavior.
- Browser coverage retains bounded keyboard and touch navigation and verifies partial title movement from native scroll position.
- Run focused Vitest, the full test suite, lint, TypeScript, build, and relevant Mobile Chrome Playwright coverage.

## Out of Scope

- No carousel looping.
- No custom velocity calculation, spring, resistance curve, or mouse-drag implementation.
- No changes to Analytics calculations, Settings data, transaction queries, category-sheet behavior, or vertical content layouts.
- No new shadow.