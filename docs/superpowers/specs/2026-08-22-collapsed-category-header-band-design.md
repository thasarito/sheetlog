# Collapsed Category Header Band Design

## Goal

Keep the Expense, Income, and Transfer control available in the collapsed transaction-entry sheet while removing the separate vertical row beneath the sheet launcher. The collapsed sheet should become approximately 48px shorter, and the expanded category step must remain visually unchanged.

## Current Geometry

The current launcher stacks two blocks:

- a 44px expand/collapse and grab button;
- the 52px compact transaction-type control plus 12px bottom spacing.

That produces an approximately 108px launcher before the bottom safe area. The requested collapsed treatment combines both controls into a single 60px visual band, reducing the collapsed sheet by 48px.

## Layout

`CategoryStepSheet` continues to own one persistent transaction-type host. `StepCategory` continues to portal one `StepCategoryTypeTabs` instance into that host, preserving form state, focus, carousel progress, haptics, and the animated indicator across sheet states.

While collapsed and only when a transaction-type host exists:

- the launcher becomes a single explicit 60px grid band;
- the launcher button and type-tabs host share the same grid cell;
- the grab indicator occupies the top edge of the band;
- the 52px type control starts 8px below the top edge and is horizontally inset, leaving launcher hit area around it;
- the type control remains marked `data-vaul-no-drag`, while unused launcher space continues to expand or drag the sheet.

While expanded or in the keyboard state, the launcher retains its existing flow exactly: the 44px launcher button first, then the type-tabs host with its existing 12px bottom spacing.

## Measurement

The collapsed snap point is 60px plus the measured bottom safe area whenever the persistent type-tabs host is present. Sheets without that host retain their measured launcher height.

Because the collapsed launcher is physically shorter than the expanded launcher, `CategoryStepSheet` caches the last launcher height measured outside the integrated collapsed state. The expanded snap point always uses that cached expanded launcher height plus the entry content height, so collapsing cannot shorten or visually shift the expanded state.

## Interaction and Accessibility

- Preserve the launcher button's accessible name and `aria-expanded` state.
- Preserve one transaction-type fieldset with its existing label, tab buttons, pressed states, focus behavior, keyboard navigation, and haptics.
- Selecting Expense, Income, or Transfer while collapsed continues to update the form and expand the sheet through the existing click propagation behavior.
- Keep the category entry inert and hidden from assistive technology while collapsed.
- Keep the safe-area spacer immediately after the actual collapsed launcher band.
- Do not add shadows or modify the generic drawer component.

## Testing

Add focused component coverage that proves:

1. expanded state retains the current stacked launcher classes and spacing;
2. collapsed state places the launcher button and tabs host in one 60px grid band;
3. the collapsed snap point becomes 60px while the expanded snap point remains unchanged when the physical launcher changes between states;
4. the same tab DOM instance remains mounted and interactive;
5. existing no-tabs, keyboard, safe-area, accessory, lint, typecheck, and build behavior remains valid.
