# Transaction History Sheet Dock Design

## Context

The Transactions carousel slide currently renders search, transaction count, last-saved status, and refresh controls at the top of its content. Step Category is a persistent Vaul sheet layered over both dashboard slides. Moving the transaction controls next to the sheet makes them easier to reach and keeps the virtualized history focused on rows.

The approved direction is a compact dock that remains logically owned by Transactions, sits immediately above the Step Category sheet, follows the sheet vertically, and follows the Transactions slide horizontally.

## Goals

- Move the Transactions search field, transaction count, last-saved status, and refresh action into one compact dock.
- Keep the dock 8px above the live top edge of Step Category through direct drag, snap animation, collapsed state, and expanded state.
- Move the dock with the Transactions slide in real time during forward, backward, reversed, and looped Embla gestures.
- Preserve search state, filtering, refresh behavior, offline behavior, virtual-list anchoring, and transaction selection.
- Prevent the dock and Step Category sheet from obscuring the end of the virtualized history.
- Preserve theme support, accessibility, touch behavior, and the product rule against shadows.

## Non-goals

- Do not add an Analytics dock or move Analytics controls.
- Do not change transaction queries, mutations, synchronization, or saved-status semantics.
- Do not change Step Category snap points, category selection, transaction-type tabs, or entry flow.
- Do not change the dashboard title reel or its fixed-distance vertical collapse.
- Do not make the dock a second carousel or an independent swipe surface.

## Visual Design

The dock is a distinct Transactions surface rather than part of transaction entry:

- 12px horizontal inset from the dashboard viewport.
- 8px separation from the Step Category top edge, crossed by a small centered visual bridge so the attachment is clear.
- Theme-aware `background` surface at high opacity, a subtle `border`, 16px corners, and no shadow.
- A full-width search field with a minimum 44px touch height.
- A compact metadata row below search: transaction count on the left; last-saved state and the existing 44px refresh action on the right.
- Existing muted and foreground tokens communicate secondary and primary text. No new green background, underline, or decorative elevation is introduced.

The dock remains visible above both collapsed and expanded Step Category positions. It does not independently fade during carousel motion; it translates outside the dashboard viewport with Transactions and becomes hidden after Analytics settles.

## Component Architecture

### Sheet accessory host

`CategoryStepSheet` provides a sheet-accessory context and renders one accessory host immediately above the Vaul surface. The host is a descendant of `DrawerContent`, so it inherits Vaul's exact transform during pointer dragging and snap animation. It is positioned outside the sheet body, and the body retains its own overflow clipping so category content cannot escape the rounded surface.

The accessory host:

- does not participate in snap-point or entry-height measurement;
- is marked `data-vaul-no-drag` so search and refresh interactions do not drag the sheet;
- reports its measured height through the context;
- permits the search input to use Vaul's existing mobile keyboard repositioning so dock and sheet remain together above the keyboard.

The context distinguishes "no provider" from "provider mounted but host not ready." This prevents a first-frame inline flash in the dashboard while retaining a standalone fallback.

### Transaction-owned dock

`TransactionHistoryView` remains the owner of search, debounced search, filtered count, sync metadata, and refresh behavior. Its existing controls are extracted into `TransactionHistoryDock` and portalled into the sheet accessory host. React ownership and state do not move into `CategoryStepSheet`.

When `TransactionHistoryView` is rendered without a sheet-accessory provider, the dock renders in its current inline location. Only one dock instance exists in either mode.

### Carousel motion

`HomeDashboardCarousel` owns a `TransactionHistoryDockMotionHandle` alongside the dashboard-header motion handle. The existing Embla `scroll`, `select`, `settle`, `reInit`, pointer-direction, and reversal signals update both consumers in the same animation path without introducing per-frame React renders.

At rest:

- Analytics selected: dock is translated one viewport outside the visible area, hidden from accessibility, and inert.
- Transactions selected: dock is at `translateX(0)`, accessible, and interactive.

During a gesture:

- From Analytics, the dock enters from the same side as Transactions based on signed loop direction.
- From Transactions, the dock exits on the same side and at the same proportional distance as the Transactions slide.
- Reversing the pointer direction reverses the dock immediately.
- Pointer interaction is disabled while horizontal motion is unsettled, preventing accidental search or refresh activation.

If focus remains inside the dock when Analytics becomes selected, the dock releases focus and dismisses the mobile keyboard before becoming inert.

## Layout and Occlusion

The dock uses `ResizeObserver` to publish `--transaction-history-dock-height` on the `CategoryStepSheet` layout. A safe default matching the compact design is present before measurement.

The Transaction history scroller reserves:

```text
category sheet occlusion + measured dock height + 8px dock gap
```

Analytics continues using only the category-sheet occlusion. The virtualizer's total-size spacer and row measurement remain unchanged. Settled snap changes update the existing category-sheet occlusion, while the dock itself follows live Vaul motion as part of the transformed sheet layer.

## Search, Sync, and Error Behavior

- Search input and 250ms debounce remain unchanged.
- Swiping to Analytics and back preserves the query and filtered result set.
- Count continues to describe the filtered transaction set.
- Last-saved, updating, downloading, and not-downloaded labels keep their current derivation.
- Refresh keeps its current online and pending states and refetches history and base amounts exactly once.
- Existing complete-cache and incomplete-history error banners remain in the Transactions content area above the virtual list.
- Missing accessory or motion refs are safe no-ops; the standalone inline fallback keeps all controls usable.

## Accessibility and Input

- The search input retains its accessible label and native search semantics.
- Refresh retains its accessible name, disabled state, keyboard behavior, and 44px target.
- The portal does not create duplicate accessible controls.
- The dock is `aria-hidden` and inert whenever Analytics is settled; it is non-interactive during a horizontal transition.
- Arrow-key carousel navigation remains scoped to the carousel viewport, so arrow keys inside Search continue editing text.
- The dock is not a drag target for Vaul or Embla. Vertical sheet dragging remains available from the existing sheet launcher and body.
- Reduced-motion behavior snaps the dock with the same immediate state transition as the carousel.

## Verification

Unit and component coverage will verify:

- one portalled dock with an inline fallback when no accessory provider exists;
- unchanged search, debounce, count, saved status, refresh, offline, and error behavior;
- measured dock height and combined Transactions-only bottom occlusion;
- Analytics-hidden and Transactions-interactive dock states;
- signed forward, backward, reversal, loop, settle, and reduced-motion transforms;
- no change to Category Step snap points or entry measurement.

Chromium and Mobile Chrome coverage will verify:

- dock and sheet top edges retain an 8px relationship throughout a real Vaul drag and snap;
- the dock and Transactions slide have matching horizontal progress in both loop directions;
- the dock becomes inert/offscreen on Analytics and returns without losing search state;
- virtualized history search and row selection still work;
- the mobile keyboard keeps the dock and sheet together without an automatic snap change;
- the final transaction row remains reachable above the combined occlusion;
- category collapse, expansion, type tabs, transaction entry, and Settings continue to work;
- the dock uses no shadow and follows light/dark theme tokens.

## Approved Decisions

- Placement: outside and immediately above Step Category.
- Visual treatment: compact dock with a small bridge, subtle border, and no shadow.
- Vertical motion: inherited directly from the Vaul sheet layer.
- Horizontal motion: synchronized in real time with the Transactions Embla slide.
- State ownership: retained by `TransactionHistoryView` through a portal.
