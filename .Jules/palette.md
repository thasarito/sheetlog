## 2026-01-13 - Keypad Accessibility
**Learning:** Icon-only buttons in custom keypads (like the Delete key) are completely invisible to screen readers without explicit ARIA labels.
**Action:** Always add `aria-label` to non-text keys in custom input components.
