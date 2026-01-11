## 2024-05-23 - Keypad Accessibility
**Learning:** Icon-only buttons (like "Delete") are invisible to screen readers without explicit `aria-label`s.
**Action:** Always verify icon-only buttons have descriptive `aria-label` or `title` attributes.

## 2024-05-23 - Interaction Feedback
**Learning:** Adding `:active` states (e.g., `active:bg-muted`) provides essential tactile feedback for touch users on mobile PWAs.
**Action:** Include `active:` styles on all interactive elements, especially custom keypads or controls.
