## 2024-05-18 - Keypad Button Accessibility
**Learning:** Number pad buttons need individual `aria-label`s for non-numeric keys (like DEL and .) to ensure screen reader users understand the action, and standard interaction states (`touch-manipulation`, `active:scale-95`, `focus-visible:ring-2`) enhance tactile feedback on mobile.
**Action:** Applied standard focus, active, and aria-label attributes to Keypad buttons to align with the rest of the application's accessible interaction standards.
