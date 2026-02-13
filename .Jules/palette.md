## 2024-05-23 - Accessibility Gap in Keypad Component
**Learning:** The shared `Keypad` component used icon-only buttons (specifically "Delete") without `aria-label`, making it inaccessible to screen readers across the application.
**Action:** When auditing shared UI components, prioritize checking icon-only interactive elements for accessible names.
