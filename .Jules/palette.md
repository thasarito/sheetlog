## 2024-05-12 - Custom Keypad Accessibility
**Learning:** Custom keypads require explicit ARIA labels for non-numeric keys (like "DEL" or ".") and benefit significantly from interaction styles (`touch-manipulation`, `active:scale-95`, and visible focus rings) to match standard device keypad expectations.
**Action:** Always add semantic `aria-label`s and interaction states (`active:`, `focus-visible:`) when implementing custom numerical input pads to assure accessibility and a tactile feel.
