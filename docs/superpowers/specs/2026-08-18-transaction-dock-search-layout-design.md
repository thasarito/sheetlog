# Transaction Dock Search and Keyboard Layout Design

## Context

The Transactions slide now owns a compact search and metadata dock attached above Step Category. Three refinements are needed: a clear action inside Search, continuous reuse of the space released by the collapsing dashboard header, and stable mobile-keyboard behavior.

The current app already keeps its root transaction canvas at a stable height while a software keyboard is open. Vaul independently repositions focused drawer inputs by changing the drawer height and bottom offset. Because the transaction search is portalled into the Vaul layer, that default behavior can move the sheet and dashboard composition unexpectedly.

## Goals

- Add a conditional clear action inside transaction Search matching the StepAmount note-field interaction.
- Let the transaction history occupy the dashboard-header space continuously as the header hides.
- Keep the dashboard, transaction-list viewport, and Step Category sheet geometry stable when the software keyboard opens.
- Keep Step Category expanded while Search is focused.
- Let the software keyboard overlay Step Category while the transaction dock sits immediately above the keyboard boundary.
- Restore the dock's normal attachment above Step Category when the keyboard closes.
- Preserve search debounce, filtering, virtual-list anchoring, carousel motion, accessibility, theming, and the no-shadow product rule.

## Non-goals

- Do not change transaction queries, refresh behavior, synchronization, or persistence.
- Do not change the Analytics slide's header-spacing behavior.
- Do not resize the application root or transaction history when the software keyboard opens.
- Do not make the dock draggable or independently swipeable.
- Do not alter Step Category's ordinary expanded and collapsed snap points.

## Search Clear Action

`TransactionHistoryDock` will give Search an input ref and render a trailing clear button only when the controlled search value is non-empty.

The control will:

- use the `X` icon and the same 44px circular target pattern as `TransactionNoteField`;
- use the accessible name `Clear transaction search`;
- call the existing `onSearchChange("")` callback exactly once;
- restore focus to Search after clearing so the keyboard remains available;
- reserve trailing input padding only for the clear target;
- remain inside the existing carousel and Vaul swipe-lock boundary.

Clearing continues through the existing 250ms search debounce. No separate search state is introduced.

## Header-Space Reclamation

The dashboard header currently translates and fades over the first 68px of each slide's scroll. Transactions still retains a fixed 68px top padding, leaving an empty band after the header is hidden.

`HomeDashboardCarousel` will continue deriving collapse progress from the real transaction scroll position. On every relevant scroll event it will publish the remaining header space on the owning slide as a CSS custom property:

```text
remaining header space = 68px × (1 − clamped collapse progress)
```

`TransactionHistoryView` will use that value for its top padding instead of a fixed 68px. At scroll top the padding remains 68px; halfway through the collapse it is 34px; at and beyond 68px of scroll it is 0px. Updates are imperative and follow the existing header-motion path, avoiding per-frame React renders.

The property is stored on the Transactions slide so its progress remains independent from Analytics and is restored when carousel selection changes.

## Mobile Keyboard Geometry

### Stable application layout

The category drawer will opt out of Vaul's `repositionInputs` behavior. The existing stable transaction-height contract and overlay viewport metadata remain in force, so opening the software keyboard does not resize or translate the application root, dashboard, transaction history, or drawer.

If Step Category is collapsed when Search receives focus, the accessory contract requests the ordinary expanded snap before the keyboard placement is applied. Keyboard opening itself does not create a new snap point or modify either existing snap point. Step Category stays expanded after the keyboard closes.

### Keyboard-aware dock placement

While the visual viewport reports a software-keyboard inset greater than the existing noise threshold, the accessory host will move only through a compositor transform. Its vertical offset will place the dock's bottom 8px above the visual viewport bottom, which is the keyboard's top edge in overlay mode.

The drawer remains at its expanded geometry underneath the overlay. The keyboard therefore covers Step Category, while the dock stays visible and usable immediately above it. This transform does not change layout measurements, snap-point heights, the history scroller's dimensions, or the published sheet occlusion.

When the visual viewport returns to the full application height, the keyboard offset returns to zero and the dock resumes its normal 8px attachment above the live Step Category top edge.

### Fallbacks

- If `window.visualViewport` is unavailable, the dock keeps its ordinary sheet-attached position and the application remains usable.
- Visual viewport changes smaller than 60px are ignored as browser-toolbar noise.
- Non-finite or negative measurements resolve to zero offset.
- Orientation or genuine width changes continue through the existing stable-height behavior rather than being classified as keyboard changes.

## Component Boundaries

### `TransactionHistoryDock`

- Owns only the input ref and clear-button interaction.
- Keeps its existing controlled search props, motion handle, portal behavior, and swipe locks.

### `CategoryStepSheetAccessory`

- Adds an explicit `requestExpanded` callback to the existing accessory contract.
- The standalone fallback exposes a no-op callback.

### `CategoryStepSheet`

- Implements `requestExpanded` by selecting the existing expanded state.
- Disables Vaul input repositioning for this persistent sheet.
- Observes the visual viewport and applies the keyboard-only accessory transform.
- Does not change snap-point measurement or transaction-history occlusion.

### `HomeDashboardCarousel`

- Publishes the remaining header space from the existing scroll-progress calculation.
- Keeps header animation, carousel selection, and per-slide progress ownership unchanged.

### `TransactionHistoryView`

- Consumes the remaining-header-space CSS property for top padding.
- Keeps virtualizer, search debounce, filtering, and bottom occlusion unchanged.

## Accessibility and Input

- Search retains native `type="search"`, its accessible label, and text-editing keyboard behavior.
- Clear Search is keyboard reachable, has a 44px target, and returns focus to Search.
- The dock remains excluded from Vaul and Embla gestures.
- The clear control is absent when Search is empty, avoiding an inactive focus stop.
- Keyboard placement uses transforms and does not alter reading order or duplicate controls.
- Analytics-settled and carousel-motion states continue making the dock hidden or inert as before.

## Verification

Unit and component tests will verify:

- the clear action appears only for a non-empty query, clears once, disappears, and restores focus;
- the Transactions slide publishes 68px, 34px, and 0px of remaining header space at the corresponding scroll positions;
- Transaction history consumes the dynamic property while Analytics remains unchanged;
- Search focus requests the existing expanded state;
- Vaul input repositioning is disabled;
- visual viewport keyboard measurements apply and remove only the accessory offset;
- missing visual viewport support retains the normal dock position.

Real-browser coverage in Chromium and Mobile Chrome will verify:

- the transaction list rises continuously into the released header area;
- the header and content reach their final positions together;
- a non-empty Search shows and successfully uses the clear action;
- a simulated overlay keyboard leaves dashboard, history, and sheet rectangles unchanged;
- Step Category remains expanded behind the keyboard boundary;
- the dock finishes 8px above the keyboard boundary and returns to the sheet after dismissal;
- horizontal carousel gestures, list scrolling, dock swipe locks, and final-row clearance remain intact;
- no shadow is introduced.

## Approved Decisions

- Clear action: match the existing StepAmount note clear control.
- Header space: reclaim continuously, not only after the header fully disappears.
- Keyboard strategy: fixed dashboard plus keyboard-aware dock overlay.
- Sheet state: expanded during and after Search keyboard use.
- Keyboard layering: keyboard overlays Step Category; only the dock moves to the keyboard boundary.
