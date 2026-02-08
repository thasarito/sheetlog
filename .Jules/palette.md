## 2026-02-08 - Missing ARIA on Keypad Delete
**Learning:** The "DEL" button in the Keypad component was an icon-only button without an `aria-label`, making it completely invisible to screen readers as a "Delete" action.
**Action:** When auditing custom components like Keypads or DatePickers, specifically look for icon-only buttons that convey action but lack text alternatives.
