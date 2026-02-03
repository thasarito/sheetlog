## 2025-02-03 - [Tactile Numeric Keypad]
**Learning:** For touch-first numeric inputs (like keypads), standard button feedback is insufficient. Users expect physical-like response.
**Action:** Always combine `active:scale-90` (or similar transform), `touch-manipulation`, and `select-none` on rapid-fire touch targets to mimic native keypad feel and prevent accidental zooming/selection.
