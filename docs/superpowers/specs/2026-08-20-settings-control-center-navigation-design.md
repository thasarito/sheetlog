# Settings Control Center Navigation Design

## Goal

Replace the internal full-page Settings navigation stack with a Control Center that belongs naturally to the third Home carousel slide. Settings remains one persistent vertical surface: collections expand in place, simple values edit inline, and only one concrete item opens a focused nested editor sheet.

The redesign changes presentation and interaction while preserving existing local-first settings storage, synchronization, account/category ordering, analytics preferences, Quick Notes, offline behavior, and carousel ownership.

## Current Problem

`SettingsView` still behaves like the former modal Settings application after being moved into the Home carousel. Tapping Accounts, Categories, or Quick Notes pushes another full-page Settings screen, adds a second navigation bar with Back/Edit/Add/Done actions, and animates horizontally inside the already-horizontal Home carousel.

This creates two competing spatial systems:

- the Home carousel communicates Analytics → Transactions → Settings horizontally;
- Settings then introduces another horizontal stack inside the Settings slide.

The nested stack hides context, requires Back actions for routine management, and makes the Settings slide feel transplanted rather than designed for its current place.

## Information Architecture

The Settings slide becomes a single Control Center scroll surface with four ordered domains:

1. **Workspace health** — current settings/history health and high-level counts.
2. **Set up Sheetlog** — Accounts and Categories.
3. **Analytics preferences** — base currency and big-spending cutoff.
4. **Speed up logging** — Quick Notes.
5. **Data & sync** — settings reconciliation, transaction history, exchange-rate readiness, diagnostics, import, and resync actions.

The main screen has no duplicate `Settings` heading because the shared dashboard title reel already names the active slide.

## Independent Expandable Sections

Accounts, Categories, Quick Notes, and Data & sync are independently expandable. Opening one section never collapses another section. Expanded state remains mounted and is preserved when the user swipes to Analytics or Transactions and returns.

When a collapsed section opens, its section header is smoothly positioned immediately below the shared dashboard header. Reduced-motion mode performs the same positioning without animation. Collapsing a section does not force a scroll unless the browser naturally clamps the scroll position.

The expanded collection is rendered inside the Control Center rather than replacing the Control Center. There is no Settings-level Back button, screen stack, or horizontal screen transition.

## Collection Management

### Accounts

The expanded Accounts section shows every account inline. Reorder handles are always available; there is no global Edit/Done mode. Tapping an account opens its focused editor sheet. Add account opens the same editor in creation mode.

### Categories

The expanded Categories section groups Expense, Income, and Transfer categories. Each group shows its current count, rows, always-available reorder handles, and Add category action. Tapping a category opens its focused editor sheet.

### Quick Notes

The expanded Quick Notes section exposes each editable target directly:

- Expense, Income, and Transfer defaults;
- every category under its transaction type.

Each target can expand inline to show its configured Quick Notes, current `n/5` count, reorder handles, and Add Quick Note action. Category targets with no custom Quick Notes explain that logging currently falls back to that transaction type's defaults. Tapping one Quick Note opens its focused editor sheet.

## Focused Nested Editors

Concrete Account, Category, and Quick Note editing uses a controlled `DrawerNestedRoot`, following the existing Date & Time nested-drawer pattern. The editor stacks above the persistent Step Category sheet rather than replacing it.

While the editor is open:

- Step Category remains visually present underneath and retains its exact detent;
- only the top editor owns vertical dragging, backdrop dismissal, keyboard handling, and focus;
- Home carousel swiping is unavailable through the editor surface;
- the Control Center's expanded sections and scroll position remain unchanged;
- dismissing restores focus to the row or Add action that opened the editor.

Account and Category editors open at a medium detent and can expand. Quick Note editors open at the larger detent because they contain more fields and may invoke the keyboard.

## Live Persistence

The editor has a Close affordance, not Save or Done.

Discrete controls persist immediately:

- icon selection;
- preset color selection;
- custom color application;
- selects and toggles;
- reorder completion.

Text fields use local draft state and commit on blur. Closing, backdrop dismissal, or swipe-down first validates and commits the active text field before dismissal.

A compact `Saving…` / `Saved` status communicates mutation progress without blocking interaction. Unchanged values do not create mutations.

## Name Editing and Referential Integrity

Account and Category names are editable in their item editors. A valid rename updates the settings collection and updates Quick Note references so presets remain usable:

- Account rename replaces matching Quick Note `account` values and transfer `forValue` values.
- Category rename moves that category's Quick Notes configuration key to the new category name.

Historical transaction rows are not rewritten. A settings rename changes future logging choices and associated Quick Note configuration only.

## Validation and Dismissal

Account, Category, and Quick Note labels validate on blur and before every dismissal attempt.

Invalid values include:

- an empty trimmed name or label;
- a duplicate Account name, case-insensitive;
- a duplicate Category name within the same transaction type, case-insensitive;
- a Quick Note label longer than the existing 12-character limit.

When invalid:

- the error appears directly below the field with specific copy;
- the editor remains open;
- focus returns to the invalid field;
- Close, backdrop tap, and swipe-down do not dismiss;
- Revert restores the last valid saved value and clears the error.

For a new item with no saved value, Revert discards the creation draft and closes the editor.

Destructive actions are never live-saved. Deleting an Account, Category, or Quick Note requires explicit confirmation from within the focused editor.

## Analytics Preferences

Base currency and big-spending cutoff remain inline because they are simple values. Base currency saves on selection. Big-spending cutoff keeps its existing blur-commit behavior and validation. Neither opens a Settings destination screen.

## Workspace Health and Data & Sync

The health summary derives from current connectivity, settings synchronization, transaction-history synchronization, pending work, and errors.

Healthy state communicates that data is current. Pending state communicates active or queued work. Offline state explains local durability. Error state points users to the expanded Data & sync section.

The expanded Data & sync section retains the existing:

- Sync Settings action and status;
- transaction-history count, last-captured state, and Resync action;
- global and per-section diagnostics;
- conflict messages;
- offline durability copy;
- legacy Quick Notes import prompt.

No synchronization semantics or query invalidation behavior changes.

## Gesture Ownership

The Home carousel still owns ordinary horizontal gestures on the Settings background. Collection reorder handles use `data-home-carousel-swipe-lock="true"` and `touch-action: none`. Nested editor surfaces also declare the swipe-lock boundary.

The redesign removes collection swipe-to-delete because destructive actions require confirmation and a swiped-away row cannot safely recover from a cancelled confirmation.

## Accessibility

- Expanders expose `aria-expanded` and `aria-controls`.
- Expanded regions have stable IDs and accessible labels.
- The health summary uses status semantics without repeatedly announcing healthy idle state.
- Invalid fields use `aria-invalid` and `aria-describedby`.
- Drawer titles and descriptions identify the edited object and live-save behavior.
- Dismissal returns focus to the originating control.
- Reorder handles retain explicit `Drag to reorder` labels that include the item name.
- Reduced motion disables smooth auto-positioning and nonessential editor transitions.

## Component Boundaries

- `SettingsView` owns Control Center composition, section expansion state, collection order state, settings queries/mutations, health presentation, editor targets, and focus restoration.
- `SettingsControlSection` owns accessible expansion chrome and positioning hooks.
- `SettingsItemEditorDrawer` owns Account/Category draft fields, validation presentation, nested-drawer dismissal gating, live appearance controls, and confirmed deletion.
- `SettingsQuickNoteEditorDrawer` owns Quick Note draft fields, validation, nested-drawer dismissal gating, live picker commits, and confirmed deletion.
- `settingsControlCenter.ts` owns pure validation, Quick Notes grouping, and account/category rename transforms.
- Existing TanStack Query hooks remain the data boundary. A full Quick Notes configuration mutation is added so referential updates remain local-first and synchronize through the existing settings pipeline.

The large `SettingsView` may be reduced by extracting these focused units, but unrelated settings, carousel, or transaction-entry refactors are out of scope.

## Testing

Use test-driven development. Coverage must verify:

- no internal Settings page stack, Back bar, or global Edit/Done mode remains;
- Accounts and Categories can remain expanded simultaneously;
- opening a section positions its header with smooth or reduced motion behavior;
- expanded state and scroll state survive carousel inactivity because Settings remains mounted;
- reorder handles are always available and remain carousel gesture locks;
- item taps and Add actions open nested drawers rather than replacement screens;
- editors restore focus after dismissal;
- discrete changes persist immediately;
- text changes persist on blur and unchanged text does not mutate;
- invalid drafts block every dismissal path, expose an inline error, refocus the field, and can be reverted;
- Account and Category renames preserve Quick Note references;
- destructive actions require confirmation;
- Quick Notes targets and configured counts are correct without mistaking inherited defaults for custom notes;
- sync, offline, conflict, error, import, and transaction-history resync behavior remains available in Data & sync;
- Settings continues to mark its sole vertical scroll surface with `data-dashboard-scroll="true"`.

Focused Vitest coverage is followed by the full test suite, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and the mobile Home carousel Playwright flow.

## Out of Scope

- Rewriting historical transaction account/category strings after a settings rename.
- Changing Google Sheet formats or reconciliation policy.
- Redesigning Analytics, Transactions, Step Category, or the dashboard title reel.
- Adding a new dependency.
- Adding a permanent tab bar, breadcrumb, carousel indicator, or Settings route.
