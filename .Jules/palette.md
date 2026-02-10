## 2024-05-23 - Keypad Accessibility
**Learning:** Custom keypads often lack keyboard focus states and proper ARIA labels for non-numeric keys (like Delete), making them inaccessible.
**Action:** Always add `aria-label`, `focus-visible` styles, and `touch-manipulation` to custom keypad buttons.
