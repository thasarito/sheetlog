## 2024-03-04 - [Button Interaction Standard]
**Learning:** Common elements like buttons and keypad keys require specific styles for a high-quality tactile feel across devices, combined with accessible focus states.
**Action:** Always apply the following combination of classes to interactive buttons: `rounded-2xl`, `touch-manipulation`, `active:scale-95`, `focus-visible:outline-none`, `focus-visible:ring-2`, and `focus-visible:ring-primary`. Ensure icon-only or special symbol buttons (like 'DEL' or '.') have clear `aria-label`s.
