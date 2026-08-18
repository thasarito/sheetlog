# Collapsed Category Tap-to-Expand Design

## Goal

Make the collapsed transaction-entry launcher behave as one reveal surface: tapping its handle, transaction-type tabs, or unused launcher space expands `StepCategory`. Keep the Expense, Income, and Transfer control visually identical between collapsed and expanded states.

## Interaction

- A genuine click or tap anywhere inside the collapsed launcher expands the category entry sheet.
- A transaction-type tab still performs its existing type selection before the collapsed controls unmount, so one tap both selects the type and reveals its categories.
- The expanded handle continues to collapse the sheet.
- Drag gestures remain owned by Vaul; the new behavior listens for the resulting click rather than pointer movement.
- Launcher expansion runs in the click bubble phase so nested controls commit their own action first.

## Styling and Accessibility

- Reduce the visible grip from 48×6px to 32×4px.
- Use the same 44px handle slot in both states while preserving its accessible label, expanded state, and focus treatment.
- Render the shared type tabs at the same horizontal position, width, and height in both states; do not add a collapsed-only gutter.
- When expansion removes a focused collapsed control, move focus to the persistent expanded handle instead of letting it fall back to the document body.
- Do not add shadows.

## Testing

- Prove a nested collapsed control runs its own action and expands the sheet.
- Prove keyboard activation restores focus to the expanded handle.
- Prove a click on otherwise unused launcher space expands the sheet.
- Assert the smaller grip classes while retaining the minimum touch-target class.
- Compare expanded and collapsed tab geometry in the browser.
- Run the focused component and browser coverage, then the repository lint, typecheck, unit, and build checks before pushing.
