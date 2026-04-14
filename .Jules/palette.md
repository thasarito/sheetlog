## 2024-04-14 - Keypad Button Accessibility
**Learning:** Found that custom numeric keypads lacking dynamic ARIA labels (e.g. translating "DEL" to "Delete") and proper focus-visible/active states impair screen reader accessibility and touch interaction.
**Action:** When implementing custom key components, explicitly map symbols to semantic ARIA labels, and apply standard `rounded-2xl`, `touch-manipulation`, `active:scale-95`, and `focus-visible` classes to ensure parity with standard input fields.
