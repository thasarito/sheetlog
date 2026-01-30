## 2026-01-30 - Keypad Interaction Patterns
**Learning:** Native-feel keypad interaction relies heavily on `touch-manipulation` to remove tap delay and `active:scale-90` for tactile feedback, plus `select-none` to prevent accidental text selection during rapid input.
**Action:** Apply this combination (`touch-manipulation select-none active:scale-90`) to all rapid-fire input controls (like keypads, counters) in future.
