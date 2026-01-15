## 2026-01-15 - Accessible Keypad Interactions
**Learning:** Custom interactive components like the `Keypad` were missing critical accessibility attributes (`aria-label`) and state feedback (`focus-visible`, `active`), making them difficult for keyboard and screen reader users.
**Action:** When creating or modifying custom button grids, always explicitly add `aria-label` for non-text buttons, and ensure `focus-visible` and `active` states are visually distinct using standard design tokens.
