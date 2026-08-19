# Home Settings Carousel Design

## Goal

Move Settings out of the header-triggered full-screen sheet and make it the third full-height view
in the home dashboard carousel. The carousel order is:

1. Analytics
2. Transactions
3. Settings

Analytics remains the initial slide. Existing transaction logging, analytics, and settings
capabilities remain available without introducing new data behavior.

## Existing State

`TransactionFlow` renders a shared dashboard header above `HomeDashboardCarousel`. The carousel
contains Analytics and Transactions, loops through those views with Embla, and coordinates its
horizontal position with the title reel in `Header`.

The header also owns a gear button and the open state for `SettingsDrawer`. `SettingsDrawer`
combines two responsibilities:

- a full-screen modal shell with backdrop, close behavior, and scroll locking; and
- the settings experience itself, including the navigation stack, settings reads and mutations,
  sync diagnostics, account/category/quick-note management, and focused editors.

The settings data paths already use the project's existing hooks and TanStack Query mutations.
They do not need to change for this feature.

## Home Carousel Behavior

Extend the existing carousel to three slides in the exact order Analytics, Transactions, Settings.
It continues to start on Analytics and loop in both directions. Touch swipes, Embla settling,
keyboard Left/Right navigation, active-slide announcements, `aria-hidden`, and `inert` behavior all
use the three-slide count.

The title reel uses the same ordered label source and animates continuously between all three
titles. Moving forward from Settings wraps to Analytics; moving backward from Analytics wraps to
Settings.

Each slide retains independent vertical scroll progress. Scrolling Settings collapses the shared
68-pixel header over the same fixed distance used by Analytics and Transactions. Returning to a
slide restores the header position implied by that slide's retained scroll position.

The Transactions dock remains associated specifically with the Transactions slide at index 1.
Adding Settings must not change its interactive or motion behavior.

## Settings View

Extract the settings experience from the modal shell into a full-height `SettingsView` rendered by
the third carousel slide. The view owns the existing:

- settings queries and mutations;
- sync, offline, conflict, and error presentation;
- navigation stack for main, Accounts, Categories, and Quick Notes screens;
- screen-specific edit modes and form state;
- per-screen scroll positions; and
- focused Appearance and Quick Note editors.

The main Settings screen no longer has a modal `Done` action. Nested screens retain Back, Edit,
Add, and Done actions where those actions operate on nested navigation or edit state. Focused
editors such as the appearance picker and full-screen Quick Note editor remain overlays because
they are editing surfaces, not the removed Settings container.

Settings remains mounted with the carousel. Its current nested screen, edit state, draft values,
and scroll positions are preserved when the user swipes to another home slide and back. A carousel
slide change does not reset Settings to its main screen.

The view is vertically scrollable within the fixed carousel height and marks its scroll container
for the existing dashboard header-collapse handler. It has no outer modal backdrop, drag handle,
body scroll lock, Escape-to-close behavior, or open/close animation.

## Header Simplification

Remove the gear button and `SettingsDrawer` from `Header`, along with header-owned drawer state and
settings-only props. The header becomes responsible only for the passive title reel and its
horizontal and vertical motion interface.

`TransactionFlow` continues to provide `onToast` and the analytics sync controller directly to the
carousel. The carousel passes the settings-specific subset to `SettingsView`, avoiding a new data
owner or duplicate settings query path.

## Gesture Ownership

Ordinary horizontal gestures on the Settings slide move the home carousel, while vertical gestures
scroll the current Settings screen. Existing nested horizontal interactions must take priority:

- account, category, and Quick Note swipe-to-delete gestures do not move the home carousel;
- reorder gestures do not move the home carousel; and
- focused inputs continue to block carousel dragging.

Use the existing `data-home-carousel-swipe-lock="true"` gesture boundary for settings controls that
own a horizontal or reorder gesture. No additional carousel dependency is required.

## Component Boundaries

- `HomeDashboardCarousel` owns the three-slide order, active index, Embla integration,
  accessibility state, per-slide vertical progress, and title/dock motion coordination.
- `DashboardTitleReel` renders and animates the same three ordered labels.
- `SettingsView` owns settings navigation, presentation, local UI state, queries, and mutations.
- `Header` owns only the passive title reel and shared motion.
- Focused settings editors remain responsible for their existing overlay lifecycle.

The extraction may keep small settings presentation helpers alongside `SettingsView`; it must not
duplicate the existing mutation logic or introduce unrelated settings refactors.

## Data, Errors, and Offline Behavior

All existing settings data behavior is preserved. Reads and writes continue through the current
hooks and TanStack Query mutations. The inline view keeps the existing pending, synced, conflict,
offline, and error states. A failed mutation remains visible within Settings and continues to use
the existing toast behavior.

Moving Settings into the carousel does not trigger analytics resyncs, reset the transaction form,
or change query invalidation behavior.

## Accessibility

The Settings slide is labeled `Settings, slide 3 of 3`. The carousel live region announces the
active title and the three-slide position. Only the active slide is exposed to assistive technology
and keyboard navigation.

The carousel viewport remains keyboard focusable. Left and Right Arrow keys loop through all three
slides without moving focus. Settings' own buttons, fields, nested Back actions, status messages,
and focused editor focus management retain their current semantics.

## Styling

The Settings slide fills the same borderless carousel area as Analytics and Transactions. Remove
modal-only backdrop, rounded sheet, and elevation treatment. Preserve the existing settings group,
row, typography, spacing, and color system where it fits the inline layout. Do not add CSS or
utility-class shadows.

## Testing

Use test-driven development for the behavior change.

Component coverage will verify:

- the exact Analytics, Transactions, Settings order and `1 of 3` through `3 of 3` labels;
- Analytics as the initial slide and three-way touch/keyboard looping;
- active-slide `aria-hidden` and `inert` behavior;
- title-reel interpolation and wrapping across three labels;
- removal of the header gear and Settings modal;
- rendering and navigating Settings inside the third slide;
- preservation of the Settings navigation stack and scroll state across slide changes;
- correct header collapse from Settings scrolling;
- unchanged Transactions dock behavior at index 1; and
- gesture isolation for settings swipe, reorder, and input controls.

The mobile Playwright flow will swipe through all three views, exercise an inline Settings action,
confirm that no Settings dialog/backdrop opens, and verify that returning to Analytics and
Transactions preserves their existing behavior.

Final verification includes the relevant focused tests, the full test suite, `npm run lint`, and
`npx tsc --noEmit`.

## Out of Scope

- Changing settings values, persistence formats, or synchronization semantics.
- Converting focused Appearance or Quick Note editors into carousel content.
- Adding carousel indicators, new navigation controls, or a non-looping mode.
- Redesigning Analytics, Transactions, or the transaction-entry flow.
- Unrelated settings cleanup or visual restyling.
