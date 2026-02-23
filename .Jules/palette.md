## 2025-02-23 - Keypad Accessibility & Verification

**Learning:** Icon-only buttons (like "Delete" in Keypad) lack accessible names by default, making them invisible to screen readers. Adding `aria-label` is critical. Also, verification via the landing page demo is complex due to navigation state; direct component testing or dedicated routes are preferred for such micro-interactions.
**Action:** Ensure all custom keypad/input components have `aria-label` for non-numeric keys. Use `focus-visible` ring for keyboard users.
