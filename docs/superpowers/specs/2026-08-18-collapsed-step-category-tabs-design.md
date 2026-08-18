# Collapsed StepCategory Tabs Design

## Goal

Make the collapsed transaction-entry sheet recognizable as the category step by replacing the “Log transaction” label with the existing Expense, Income, and Transfer tab strip.

## Interaction

- The collapsed launcher keeps the existing drag/expand handle at the top.
- Directly below the handle, it shows the same compact Expense, Income, and Transfer tabs used by the expanded category step.
- The tabs remain interactive while the sheet is collapsed. Selecting a type updates the normal category carousel and expands the sheet in the same tap, clearing dependent form fields exactly as it does while expanded.
- Tapping the handle expands the sheet. Dragging the Vaul sheet continues to switch between its collapsed and expanded snap points.
- The text “Log transaction” is removed from the collapsed state.

## Architecture

Extract the compact transaction-type tab presentation into a focused reusable component, but render it only once: `StepCategory` owns its normal `StepCategoryTypeTabs` instance and portals it into an always-mounted host in the sheet launcher. The same DOM instance, carousel progress, focus, and form state therefore remain active across both sheet states. The category grid stays in the entry region and becomes inert and hidden from assistive technology while collapsed; the portaled tabs do not.

`CategoryStepSheet` exposes the persistent tabs host and measures the launcher after the portal is rendered, so the Vaul collapsed snap point naturally includes the handle, tabs, and safe-area inset. The handle is a separate button from the tab buttons, avoiding nested interactive elements.

## Accessibility and Styling

- Preserve the existing tab buttons, labels, icons, pressed state, focus treatment, and compact animated indicator.
- Preserve the handle’s `aria-expanded` state and expand/collapse accessible labels.
- Do not add shadows.
- Keep the collapsed controls within the existing sheet surface and safe-area behavior.

## Testing

- Update the `CategoryStepSheet` component test to prove that the collapsed state removes “Log transaction,” preserves the exact same tab DOM instance, and still expands from the handle.
- Add focused coverage for collapsed type selection so the form state and dependent fields follow the same rules as the expanded tabs.
- Update the home-carousel browser test to assert that exactly one tab strip remains visible and focused across expansion, and the old label is absent.
- Run focused unit and browser tests before the full lint, typecheck, unit, build, and Playwright suites.

## Screenshot and Delivery

Capture the collapsed sheet with the Analytics carousel visible behind it and the Expense, Income, and Transfer tabs visible in the launcher. Inspect the image, verify the implementation, and push the requested change directly to `origin/main`.
