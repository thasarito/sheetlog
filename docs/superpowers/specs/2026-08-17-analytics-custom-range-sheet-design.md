# Analytics Custom Range Sheet Design

## Goal

Make Custom (`C`) behave consistently in the compact Analytics carousel and the Analytics detail
sheet. Selecting `C` must open a dedicated date-range sheet directly. It must never use `C` in the
carousel as an indirect way to open the Analytics detail sheet, and the calendar must accept real
pointer and keyboard interaction in both entry points.

W/M/Q/Y behavior, analytics calculations, history loading, and the rest of the Analytics detail
experience remain unchanged.

## Root Cause

The compact carousel currently commits `custom` and routes its `C` action through
`HomeDashboardCarousel.handleCustomRangeRequest`, which opens the entire Analytics detail sheet.
That makes the same control mean “choose a range” in one context and “open Analytics” in another.

Inside the detail sheet, `AnalyticsRangePicker` renders a Radix Popover portal as a sibling of the
Vaul drawer. While the modal drawer is open, Vaul sets `pointer-events: none` on the document body
and restores pointer interaction only within its own drawer content. The portaled calendar inherits
the disabled pointer state, so it remains visible while real clicks pass through to the chart below.
DOM-only component tests do not reproduce this cross-portal modal behavior.

## Approved Direction

Replace the custom-range Popover with a dedicated Vaul range sheet that reuses one calendar/content
implementation in both contexts:

- From the carousel, `C` opens a normal standalone range sheet.
- From the Analytics detail sheet, `C` opens the same range sheet through Vaul's supported
  `NestedRoot`, leaving Analytics visible beneath it.
- The range sheet keeps changes as a local draft. Only **Apply** commits the dates and selects `C`.
- Cancel, Escape, an outside press, or a dismiss gesture closes the range sheet without changing the
  previously active range.

This gives both entry points the same visual hierarchy and interaction while keeping every calendar
inside a Vaul-managed pointer and focus boundary.

## Interaction Flow

### Carousel entry

1. The user activates `C` on the compact Analytics slide.
2. Transaction history remains lazily activated so the calendar can use the available history
   boundary.
3. A standalone sheet titled **Custom date range** opens. The Analytics detail sheet stays closed.
4. The sheet starts with the currently saved custom period as its draft, even when another range is
   active.
5. Apply commits the inclusive period, changes the active analytics range to `custom`, closes the
   range sheet, and returns focus to the carousel `C` button.
6. Dismissal without Apply preserves both the previous active range and saved custom period.

### Analytics detail entry

1. The user activates `C` in the detail sheet, including when `C` is already selected and they want
   to edit its dates.
2. The Custom date range sheet opens as a nested Vaul drawer above Analytics.
3. Apply commits the inclusive period, selects `C`, and closes only the nested range sheet.
4. The Analytics detail sheet remains open and recomputes from the shared range state.
5. Dismissal without Apply returns to Analytics with its previous range and filters unchanged.

Non-custom W/M/Q/Y buttons continue to commit immediately. Their behavior does not open the range
sheet.

## Range Sheet Presentation

The range sheet follows Sheetlog's existing drawer language:

- the standard overlay, rounded top edge, border, card background, and drag handle;
- no shadow;
- a **Custom date range** title and concise instruction;
- one `react-day-picker` range calendar at mobile widths;
- visible selected-range text;
- month navigation bounded by the earliest available transaction date and today;
- a footer with Cancel and Apply actions, including the bottom safe area.

Dates before the loaded-history boundary and after today remain disabled. A complete same-day range
is valid. Apply is disabled until both range endpoints exist. Opening or reopening the sheet resets
the draft from the committed custom period so abandoned edits never leak into analytics state.

## State and Component Boundaries

`HomeDashboardCarousel` remains the source of truth for the active `AnalyticsRange` and committed
custom `DatePeriod`. It adds standalone range-sheet state and computes the earliest available date
from the same transaction history already used by Analytics. Applying from either context updates
`customPeriod` and `range` together.

`AnalyticsSlide` changes its range-toggle dispatch rule. W/M/Q/Y call `onRangeChange` immediately;
`C` calls `onCustomRequest` without first committing `custom`.

`AnalyticsDrawer` owns only the nested sheet's open state and trigger focus. Its W/M/Q/Y controls
still call `onRangeChange` immediately. Its `C` control opens the nested sheet; Apply calls the
existing controlled `onCustomPeriodChange` and `onRangeChange` callbacks. The current Popover-open
guard and programmatic `openRequest` flow are removed.

`AnalyticsRangePicker` is replaced by a focused range-sheet component. The reusable content owns
the draft `DateRange`, calendar selection, validation, Cancel, and Apply. A small root wrapper selects
the normal `Drawer` for carousel use or `DrawerNestedRoot` when rendered inside Analytics.

`ui/drawer.tsx` exposes Vaul's `NestedRoot` through the existing wrapper module. It does not alter
default drawer styling or behavior for other consumers.

The Radix Popover dependency is removed if no other production component uses it. `react-day-picker`
and `date-fns` remain the calendar and boundary dependencies. This is local UI state, so no new query
or mutation is introduced; existing TanStack Query history loading remains unchanged.

## Focus, Dismissal, and Accessibility

- Each range sheet is named **Custom date range** and described as choosing an inclusive start and
  end date.
- The calendar retains native DayPicker grid, day labels, disabled semantics, and keyboard
  navigation.
- Apply communicates its disabled state until the draft is complete.
- Closing a standalone sheet restores focus to the carousel `C` trigger.
- Closing a nested sheet restores focus to the detail-sheet `C` trigger while leaving the parent
  dialog mounted.
- Escape closes only the topmost range sheet.
- Opening and closing the nested sheet must not dismiss Analytics or expose its chart to pointer
  events through the sheet.
- Reduced-motion preferences continue to be honored by the existing drawer primitives.

## Error and Loading Behavior

Opening Custom does not wait for a network request. It uses the currently available transaction
history and committed custom period immediately. If history finishes loading while the sheet is
open, the earliest selectable boundary may expand without resetting the user's current draft.

The range sheet performs no remote mutation and introduces no separate error state. Existing
Analytics loading, cached-data, offline, and retry behavior remains authoritative after Apply.

## Testing and Acceptance Criteria

Component tests must prove:

- carousel `C` opens the Custom date range sheet and does not open Analytics;
- dismissing the standalone sheet preserves the previous range and period;
- applying a complete draft commits the inclusive custom period and selects `C`;
- `AnalyticsSlide` does not commit `custom` before the range sheet applies;
- detail-sheet `C` opens a nested range sheet while the Analytics dialog remains mounted;
- nested Cancel preserves the prior range, bucket selection, and category selection;
- nested Apply updates Analytics and closes only the range sheet;
- opening resets abandoned draft dates from the committed value;
- Apply remains disabled for an incomplete range and supports a same-day range;
- bounded dates, keyboard navigation, Escape, and trigger-focus restoration remain accessible.

Mobile browser coverage must use real pointer clicks to select two calendar days from both entry
points. It must assert that the standalone path never opens Analytics, the nested path leaves
Analytics open after Apply, and calendar clicks do not select or activate the chart underneath.

The complete unit/component suite, `npm run lint`, `npx tsc --noEmit`, production build, and relevant
Mobile Chrome E2E flow must pass.

## Out of Scope

- Changing W/M/Q/Y period definitions or analytics aggregation.
- Persisting the custom period across reloads.
- Redesigning Analytics charts, filters, currency selection, or transaction history.
- Adding multiple calendar months at mobile width.
- Changing unrelated drawers or introducing a new state-management dependency.
