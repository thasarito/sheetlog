## 2024-05-22 - Keypad Accessibility
**Learning:** Icon-only buttons (like DEL in keypads) are often invisible to screen readers without explicit `aria-label`. PWA touch targets benefit significantly from `active:scale` feedback and `touch-manipulation`.
**Action:** Always check custom keypad implementations for proper ARIA labels and touch feedback states.
