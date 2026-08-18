# Collapsed StepCategory Tabs Design

## Goal

Make the collapsed transaction-entry sheet recognizable as the category step by replacing the “Log transaction” label with the existing Expense, Income, and Transfer tab strip.

## Interaction

- The collapsed launcher keeps the existing drag/expand handle at the top.
- Directly below the handle, it shows the same compact Expense, Income, and Transfer tabs used by the expanded category step.
- The tabs remain interactive while the sheet is collapsed. Selecting a type keeps the sheet collapsed, updates the shared transaction form, clears the selected category, and clears place data when the new type is not Expense, matching the expanded category-step behavior.
- Tapping the handle expands the sheet. Dragging the Vaul sheet continues to switch between its collapsed and expanded snap points.
- The text “Log transaction” is removed from the collapsed state.

## Architecture

Extract the compact transaction-type tab presentation into a focused reusable component. The expanded `StepCategory` instance and the collapsed launcher each render that component, but both read and update the same transaction form state. Only the visible instance is interactive: the expanded entry remains inert and hidden from assistive technology while collapsed, and the collapsed tab strip is absent while expanded.

`CategoryStepSheet` accepts a collapsed-controls node and measures the launcher after those controls are rendered, so the Vaul collapsed snap point naturally includes the handle, tabs, and safe-area inset. The handle is a separate button from the tab buttons, avoiding nested interactive elements.

## Accessibility and Styling

- Preserve the existing tab buttons, labels, icons, pressed state, focus treatment, and compact animated indicator.
- Preserve the handle’s `aria-expanded` state and expand/collapse accessible labels.
- Do not add shadows.
- Keep the collapsed controls within the existing sheet surface and safe-area behavior.

## Testing

- Update the `CategoryStepSheet` component test to prove that the collapsed state removes “Log transaction,” exposes the supplied controls, and still expands from the handle.
- Add focused coverage for collapsed type selection so the form state and dependent fields follow the same rules as the expanded tabs.
- Update the home-carousel browser test to assert that the tab strip is visible when StepCategory is collapsed and the old label is absent.
- Run focused unit and browser tests before the full lint, typecheck, unit, build, and Playwright suites.

## Screenshot and Delivery

Capture the collapsed sheet with the Analytics carousel visible behind it and the Expense, Income, and Transfer tabs visible in the launcher. Inspect the image, commit it under the repository documentation screenshots, push the feature branch, and create a pull request whose body embeds the screenshot. Monitor the pull-request checks until CI passes.
