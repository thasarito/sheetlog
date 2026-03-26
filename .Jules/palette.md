## 2024-05-18 - Keypad interaction and accessibility improvements
**Learning:** Standard interaction and accessibility patterns for custom keypads include `touch-manipulation` for preventing zooming on mobile, `active:scale-95` for tactile feedback, `focus-visible:ring-2 focus-visible:ring-primary` for keyboard accessibility, and `aria-label`s for non-text keys. `rounded-2xl` makes them consistent with other interactive elements.
**Action:** Always apply these standard classes and ARIA labels when creating or modifying custom numeric keypads or grids of buttons.
