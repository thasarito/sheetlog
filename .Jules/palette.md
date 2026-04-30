
## 2024-05-18 - Keypad Accessibility & Tactile Feedback
**Learning:** Interactive number pads require explicit `aria-label`s for non-numeric keys (like Delete and Decimal point) because screen readers struggle with icon-only buttons or symbol-only text nodes. They also benefit significantly from `active:scale-95` tactile feedback to feel responsive, especially on mobile devices.
**Action:** Always verify that every custom key in a Keypad component maps to a clear `aria-label` and ensure consistent interaction classes (e.g. `active:scale-95`, `touch-manipulation`, `rounded-2xl`, `focus-visible:ring-2`) are present.
