## 2024-05-18 - Keypad Button Accessibility and Interaction
**Learning:** Number pad buttons require both clear ARIA labels (e.g. mapping "DEL" to "Delete" and "." to "Decimal point") and specific interaction classes (`touch-manipulation`, `active:scale-95`) to feel responsive and be fully accessible on touch devices.
**Action:** Always add explicit `aria-label`s to custom keypad/keyboard components, and ensure they have adequate hit states (active scaling, touch manipulation, focus rings).
