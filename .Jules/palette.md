## 2026-02-11 - Accessible Keypad Interactions
**Learning:** Custom keypads, like those used for amount entry, are often overlooked for accessibility, missing critical `aria-label`s for icon-only keys (like "DEL") and failing to provide tactile feedback for touch users.
**Action:** When implementing custom grids of buttons, always include `active:scale-95` for touch feedback and ensure every icon-only button has a descriptive `aria-label`.
