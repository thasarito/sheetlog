# Four-Row Category Layout Hotfix

## Goal

Give the Transactions/Analytics section all vertical space that is not required by the category picker, while keeping the category area stable across Expense, Income, and Transfer.

## Layout

- Reserve exactly four visible category rows for every transaction type, including tabs with fewer than four populated rows.
- Keep the existing four-column grid and square category tiles.
- Divide every category tile into two equal vertical regions: center the icon in the top half and center the wrapping label in the bottom half.
- Size the category viewport from its rendered width so the four square rows remain proportional at every supported app width.
- Keep the category section at the actual app's 390 px maximum scale and center it on wider host surfaces, preventing the picker from consuming the Home carousel's usable gesture area.
- Let the Transactions/Analytics section consume the remaining height above the category picker.
- Allow categories beyond the fourth row to scroll vertically inside the category viewport, but hide the visual scrollbar.
- Keep the compact transaction-type tabs within the category section and preserve their existing spacing and Graphite Indigo theme.

## Interaction

- Preserve horizontal swipe navigation between Expense, Income, and Transfer.
- Preserve category tap and long-press behavior.
- Vertical category scrolling must continue to work through touch, mouse wheel, and keyboard-compatible browser behavior even though the scrollbar is hidden.

## Implementation Boundary

Use CSS-driven intrinsic sizing: the category carousel viewport is square because four columns of square tiles across four rows occupy the same total height as the viewport width, including the existing equal gaps. The dashboard layout gives this intrinsic category section an automatic row and assigns all remaining space to Transactions/Analytics. Do not add JavaScript resize measurement or fixed pixel heights.

## Verification

- Add a regression test that fails under the current one-quarter/three-quarter dashboard split and passes when the activity section receives the remaining height.
- Test that the category viewport reserves four rows and hides its scrollbar without disabling scrolling.
- Re-run the TransactionFlow tests, lint, typecheck, and relevant browser tests.
- Capture updated light and Graphite Indigo screenshots at the actual app viewport scale.
- Commit and push the hotfix and refreshed screenshots to the existing pull request.
