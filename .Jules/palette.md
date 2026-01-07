## 2024-05-23 - Accessibility Improvements
**Learning:** Icon-only buttons are a common accessibility trap. Screen readers need `aria-label` to provide context.
**Action:** Always check `StepAmount.tsx` and `Keypad.tsx` (and similar components) for icon-only buttons and add `aria-label`.
