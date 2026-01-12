## 2024-05-22 - Accessibility for Icon-Only Buttons
**Learning:** Icon-only buttons (like Keypad delete and Transaction delete) are completely invisible to screen readers without `aria-label`. They often get announced as just "button" or nothing, leaving users guessing.
**Action:** Always verify icon-only buttons have an `aria-label` or `sr-only` text during implementation.
