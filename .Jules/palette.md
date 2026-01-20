## 2024-05-23 - Icon-only Button Accessibility
**Learning:** Several core components (Keypad, TransactionFlow) use icon-only buttons without aria-labels, making them inaccessible to screen readers.
**Action:** Always verify `aria-label` on icon-only buttons, specifically checking for conditional rendering where text might be replaced by an icon (like "DEL" key).
