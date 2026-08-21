# Step Receipt redesign prototypes

Three standalone, dependency-free HTML directions for the SheetLog transaction receipt. Each file includes light/dark theme controls and success/pending/error previews.

## Product constraints

- Step Receipt owns the full transaction canvas; the dashboard title reel is hidden.
- Use SheetLog semantic tokens rather than hard-coded one-off brand colors.
- Preserve the existing success, pending, error, reimbursement, Done, Undo, and safe-area behavior when a direction is implemented.
- Use borders, surface contrast, spacing, and typography instead of shadows.
- Keep primary controls at least 44 × 44 CSS pixels; these prototypes use 52px-tall actions.
- Announce non-error state changes through `role="status"` with `aria-atomic="true"`; use `role="alert"` for errors.

## Directions

| File | Direction | Best at | Main trade-off |
| --- | --- | --- | --- |
| `concept-a-calm-confirmation.html` | Calm confirmation | Fast reassurance and one-handed completion | Lowest detail density |
| `concept-b-digital-receipt.html` | Digital receipt | Tangibility, auditability, and familiar hierarchy | More visual treatment than the core flow |
| `concept-c-ledger-timeline.html` | Ledger timeline | Explaining offline/local/sync state precisely | Highest information density |

## Recommendation

Start production refinement from **Concept A** for ordinary transactions because it best supports SheetLog's fast-entry promise. Borrow the explicit local-versus-Sheets language from **Concept C** for reimbursement and offline states. Keep **Concept B** as the strongest option when receipt export, sharing, or audit history becomes a product requirement.

## Research basis

- Apple Human Interface Guidelines, Feedback: feedback should make current state and action results understandable; status feedback is most effective when integrated into the relevant interface. <https://developer.apple.com/design/human-interface-guidelines/feedback>
- Apple Human Interface Guidelines, Alerts: avoid interruptive alerts for information-only outcomes and communicate the information in context instead. <https://developer.apple.com/design/human-interface-guidelines/alerts>
- W3C WCAG 2.2, Target Size (Minimum): pointer targets should be at least 24 × 24 CSS pixels or have sufficient spacing; larger controls are recommended for important actions. <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- W3C WCAG 2.2, Target Size (Enhanced): 44 × 44 CSS pixels is the enhanced target size. <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced>
- W3C ARIA22: `role="status"` provides polite live updates, and explicitly setting `aria-atomic="true"` improves consistency across environments. <https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22>

## Open locally

Open any HTML file directly in a browser. There are no build steps, network requests, external fonts, or image dependencies.
